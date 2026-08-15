"""카카오 길찾기 어댑터 — O-D → 실경로 pool 수집.

설계·근거: docs/경로수집_설계.md
- 한 번 호출은 보통 1경로 → priority 다중 + 경유지 수직 교란으로 pool 확대.
- 격자 Jaccard 로 중복(같은 길) 제거.
- mode='collect'(전부, 학습 수집) / mode='serve'(우회 cap, top-N, 서빙).

CandidateRoute 필드는 schema.py 계약을 따른다.
"""
from __future__ import annotations

import math
import os

import requests

from ..schema import CandidateRoute

KAKAO_URL = "https://apis-navi.kakaomobility.com/v1/directions"
# 미래 운행 정보 — 같은 응답 구조에 departure_time 만 추가로 받는다(무료 5,000건/일).
KAKAO_FUTURE_URL = "https://apis-navi.kakaomobility.com/v1/future/directions"


# ── 설정/인증 ──────────────────────────────────────────────────────

def _load_env() -> None:
    """의존성 없이 repo_root/.env 에서 KAKAO_REST_API_KEY 주입."""
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_path = os.path.join(repo_root, ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _headers() -> dict:
    _load_env()
    key = os.environ.get("KAKAO_REST_API_KEY", "")
    if not key:
        raise RuntimeError("KAKAO_REST_API_KEY 없음 — .env 에 설정하세요.")
    return {"Authorization": f"KakaoAK {key}"}


# ── 좌표 유틸 ──────────────────────────────────────────────────────

def _pt(p) -> tuple[float, float]:
    """(lng, lat) 튜플/리스트 또는 'lng,lat' 문자열 → (lng, lat) float."""
    if isinstance(p, str):
        x, y = p.split(",")
        return float(x), float(y)
    return float(p[0]), float(p[1])


def _fmt(p) -> str:
    x, y = _pt(p)
    return f"{x},{y}"


# ── 호출 ───────────────────────────────────────────────────────────

def _call(origin, dest, priority="RECOMMEND", waypoint=None, timeout=10,
          departure_time=None, errors=None) -> list[dict]:
    """카카오 1회 호출 → result_code==0 인 raw route dict 리스트.

    departure_time(YYYYMMDDHHMM)을 주면 미래 운행 정보 엔드포인트로 보낸다.
    ⚠️ 과거 시각이면 카카오가 **에러 없이 현재 기준으로 답한다**. 기능이 도는 것처럼
    보이면서 결과만 틀리므로, 미래인지 확인한 값만 넘길 것
    (backend apps/routes/services.parse_departure_time 이 담당).

    errors: 리스트를 주면 실패 사유 (result_code, result_msg) 를 담아준다.
    실패를 조용히 버리면 호출자가 '경로 없음' 말고는 아무것도 말해줄 수 없다.
    예: 산 정상을 출발지로 찍으면 102 '시작 지점 주변의 도로를 탐색할 수 없음'.
    """
    params = {
        "origin": _fmt(origin),
        "destination": _fmt(dest),
        "priority": priority,
        "alternatives": "true",
        "road_details": "true",
    }
    if waypoint is not None:
        params["waypoints"] = _fmt(waypoint)
    url = KAKAO_URL
    if departure_time:
        url = KAKAO_FUTURE_URL
        params["departure_time"] = departure_time
    try:
        resp = requests.get(url, headers=_headers(), params=params, timeout=timeout)
    except requests.RequestException as exc:
        if errors is not None:
            errors.append((None, f"길찾기 서버에 연결하지 못했습니다: {exc}"))
        return []
    if resp.status_code != 200:
        if errors is not None:
            errors.append((resp.status_code, f"길찾기 응답 오류 (HTTP {resp.status_code})"))
        return []

    ok = []
    for r in resp.json().get("routes", []):
        code = r.get("result_code")
        if code == 0:
            ok.append(r)
        elif errors is not None:
            errors.append((code, r.get("result_msg", "")))
    return ok


# ── 파싱 & 중복제거 ────────────────────────────────────────────────

def _parse(route: dict, rid: str) -> CandidateRoute:
    """raw route dict → CandidateRoute.

    ⚠️ `guide.road_index` 는 **섹션 안에서 0부터 다시 시작한다.** 경유지를 넣어
    부른 경로(우리 pool 확대 방식)는 섹션이 2개라, 그냥 이어붙이면 두 번째
    섹션의 인덱스가 통째로 어긋난다. 여기서 폴리라인상 위치(`coord_index`)로
    바꿔 두면 소비하는 쪽은 섹션 구조를 몰라도 된다.
    """
    s = route.get("summary", {})
    coords: list[tuple[float, float]] = []
    roads: list[dict] = []
    guides: list[dict] = []
    for sec in route.get("sections", []):
        starts: list[int] = []   # 이 섹션 road i 가 coords 어디서 시작하는지
        for road in sec.get("roads", []):
            starts.append(len(coords))
            v = road.get("vertexes", [])
            for i in range(0, len(v) - 1, 2):
                coords.append((v[i], v[i + 1]))
            roads.append({
                "name": road.get("name", ""),
                "distance": road.get("distance", 0),
                "traffic_speed": road.get("traffic_speed"),
                "traffic_state": road.get("traffic_state"),
            })
        for g in sec.get("guides", []):
            ri = g.get("road_index", -1)
            guides.append({
                **g,
                "coord_index": starts[ri] if 0 <= ri < len(starts) else max(0, len(coords) - 1),
            })
    return CandidateRoute(
        id=rid,
        coords=coords,
        distance_km=s.get("distance", 0) / 1000.0,
        duration_min=s.get("duration", 0) / 60.0,
        toll=float((s.get("fare") or {}).get("toll", 0) or 0),
        guides=guides,
        roads=roads,
        bound=s.get("bound", {}) or {},
    )


def _cells(route: CandidateRoute, prec: int = 3) -> set:
    """경로가 지나는 ~100m 격자 집합 (prec=3 → 소수 3자리)."""
    return {(round(x, prec), round(y, prec)) for x, y in route.coords}


def _jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if (a or b) else 0.0


# ── 공개 API ───────────────────────────────────────────────────────

def fetch_pool(
    origin,
    destination,
    mode: str = "collect",
    priorities=("RECOMMEND", "DISTANCE"),
    waypoint_fracs=(1 / 3, 1 / 2, 2 / 3),
    waypoint_mags=(0.012,),
    dedupe_threshold: float = 0.8,
    serve_detour: float = 1.5,
    serve_top: int = 5,
    departure_time=None,
    errors=None,
) -> list[CandidateRoute]:
    """O-D → 중복 제거된 후보 경로 리스트.

    mode='collect' : 우회 제한 없이 전부 (학습 수집, 다양성 최대) — 현재 기본.
    mode='serve'   : best 시간의 serve_detour 배 이내, 시간 오름차순 top serve_top (서빙).

    departure_time : YYYYMMDDHHMM (미래). 주면 그 시각 기준 예상 소요시간으로 받는다.
    errors         : 리스트를 주면 카카오가 돌려준 실패 사유를 담아준다(빈 결과 설명용).

    호출 수 = len(priorities) + len(fracs)*len(mags)*2 (경유지 ±).
    기본값 = 2 + 3*1*2 = 8회/O-D.
    """
    ox, oy = _pt(origin)
    dx, dy = _pt(destination)

    raw: list[dict] = []
    for p in priorities:
        raw += _call((ox, oy), (dx, dy), priority=p, departure_time=departure_time,
                     errors=errors)

    # O-D 직선의 수직 단위벡터로 경유지 교란
    vx, vy = dx - ox, dy - oy
    length = math.hypot(vx, vy) or 1.0
    px, py = -vy / length, vx / length
    for frac in waypoint_fracs:
        bx, by = ox + vx * frac, oy + vy * frac
        for mag in waypoint_mags:
            for sgn in (1, -1):
                wp = (bx + px * mag * sgn, by + py * mag * sgn)
                raw += _call((ox, oy), (dx, dy), priority="RECOMMEND", waypoint=wp,
                             departure_time=departure_time)

    # 파싱 + 격자 Jaccard 중복 제거
    distinct: list[CandidateRoute] = []
    distinct_cells: list[set] = []
    for i, route in enumerate(raw):
        cr = _parse(route, f"tmp{i}")
        c = _cells(cr)
        if all(_jaccard(c, dc) < dedupe_threshold for dc in distinct_cells):
            distinct.append(cr)
            distinct_cells.append(c)

    for i, cr in enumerate(distinct):
        cr.id = f"route_{i}"

    if mode == "serve" and distinct:
        best = min(cr.duration_min for cr in distinct)
        distinct = [cr for cr in distinct if cr.duration_min <= best * serve_detour]
        distinct.sort(key=lambda cr: cr.duration_min)
        distinct = distinct[:serve_top]

    return distinct


if __name__ == "__main__":
    # 간이 live 테스트: 강남역 → 판교역
    pool = fetch_pool((127.027619, 37.497942), (127.111202, 37.394912), mode="collect")
    print(f"[kakao] collect pool: {len(pool)}개 경로\n")
    for cr in pool:
        ts = [r["traffic_state"] for r in cr.roads if r["traffic_state"] is not None]
        print(f"  {cr.id}: {cr.distance_km:5.1f}km {cr.duration_min:5.1f}분 "
              f"통행료{cr.toll:6.0f} | 좌표{len(cr.coords):4d}점 guides{len(cr.guides):3d} "
              f"roads{len(cr.roads):3d}")
