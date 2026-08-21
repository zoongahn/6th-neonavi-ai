"""경로 좌표로부터 경사(오르막) 특성을 계산한다.

지도 API는 고도를 안 주므로 고도 데이터로 인접 점 고도차/거리(=grade)를 계산한다.
- 1차: **로컬 SRTMGL1 DEM**(임세희 제공 .hgt.zip, `ai/data/public/dem`) — 쿼터·throttle 없음.
- fallback: 타일 밖 좌표만 Open Topo Data(srtm30m, 100좌표/요청·1000회/일). https://www.opentopodata.org/

캐싱 필수: 좌표(반올림)별 고도를 디스크(ai/data/elevation_cache.json)에 저장해
경로 간 공유 도로/재수집 시 재사용 → API 호출 최소화.
"""
import array
import json
import math
import os
import sys
import zipfile

import requests

OPENTOPO_URL = 'https://api.opentopodata.org/v1/srtm30m'
_MAX_LOCS = 100  # Open Topo Data 요청당 최대 좌표
_PREC = 4        # 캐시 키 좌표 반올림 자리(~11m)

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
_CACHE_PATH = os.path.join(_DATA_DIR, 'elevation_cache.json')
_cache = None
_cache_writable = True     # 읽기전용 FS 를 만나면 False (경고 1회만)

# ── 로컬 DEM (SRTMGL1 .hgt.zip, 임세희 제공) — hosted API 쿼터 회피 ──
_DEM_DIR = os.path.join(_DATA_DIR, 'public', 'dem', 'raw_dem')
_SRTM_N = 3601          # SRTMGL1 = 1 arc-sec, 3601×3601
_VOID = -32768
_tiles = {}             # (tlat, tlng) -> array('h') | None(타일 없음)


def _load_tile(tlat: int, tlng: int):
    """1°×1° SRTMGL1 타일 → int16 배열(캐시). 없으면 None."""
    key = (tlat, tlng)
    if key in _tiles:
        return _tiles[key]
    path = os.path.join(_DEM_DIR, f'N{tlat:02d}E{tlng:03d}.SRTMGL1.hgt.zip')
    if not os.path.exists(path):
        _tiles[key] = None
        return None
    with zipfile.ZipFile(path) as z:
        member = next(n for n in z.namelist() if n.lower().endswith('.hgt'))
        data = z.read(member)
    a = array.array('h')
    a.frombytes(data)
    if sys.byteorder == 'little':   # .hgt 는 big-endian
        a.byteswap()
    _tiles[key] = a
    return a


def _local_elevation(lng: float, lat: float):
    """로컬 DEM 타일에서 고도(m). 타일 없거나 void면 None. (nearest sample)"""
    tlat, tlng = math.floor(lat), math.floor(lng)
    a = _load_tile(tlat, tlng)
    if a is None:
        return None
    row = min(max(round((tlat + 1 - lat) * 3600), 0), _SRTM_N - 1)  # 0행=북단
    col = min(max(round((lng - tlng) * 3600), 0), _SRTM_N - 1)
    v = a[row * _SRTM_N + col]
    return None if v == _VOID else float(v)


# ── 고도 캐시 ──────────────────────────────────────────────────────

def _cache_path() -> str:
    """고도 캐시 위치. 배포에서는 번들에 없을 수 있어 그때 받아 온다."""
    try:
        from ..fetch_data import ensure
        return os.path.join(ensure(), 'elevation_cache.json')
    except Exception:
        return _CACHE_PATH


def _load_cache() -> dict:
    global _cache
    if _cache is None:
        try:
            with open(_cache_path(), encoding='utf-8') as f:
                _cache = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            _cache = {}
    return _cache


def _save_cache() -> None:
    """고도 캐시를 디스크에 남긴다. 실패해도 추천을 막지 않는다.

    ⚠️ 서버리스(Vercel 등)는 파일시스템이 읽기전용이라 여기서 터진다. 캐시는
    다음 요청을 빠르게 하려는 최적화일 뿐이므로, 못 쓰면 메모리 캐시만 쓰고
    넘어간다(그 인스턴스가 살아 있는 동안은 여전히 효과가 있다).
    """
    if _cache is None:
        return
    try:
        os.makedirs(_DATA_DIR, exist_ok=True)
        with open(_CACHE_PATH, 'w', encoding='utf-8') as f:
            json.dump(_cache, f)
    except OSError as exc:
        global _cache_writable
        if _cache_writable:
            _cache_writable = False       # 매 요청마다 같은 경고를 찍지 않는다
            print(f'고도 캐시를 저장할 수 없습니다(읽기전용 파일시스템?): {exc}')


def _key(lng: float, lat: float) -> str:
    return f'{round(lng, _PREC)},{round(lat, _PREC)}'


# ── 고도 조회 ──────────────────────────────────────────────────────

def _query_api(points: list) -> list:
    """[(lng,lat)] (≤100) → [고도(m) or None]. 1회 배치."""
    locations = '|'.join(f'{lat},{lng}' for lng, lat in points)
    try:
        resp = requests.get(OPENTOPO_URL, params={'locations': locations}, timeout=30)
        resp.raise_for_status()
        return [r.get('elevation') for r in resp.json().get('results', [])]
    except (requests.RequestException, ValueError, KeyError):
        return [None] * len(points)


def get_elevations(points: list) -> list:
    """좌표별 고도(m). 캐시 우선, 미스 좌표만 배치 조회 후 캐시 갱신.

    Args: points [(lng, lat), ...]
    Returns: [고도(m) or None, ...] (points 와 동일 길이/순서)
    """
    cache = _load_cache()
    keys = [_key(lng, lat) for lng, lat in points]

    missing = [(k, pt) for k, pt in zip(keys, points) if k not in cache]

    # 1) 로컬 DEM 우선 (쿼터·throttle 없음)
    remote = []
    for k, pt in missing:
        e = _local_elevation(*pt)
        if e is not None:
            cache[k] = e
        else:
            remote.append((k, pt))

    # 2) 타일 밖 좌표만 hosted API fallback (배치)
    for i in range(0, len(remote), _MAX_LOCS):
        chunk = remote[i:i + _MAX_LOCS]
        elevs = _query_api([pt for _, pt in chunk])
        for (k, _), e in zip(chunk, elevs):
            cache[k] = e
    if missing:
        _save_cache()

    return [cache.get(k) for k in keys]


def fetch_elevations(coords):
    """하위호환: 좌표 리스트 고도 조회(≤100)."""
    return get_elevations(list(coords)[:_MAX_LOCS])


# ── 경사 계산 ──────────────────────────────────────────────────────

def _haversine_m(a, b) -> float:
    (lng1, lat1), (lng2, lat2) = a, b
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def _downsample(coords: list, n: int) -> list:
    if len(coords) <= n:
        return list(coords)
    step = (len(coords) - 1) / (n - 1)
    return [coords[round(i * step)] for i in range(n)]


def route_slope(coords) -> dict:
    """경로 좌표 → 경사 지표.

    coords: [(lng, lat), ...]. 다운샘플(≤100) → 고도 조회 → 구간 |grade| 거리가중.
    grade = |Δ고도| / 수평거리 (무단위, 0.05 = 5%).
    Returns: {'mean': 거리가중 평균 |grade|, 'max': 최대 |grade|, 'climb_m': 총 상승고도}.
    """
    empty = {'mean': 0.0, 'max': 0.0, 'climb_m': 0.0}
    pts = _downsample(list(coords), _MAX_LOCS)
    if len(pts) < 2:
        return empty
    elevs = get_elevations(pts)

    grades, weights, climb = [], [], 0.0
    for i in range(len(pts) - 1):
        e0, e1 = elevs[i], elevs[i + 1]
        if e0 is None or e1 is None:
            continue
        run = _haversine_m(pts[i], pts[i + 1])
        if run <= 0:
            continue
        de = e1 - e0
        grades.append(abs(de) / run)
        weights.append(run)
        if de > 0:
            climb += de

    if not grades:
        return empty
    mean = sum(g * w for g, w in zip(grades, weights)) / sum(weights)
    return {'mean': mean, 'max': max(grades), 'climb_m': climb}
