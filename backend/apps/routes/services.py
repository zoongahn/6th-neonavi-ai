"""경로 추천 파이프라인 — 뷰를 얇게 유지하기 위한 서비스 계층.

흐름: 출발·도착 좌표 확보 → 카카오 후보 pool → 학습모델(model_a) 스코어링 → 응답 정형.

- 모델(model_a.pt)은 프로세스당 1회 로드해 재사용한다(요청마다 로드하면 느림).
- enrich=True: 추천 시점에 공공데이터·DEM 공간조인으로 12특성을 실값으로 채운다.
  (노드링크 STRtree 인덱스는 ai/features/road.py 가 싱글턴+디스크 캐시로 관리)

설계: docs/FE_백엔드_연동_설계.md
"""
from __future__ import annotations

from datetime import datetime

from ai.adapters import kakao
from ai.adapters.geocode import GeocodeError, to_coords
from ai.recommender import model_a
from ai.schema import MODE_PRESETS

# FE 표기 → 모델 계약 값
PASSENGER_KOR = {
    '혼자': 'alone', '가족': 'family', '노약자': 'vulnerable', '친구': 'friend',
}
VALID_PASSENGER = {'alone', 'family', 'vulnerable', 'friend'}
VALID_CAR_TYPE = {'sedan', 'suv', 'truck', 'compact'}

# 자동 추천이 아닐 때, 사용자가 고른 모드를 보여주기 위한 라벨
MODE_LABEL = {'comfort': '편안함', 'sports': '스포티', 'eco': '경제성'}

_MODEL = None


class RecommendError(Exception):
    """추천 실패 (호출자가 4xx/5xx 로 변환)."""


def _get_model():
    """model_a 체크포인트 지연 로드(프로세스당 1회)."""
    global _MODEL
    if _MODEL is None:
        try:
            _MODEL = model_a.load_model()
        except Exception as exc:   # torch 미설치·ckpt 없음 등
            raise RecommendError(f'추천 모델을 불러오지 못했습니다: {exc}') from exc
    return _MODEL


def normalize_passenger(value) -> str:
    """'가족'/'family' 모두 허용 → 모델 계약 값."""
    v = (value or 'alone')
    v = PASSENGER_KOR.get(v, v)
    if v not in VALID_PASSENGER:
        raise RecommendError(f'알 수 없는 동승자 값입니다: {value}')
    return v


def build_model_profile(profile: dict, passenger, load_kg) -> dict:
    """고정 프로필(4) + 여정별 값(2) → 모델 입력 프로필 6필드."""
    if not isinstance(profile, dict):
        raise RecommendError('profile 이 필요합니다.')
    try:
        age = int(profile['age'])
    except (KeyError, TypeError, ValueError):
        raise RecommendError('profile.age 가 필요합니다(숫자).')

    car_type = profile.get('car_type', 'sedan')
    if car_type not in VALID_CAR_TYPE:
        raise RecommendError(f'알 수 없는 차종입니다: {car_type}')

    gender = profile.get('gender', 'M')
    if gender not in ('M', 'F'):
        raise RecommendError(f'알 수 없는 성별입니다: {gender}')

    try:
        load = float(load_kg or 0)
        car_age = float(profile.get('car_age', 0) or 0)
    except (TypeError, ValueError):
        raise RecommendError('load_kg·car_age 는 숫자여야 합니다.')

    return {
        'age': age,
        'gender': gender,
        'passenger': normalize_passenger(passenger),
        'car_type': car_type,
        'load_kg': max(0.0, min(load, 100.0)),
        'car_age': max(0.0, min(car_age, 10.0)),
    }


def _path(route) -> list:
    """경로 폴리라인 → 지도용 [{lng, lat}, ...].

    좌표는 소수점 6자리(≈10cm)면 지도 표시에 충분하다. 경로당 200~900점.
    """
    return [{'lng': round(x, 6), 'lat': round(y, 6)} for x, y in (route.coords or [])]


# 카카오 guide type 중 "안내"가 아닌 것. 1000(경유지)은 **우리가 pool 을 넓히려고
# 넣은 가짜 경유지**라 사용자에게 보이면 안 된다("경유지 방면" 같은 문구가 뜬다).
_WAYPOINT_GUIDE = 1000


def _nav_steps(route) -> list:
    """경로 → 주행 안내 스텝 [{coord_index, lng, lat, guidance, type, distance, duration}].

    - `guidance` 는 카카오가 준 한국어 안내문 그대로다(우리가 지어내지 않는다).
    - `distance`/`duration` 은 **직전 안내지점부터** 이 지점까지의 값이다(누적 아님).
    - `coord_index` 는 `path` 배열에서의 위치. 화면은 이걸로 남은거리를 계산한다.
      좌표 투영으로 찾으면 지하차도·분기점처럼 폴리라인이 자기 자신과 가까워지는
      구간에서 엉뚱한 지점에 붙는다.
    """
    steps = []
    for g in (route.guides or []):
        if g.get('type') == _WAYPOINT_GUIDE:
            continue
        steps.append({
            'coord_index': int(g.get('coord_index', 0)),
            'lng': round(float(g.get('x', 0)), 6),
            'lat': round(float(g.get('y', 0)), 6),
            'guidance': g.get('guidance', '') or g.get('name', ''),
            'type': g.get('type'),
            'distance': int(g.get('distance', 0) or 0),
            'duration': int(g.get('duration', 0) or 0),
        })
    return steps


def parse_departure_time(value) -> str | None:
    """FE의 출발 시각 → 카카오 형식(YYYYMMDDHHMM). 'now'/빈값이면 None.

    ⚠️ 카카오는 **과거 시각을 조용히 무시하고 현재 기준으로 답한다**(에러가 아니다).
    시간대 계산이 어긋나면 기능이 동작하는 것처럼 보이면서 결과만 틀리므로,
    과거로 판정되면 아예 None 으로 떨어뜨려 현재 시각 API를 쓴다.
    """
    if not value or value == 'now':
        return None
    if isinstance(value, str) and value.isdigit() and len(value) == 12:
        parsed = datetime.strptime(value, '%Y%m%d%H%M')
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        except ValueError:
            raise RecommendError(f'출발 시각 형식을 알 수 없습니다: {value}')
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone().replace(tzinfo=None)
    return None if parsed <= datetime.now() else parsed.strftime('%Y%m%d%H%M')


# 카카오 result_code → 사용자가 뭘 고쳐야 하는지. 원문(result_msg)은 상황 설명일 뿐
# 다음 행동을 알려주지 않는다. 예: 산 정상을 찍으면 102 가 온다.
_POOL_HINTS = {
    102: '{origin} 주변에 차로 들어갈 수 있는 도로가 없습니다. '
         '검색 목록에서 인근 지점(예: 입구·주차장·역)을 골라 주세요.',
    103: '{destination} 주변에 차로 들어갈 수 있는 도로가 없습니다. '
         '검색 목록에서 인근 지점(예: 입구·주차장·역)을 골라 주세요.',
    104: '출발지와 도착지가 너무 가깝습니다.',
}


def _pool_failure_message(errors, origin_name, dest_name) -> str:
    """후보가 0개일 때, 카카오가 준 사유를 사용자가 조치 가능한 문구로 바꾼다."""
    for code, msg in errors:
        hint = _POOL_HINTS.get(code)
        if hint:
            return hint.format(origin=origin_name or '출발지',
                               destination=dest_name or '도착지')
    if errors:   # 모르는 코드면 카카오 원문이라도 보여준다(추측해 지어내지 않는다)
        code, msg = errors[0]
        return f'경로를 찾지 못했습니다. ({msg or code})'
    return '경로를 찾지 못했습니다. 출발지·도착지를 확인해 주세요.'


def _title(rank: int, auto_recommend: bool, mode: str) -> str:
    if rank == 0:
        return '너네비추천' if auto_recommend else f'{MODE_LABEL.get(mode, mode)} 추천'
    return f'대안 경로 {rank}'


def recommend(payload: dict) -> dict:
    """추천 요청 dict → {origin, destination, routes[...]}."""
    profile = payload.get('profile')
    model_profile = build_model_profile(
        profile, payload.get('passenger'), payload.get('load_kg'))

    mode = (payload.get('mode') or 'comfort').lower()
    if mode not in MODE_PRESETS:
        raise RecommendError(f'알 수 없는 모드입니다: {mode}')
    auto_recommend = bool(payload.get('auto_recommend', True))

    # 1. 좌표 확보 (문자열이면 지오코딩)
    try:
        origin, origin_name = to_coords(payload.get('origin'))
        destination, dest_name = to_coords(payload.get('destination'))
    except GeocodeError as exc:
        raise RecommendError(str(exc)) from exc

    departure_time = parse_departure_time(payload.get('departure_time'))

    # 2. 후보 경로 pool (서빙 모드: 과도한 우회 제외 + 상위 N)
    pool_errors = []
    pool = kakao.fetch_pool(origin, destination, mode='serve',
                            departure_time=departure_time, errors=pool_errors)
    if not pool:
        raise RecommendError(_pool_failure_message(pool_errors, origin_name, dest_name))

    # 3. 학습모델 스코어링 (공공데이터·DEM 특성 포함)
    handle = _get_model()
    try:
        # 자동 추천이면 프로필에서 성향을 추론하고, 사용자가 모드를 직접 골랐으면
        # 그 모드의 가중치로 랭킹한다. 고른 모드가 랭킹에 반영되지 않으면
        # 제목만 바뀌고 순서는 그대로여서 선택 자체가 무의미해진다.
        chosen = None if auto_recommend else model_a.mode_weights(mode, model=handle)

        recs = model_a.recommend(model_profile, pool, model=handle, enrich=True,
                                 weights=chosen)
        # 반사실 설명: 다른 성향이었다면 어떤 경로가 1순위였을까
        counterfactual = model_a.counterfactual_tops(pool, model=handle, enrich=True)
        preference = model_a.describe_preference(model_profile, model=handle,
                                                 weights=chosen)
    except Exception as exc:
        raise RecommendError(f'추천 계산에 실패했습니다: {exc}') from exc

    # 세 성향이 모두 같은 경로를 고르면 배지 3개가 한 줄에 몰려 정보가 되지 않는다.
    # 그 경우엔 배지 대신 '모든 성향에서 1순위'라는 사실 자체를 알린다.
    unanimous = len(set(counterfactual.values())) == 1

    by_id = {r.id: r for r in pool}
    routes = []
    for rank, rec in enumerate(recs):
        route = by_id.get(rec.route_id)
        if route is None:
            continue
        modes_for_route = [m for m, rid in counterfactual.items() if rid == rec.route_id]
        routes.append({
            'route_id': rec.route_id,
            'title': _title(rank, auto_recommend, mode),
            # 0 = 추천 경로, 1.. = 대안. 화면이 제목 문자열을 파싱하지 않도록 숫자로 준다.
            'rank': rank,
            'reason': rec.reason,
            'highlights': rec.highlights,   # 근거 조각(칩 렌더용)
            'score': rec.score,
            'distance_km': round(route.distance_km, 1),
            'duration_min': round(route.duration_min),
            'toll': int(route.toll),
            'axes': rec.features,       # 성향축별 만족도(설명용)
            # 상세 화면 '추천하는 이유' 카드. 추천 계산에서 함께 나오므로
            # 상세를 열 때 추가 호출·대기가 없다.
            'recommend_reasons': rec.reasons,
            # 상세 화면 '원본 데이터'·'모델 입력 지표'용 실값
            'features': rec.raw_features,
            'features_peer_avg': rec.peer_features,
            # 이 경로를 1순위로 고르는 성향들. unanimous 면 비운다(FE가 문구로 대체).
            'preferred_by': [] if unanimous else modes_for_route,
            'preferred_by_labels': [] if unanimous else [MODE_LABEL[m] for m in modes_for_route],
            'bound': route.bound,       # 지도 초기 영역
            'path': _path(route),       # 지도에 그릴 폴리라인
            'steps': _nav_steps(route),  # 주행 안내(S5 턴바이턴)
        })

    return {
        'origin': {'name': origin_name, 'lng': origin[0], 'lat': origin[1]},
        'destination': {'name': dest_name, 'lng': destination[0], 'lat': destination[1]},
        'mode': mode,
        'auto_recommend': auto_recommend,
        'departure_time': departure_time,
        # 성향은 사용자당 하나 → 목록 상단에 한 번만 표시하라는 뜻으로 최상위에 둔다.
        # source: 추론한 것인지(inferred) 사용자가 고른 것인지(selected) — 문구가 달라진다.
        'preference': {
            **preference,
            'unanimous': unanimous,
            'source': 'inferred' if auto_recommend else 'selected',
        },
        'routes': routes,
    }

############################################
############### 추가 ########################

def explain_route_detail(payload: dict) -> dict:
    """
    특정 경로에 대한 LLM 맞춤형 분석(XAI) 결과 반환
    FE에서 상세 페이지 진입 시 해당 경로의 프로필과 축(axes) 데이터 전송 
    """
    profile = payload.get('profile', {})
    mode = payload.get('mode', 'comfort')
    
    # FE에서 넘겨준 선택된 경로의 특성 데이터
    route_axes = payload.get('axes', {})
    
    try:
        # ⚠️ 여기서 import 한다. 최상위에 두면 gradio_client(+httpx·huggingface_hub)
        #    를 **모든 콜드스타트마다** 읽는다(로컬 실측 107ms). 추천 근거는 이제
        #    추천 계산에서 나오므로 이 경로는 폴백일 뿐이라, 쓸 때만 읽는다.
        from ai.xai_llm import generate_xai_reasons

        # LLM에게 텍스트 생성을 요청 (2~3초 소요)
        reasons = generate_xai_reasons(profile, mode, route_axes)
        return {"recommend_reasons": reasons}
    except Exception as exc:
        raise RecommendError(f'AI 상세 분석에 실패했습니다: {exc}') from exc