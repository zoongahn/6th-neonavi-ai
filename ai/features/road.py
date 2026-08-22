"""공공데이터 공간조인 특성 — road_type · speed_limit · signal_count.

설계: docs/A5_공공데이터_설계.md
- 노드링크(MOCT_LINK, EPSG:5186): road_type(고속비율)·speed_limit(제한속도 가중평균)
- 신호등 표준데이터(WGS84 CSV): signal_count(신호교차로 밀도 개/km)
- 경로 좌표(WGS84)를 EPSG:5186(m)로 재투영 후 미터 단위 버퍼·교차.
- 전국 데이터 → 수도권 bbox 필터 + STRtree 인덱스, 파생결과 캐시(재계산 방지).

스택: pyshp + shapely(2.x) + pyproj (geopandas 안 씀).
"""
import csv
import os
import pickle

import shapefile  # pyshp
from pyproj import Transformer
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

_HERE = os.path.dirname(os.path.abspath(__file__))
_PUBLIC = os.path.join(_HERE, '..', 'data', 'public')
_DERIVED = os.path.join(_PUBLIC, 'derived')
_LINK_SHP = os.path.join(_PUBLIC, 'nodelink', 'LINK', 'MOCT_LINK')
_SIGNAL_CSV = os.path.join(_PUBLIC, 'signal', 'output', '전국신호등_전체원본.csv')

# 수도권 bbox(WGS84) — 수집 bbox(collect.py) + 여유. 필요시 확장.
BBOX_LNGLAT = (126.60, 37.10, 127.40, 37.80)  # (min_lng, min_lat, max_lng, max_lat)

HIGHWAY_RANKS = {101, 102}       # 고속국도·도시고속 → sports '고속도로'
VEHICLE_SIGNAL_SE = {1, 3, 4}    # tfclghtSe: 차량등·차량보조·버스등 (int 정규화)
SIGNAL_CLUSTER_M = 40.0          # 신호등 head → 교차로 클러스터 격자 크기(m)
LINK_BUFFER_M = 15.0             # 경로-링크 매칭 버퍼
SIGNAL_BUFFER_M = 25.0           # 경로-신호교차로 근접 버퍼

_to5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)


def _bbox_5186():
    xs, ys = [], []
    for lng in (BBOX_LNGLAT[0], BBOX_LNGLAT[2]):
        for lat in (BBOX_LNGLAT[1], BBOX_LNGLAT[3]):
            x, y = _to5186.transform(lng, lat)
            xs.append(x); ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def _norm_int(v):
    try:
        return int(str(v).strip())
    except (ValueError, TypeError):
        return None


# ── 전처리 빌드 (한 번, 캐시) ─────────────────────────────────────

def _derived_dir() -> str:
    """파생본이 있는 곳. 배포에서는 번들에 없을 수 있어 그때 받아 온다."""
    from ..fetch_data import ensure
    return os.path.join(ensure(), 'public', 'derived')


def build_link_index(force=False):
    """수도권 LINK를 필터→(LineString[5186], road_rank, max_spd) 리스트로 캐시."""
    cache = os.path.join(_derived_dir(), 'links_5186.pkl')
    if os.path.exists(cache) and not force:
        with open(cache, 'rb') as f:
            return pickle.load(f)
    bx0, by0, bx1, by1 = _bbox_5186()
    r = shapefile.Reader(_LINK_SHP, encoding='cp949')
    fld = [f[0] for f in r.fields[1:]]
    i_rank, i_spd = fld.index('ROAD_RANK'), fld.index('MAX_SPD')
    links = []
    for sh, rec in zip(r.iterShapes(), r.iterRecords()):
        # shape.bbox(5186)로 조기 필터
        try:
            x0, y0, x1, y1 = sh.bbox
        except Exception:
            continue
        if x1 < bx0 or x0 > bx1 or y1 < by0 or y0 > by1:
            continue
        pts = sh.points
        if len(pts) < 2:
            continue
        rank = _norm_int(rec[i_rank])
        spd = _norm_int(rec[i_spd]) or 0
        links.append((LineString(pts), rank, spd))
    os.makedirs(_DERIVED, exist_ok=True)
    with open(cache, 'wb') as f:
        pickle.dump(links, f)
    return links


def build_signal_intersections(force=False):
    """차량신호를 필터→격자 클러스터(교차로)→중심점[5186] 리스트로 캐시."""
    cache = os.path.join(_derived_dir(), 'signal_nodes_5186.pkl')
    if os.path.exists(cache) and not force:
        with open(cache, 'rb') as f:
            return pickle.load(f)
    lo_lng, lo_lat, hi_lng, hi_lat = BBOX_LNGLAT
    cells = {}  # (gx,gy) -> [ (x,y), ... ]
    with open(_SIGNAL_CSV, encoding='utf-8-sig', errors='replace') as f:
        for row in csv.DictReader(f):
            if _norm_int(row.get('tfclghtSe')) not in VEHICLE_SIGNAL_SE:
                continue
            try:
                lat = float(row['latitude']); lng = float(row['longitude'])
            except (ValueError, KeyError, TypeError):
                continue
            if not (lo_lng <= lng <= hi_lng and lo_lat <= lat <= hi_lat):
                continue
            x, y = _to5186.transform(lng, lat)
            key = (int(x // SIGNAL_CLUSTER_M), int(y // SIGNAL_CLUSTER_M))
            cells.setdefault(key, []).append((x, y))
    nodes = [(sum(p[0] for p in ps) / len(ps), sum(p[1] for p in ps) / len(ps))
             for ps in cells.values()]
    os.makedirs(_DERIVED, exist_ok=True)
    with open(cache, 'wb') as f:
        pickle.dump(nodes, f)
    return nodes


# ── 조회 인덱스 (경로별 쿼리) ─────────────────────────────────────

class PublicIndex:
    """LINK·신호교차로 STRtree. 프로세스당 1회 생성해 모든 경로에 재사용."""

    def __init__(self, force=False):
        self.links = build_link_index(force)
        self.link_tree = STRtree([g for g, _, _ in self.links])
        self.nodes = build_signal_intersections(force)
        self.node_pts = [Point(x, y) for x, y in self.nodes]
        self.node_tree = STRtree(self.node_pts)

    def _line_5186(self, coords_lnglat):
        pts = [self._xy(lng, lat) for lng, lat in coords_lnglat]
        return LineString(pts) if len(pts) >= 2 else None

    @staticmethod
    def _xy(lng, lat):
        return _to5186.transform(lng, lat)

    # 도로 결합 비용은 경로 길이에 비례한다(주변 세그먼트 수 ∝ 길이).
    # 400km(고양→부산)에서 shapely intersection 이 62만 번 → 87초 → 서버리스
    # 60초 한도 초과로 추천이 통째로 죽었다. 이 특성들(고속비율·제한속도·신호밀도)은
    # 길이 가중 **평균**이라, 긴 경로는 균등 간격 대표 구간만 봐도 통계가 유지된다.
    SAMPLE_OVER_KM = 60.0      # 이 길이까지는 전 구간 계산 (수도권 O-D 는 전부 해당)
    SAMPLE_WINDOWS = 24        # 초과 시: 균등 분포한 창 24개
    SAMPLE_WIN_KM = 2.0        #        × 각 2km = 48km 분량만 계산

    def _sample_line(self, line):
        """장거리 경로를 균등 간격 대표 구간들로 줄인 MultiLineString 로."""
        from shapely.ops import substring
        from shapely.geometry import MultiLineString
        total = line.length
        win = self.SAMPLE_WIN_KM * 1000.0
        step = total / self.SAMPLE_WINDOWS
        parts = []
        for i in range(self.SAMPLE_WINDOWS):
            start = i * step
            seg = substring(line, start, min(start + win, total))
            if seg.length > 0:
                parts.append(seg)
        return MultiLineString(parts)

    def route_features(self, coords_lnglat) -> dict:
        """경로 좌표(WGS84 [(lng,lat)...]) → {road_type, speed_limit, signal_count}."""
        line = self._line_5186(coords_lnglat)
        if line is None or line.length <= 0:
            return {'road_type': 0.0, 'speed_limit': 0.0, 'signal_count': 0.0}
        dist_km = line.length / 1000.0

        sampled = line
        sampled_km = dist_km
        if dist_km > self.SAMPLE_OVER_KM:
            sampled = self._sample_line(line)
            sampled_km = sampled.length / 1000.0

        corridor = sampled.buffer(LINK_BUFFER_M)

        tot = hw = spd_w = 0.0
        for idx in self.link_tree.query(corridor):
            g, rank, spd = self.links[idx]
            inter = g.intersection(corridor)
            w = inter.length
            if w <= 0:
                continue
            tot += w
            spd_w += spd * w
            if rank in HIGHWAY_RANKS:
                hw += w
        road_type = hw / tot if tot else 0.0
        speed_limit = spd_w / tot if tot else 0.0

        # 신호 밀도(개/km)도 같은 샘플 구간에서 센다 — 밀도라 분모도 샘플 길이.
        sig_corridor = sampled.buffer(SIGNAL_BUFFER_M)
        n_sig = sum(1 for idx in self.node_tree.query(sig_corridor)
                    if self.node_pts[idx].within(sig_corridor))
        signal_count = n_sig / sampled_km if sampled_km > 0 else 0.0

        return {'road_type': road_type, 'speed_limit': speed_limit,
                'signal_count': signal_count}


_INDEX = None


def get_index(force=False) -> PublicIndex:
    """전역 싱글턴 인덱스(최초 호출 시 빌드/캐시 로드)."""
    global _INDEX
    if _INDEX is None or force:
        _INDEX = PublicIndex(force=force)
    return _INDEX
