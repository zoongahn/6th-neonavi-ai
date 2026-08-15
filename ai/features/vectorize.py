"""후보 경로 → 경로 특성 벡터 → 성향 축 투영 (Phase 1 마무리 + B의 'RouteTower').

3단계:
  1. build_feature_vector: 경로 → 원시 특성 dict (schema.FEATURE_NAMES)
  2. normalize:            후보 집합 내 min-max 정규화 (후보 간 상대 비교)
  3. project_to_axes:      정규 특성 → 성향 축(PREFERENCE_AXES) 만족도

방안 B는 여기 project_to_axes 를 '손으로 짠 투영'으로 쓰고,
방안 A는 이 투영을 Two-Tower RouteTower 로 '학습'해 대체한다(R1 프레이밍).
"""
from ..schema import FEATURE_NAMES, PREFERENCE_AXES
from . import curvature, elevation, fuel as fuel_mod

# 만족도 = 1 - 정규값 (낮을수록 좋음). 단 HIGHER_BETTER 특성은 정규값 그대로(높을수록 좋음).
HIGHER_BETTER = {'avg_speed', 'speed_limit', 'road_type'}   # ↑ 특성

# 각 성향 축의 구성 특성 (관련 특성 만족도 평균). 계약.md §2 참조. safety 삭제(2026-07-18).
# sports=감속회피/주행속력, comfort=완만·대로, fuel=비용최소.
#
# duration_min 추가(2026-08-15, 층2 설문 근거): 원래 '빠른 도착은 지도 API가 보장하니
# 성향 축에서 뺀다'고 봤는데, 설문 48명에서 소요시간이 선택을 가르는 3대 요인이었다
# (계수 -2.12, road_type·toll 다음). 오래 걸리는 길은 성향과 무관하게 기피되므로
# 세 축에 모두 넣는다 — 빠른 주행(sports)·피로(comfort)·시간비용(fuel).
# 근거·측정: docs/층2_검증결과.md
AXIS_FEATURES = {
    'sports':  ('avg_speed', 'speed_limit', 'road_type', 'turn_count', 'congestion',
                'signal_count', 'duration_min'),
    'comfort': ('curvature', 'slope', 'turn_count', 'congestion', 'road_type',
                'duration_min'),
    'fuel':    ('fuel_cost', 'distance_km', 'toll', 'duration_min'),
}

# 카카오 traffic_state → 정체 심각도(높을수록 막힘). 0/None=정보없음 → 평균에서 제외.
CONGESTION_LEVEL = {1: 1.0, 2: 0.75, 3: 0.5, 4: 0.0}


def _get(obj, key, default=0.0):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _congestion(route) -> float:
    """roads[].traffic_state 거리가중 평균 정체도 (0=원활 ~ 1=정체). 정보없음 구간 제외."""
    num = den = 0.0
    for r in _get(route, 'roads', []) or []:
        st = r.get('traffic_state') if isinstance(r, dict) else None
        d = float(r.get('distance', 0) or 0) if isinstance(r, dict) else 0.0
        lvl = CONGESTION_LEVEL.get(st)
        if lvl is None or d <= 0:
            continue
        num += lvl * d
        den += d
    return num / den if den else 0.0


def avg_speed_kmh(distance_km: float, duration_min: float) -> float:
    """평균 주행속력 km/h = 거리 ÷ 시간. sports(주행속력↑) 특성. duration=0 방어."""
    return distance_km / (duration_min / 60.0) if duration_min and duration_min > 0 else 0.0


def _turn_density(route, dist_km: float) -> float:
    """회전·교차로 스텝 밀도(개/km). 출발(type 100)·목적(101)은 제외.

    (guide type 코드 의미표 확정 전 프록시: 끝점 제외 스텝 수. 신호등 대체 신호이기도 함)
    """
    guides = _get(route, 'guides', []) or []
    turns = sum(1 for g in guides
                if isinstance(g, dict) and g.get('type') not in (100, 101))
    return turns / dist_km if dist_km > 0 else 0.0


def build_feature_vector(route, enrich: bool = False) -> dict:
    """CandidateRoute → {FEATURE_NAMES: 원시값}.

    카카오/기하로 즉시 채우는 것: distance·duration·avg_speed·toll·congestion·turn_count·curvature.
    enrich=True 면 외부 데이터 특성도 채운다(네트워크/DEM/공공데이터):
      - slope: elevation.route_slope (Open Topo Data/로컬 DEM)
      - signal_count·road_type·speed_limit: road.get_index().route_features (공공데이터 공간조인)
    enrich=False(기본)면 외부 특성은 0.0 placeholder — 테스트·합성 데이터에서 무거운 의존 회피.

    ⚠️ route 가 FEATURE_NAMES 키를 이미 갖고 있으면(저장된 parquet 행, 설문처럼 서술로
    주어진 가상 경로) **그 값을 그대로 쓴다**. 좌표에서 다시 계산해 덮어쓰면 이미 아는
    값을 버리게 되고, enrich=False 일 때 slope·signal_count·road_type·speed_limit 이
    통째로 0 이 되어 해당 축이 조용히 사라진다.
    """
    coords = _get(route, 'coords', []) or []
    dist = float(_get(route, 'distance_km', 0.0))
    cong = _congestion(route)
    curv = curvature.route_curvature(coords)['mean'] if len(coords) >= 3 else 0.0
    slope_info = (elevation.route_slope(coords) if (enrich and len(coords) >= 2)
                  else {'mean': 0.0, 'climb_m': 0.0})
    # fuel: 거리·정체는 항상, 상승고도(climb)는 enrich 시에만 반영 (표준차 기준)
    fuel_cost = fuel_mod.route_fuel_cost(route, cong, slope_info['climb_m'])
    dur = float(_get(route, 'duration_min', 0.0))

    # 공공데이터 특성 (enrich 시에만; road 모듈은 지연 import — 지오스택 없어도 테스트 동작)
    pub = {'signal_count': 0.0, 'road_type': 0.0, 'speed_limit': 0.0}
    if enrich and len(coords) >= 2:
        from . import road
        pub = road.get_index().route_features(coords)

    computed = {
        'distance_km':  dist,
        'duration_min': dur,
        'avg_speed':    avg_speed_kmh(dist, dur),
        'toll':         float(_get(route, 'toll', 0.0)),
        'congestion':   cong,
        'turn_count':   _turn_density(route, dist),
        'curvature':    float(curv),
        'slope':        float(slope_info['mean']),
        'fuel_cost':    float(fuel_cost),
        'signal_count': float(pub['signal_count']),
        'road_type':    float(pub['road_type']),
        'speed_limit':  float(pub['speed_limit']),
    }

    # 이미 아는 값이 route 에 실려 있으면 재계산분을 덮지 않는다.
    if isinstance(route, dict):
        for name in FEATURE_NAMES:
            given = route.get(name)
            if given is not None:
                computed[name] = float(given)
    return computed


def normalize(vectors: list) -> list:
    """특성 벡터 리스트를 특성별 min-max 정규화([0,1]).

    후보 간 상대 비교가 목적. 분산 0(모두 같은 값/placeholder)인 특성은 0.5(중립)로.
    """
    if not vectors:
        return []
    out = [dict() for _ in vectors]
    for name in FEATURE_NAMES:
        vals = [v.get(name, 0.0) for v in vectors]
        lo, hi = min(vals), max(vals)
        span = hi - lo
        for i, val in enumerate(vals):
            out[i][name] = 0.5 if span == 0 else (val - lo) / span
    return out


def project_to_axes(norm_vec: dict) -> dict:
    """정규 특성 → 성향 축 만족도(높을수록 좋음).

    축 만족도 = 관련 특성들의 만족도 평균. 낮을수록 좋은 특성은 (1-정규값),
    HIGHER_BETTER(avg_speed 등)는 정규값 그대로. 관련 특성 없으면 0.5(중립).
    """
    axes = {}
    for axis, feats in AXIS_FEATURES.items():
        # HIGHER_BETTER 특성은 정규값 그대로, 그 외는 반전(1-정규값)
        sats = [norm_vec.get(f, 0.5) if f in HIGHER_BETTER else 1.0 - norm_vec.get(f, 0.5)
                for f in feats]
        axes[axis] = sum(sats) / len(sats) if sats else 0.5
    return {a: axes.get(a, 0.5) for a in PREFERENCE_AXES}


def routes_to_axis_vectors(routes: list, enrich: bool = False) -> list:
    """편의 함수: 후보 경로 리스트 → 각 경로의 축 만족도 dict 리스트."""
    feats = [build_feature_vector(r, enrich=enrich) for r in routes]
    norms = normalize(feats)
    return [project_to_axes(n) for n in norms]
