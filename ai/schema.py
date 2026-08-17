"""AI ↔ backend 인터페이스 계약 (Phase 0 산출물).

backend는 아래 dataclass 형태(또는 동일 키의 dict)로 데이터를 주고받는다.
성향 축과 경로 특성 이름을 여기서 단일 정의해 baseline_b / model_a / features 가 공유한다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# ── 성향 축 (Two-Tower latent 과 정렬: sports·comfort·eco(=fuel)) ──
# sports = '빠른 길'이 아니라 '감속 회피/주행속력'. safety는 2026-07-18 삭제(보조축이라 argmax 안 됨, comfort 흡수).
PREFERENCE_AXES = ('sports', 'comfort', 'fuel')

# ── 경로 특성 벡터 f 의 필드 (features/vectorize.py 가 이 순서로 생성) ──
# Phase 0 계약. [방향] = 값이 낮을수록 좋음(↓) / 높을수록 좋음(↑).
# avg_speed·road_type 은 ↑(높을수록 좋음) → vectorize.HIGHER_BETTER 로 부호 반전 처리.
FEATURE_NAMES = (
    # ── 카카오 응답에서 즉시 (무료·신뢰 높음) ──
    'distance_km',   # 총 거리 km — summary.distance/1000        [↓]
    'duration_min',  # 예상 소요시간 min — summary.duration/60    [↓, 성향 축엔 미사용: 빠른도착=API보장]
    'avg_speed',     # 평균 주행속력 km/h — distance/duration(파생) [↑, sports 핵심]
    'toll',          # 통행료 원 — summary.fare.toll             [↓]
    'congestion',    # 정체도 — roads[].traffic_state 거리가중 평균 [↓]
    'turn_count',    # 회전·교차로 스텝 수 — guides[] (감속 프록시) [↓]
    # ── 좌표 기하 계산 (완료) ──
    'curvature',     # 곡률(굽이) — Menger, curvature.py         [↓]
    # ── 외부 데이터/추정 (핵심 차별점) ──
    'slope',         # 경사 지표 — Open Topo Data DEM (캐싱)       [↓]
    'fuel_cost',     # 예상 유류비 — 거리+경사+차종 추정식         [↓]
    # ── 공공데이터 spatial join (A5, 노드링크·신호등; road.py) ──
    'signal_count',  # 신호교차로 밀도 개/km — 신호등 표준데이터      [↓, sports/comfort]
    'road_type',     # 고속도로 비율 0~1 — 노드링크 ROAD_RANK(101·102) [↑, sports/comfort]
    'speed_limit',   # 경로 평균 제한속도 km/h — 노드링크 MAX_SPD 가중평균 [↑, sports]
)

# ── 성향 모드 프리셋: 각 축(PREFERENCE_AXES=sports,comfort,fuel)을 얼마나 중시하는지 ──
# safety 삭제(2026-07-18) → 안전 관련 비중은 comfort로 흡수. 합=1.
MODE_PRESETS: dict[str, dict[str, float]] = {
    'comfort': {'sports': 0.15, 'comfort': 0.70, 'fuel': 0.15},
    'sports':  {'sports': 0.70, 'comfort': 0.20, 'fuel': 0.10},
    'eco':     {'sports': 0.15, 'comfort': 0.20, 'fuel': 0.65},
}


@dataclass
class UserProfile:
    """운전자 입력. (backend DriverProfile 과 1:1)"""
    age: int
    gender: str          # 'M' | 'F'
    passenger: str       # 'alone' | 'family' | 'vulnerable' | 'friend'
    car_type: str        # 'sedan' | 'suv' | 'truck' | 'compact'
    load_kg: float = 0.0   # 0~100
    car_age: float = 0.0   # 0~10


@dataclass
class CandidateRoute:
    """지도 API가 준 후보 경로 1개. backend/어댑터가 채워서 전달."""
    id: str
    coords: list[tuple[float, float]]   # [(lng, lat), ...] 폴리라인
    distance_km: float
    duration_min: float
    toll: float = 0.0
    guides: list[dict] = field(default_factory=list)  # 턴바이턴 회전 스텝 (Lv2 + turn_count 원천)
    roads: list[dict] = field(default_factory=list)   # [{name,distance,traffic_speed,traffic_state}] — congestion/road_type 원천
    bound: dict = field(default_factory=dict)          # summary.bound — FE 지도 표시용


@dataclass
class Recommendation:
    """추천 결과 1건 (점수 내림차순으로 리스트 반환)."""
    route_id: str
    score: float
    reason: str                     # 사람이 읽는 추천 이유 — 이 경로만의 사실 근거
    features: dict = field(default_factory=dict)  # 디버그/설명용 축 만족도
    # 후보집합 내 상대 비교로 뽑은 근거 조각. reason 은 이걸 이어붙인 문장이다.
    # 화면이 칩/뱃지로 따로 렌더할 수 있게 조각 상태로도 남긴다.
    highlights: list[str] = field(default_factory=list)
