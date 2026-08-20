"""추천 근거 카드 생성 — 상세 화면(RouteDetail)의 '이 경로를 추천하는 이유'.

우리는 이미 12특성을 실값으로 뽑고(enrich=True), score = w·f 로 랭킹한다.
그래서 근거를 **생성할** 필요가 없다. 이미 계산한 것을 문장으로 옮기면 된다.

이 모듈이 지키는 원칙 넷:
  1. 후보집합과 비교해서만 말한다. "신호가 적다"는 절대 기준이 없다 —
     같은 O-D 의 다른 후보보다 적어야 사용자에게 의미가 있다.
  2. 격차가 무의미하면 침묵한다. 1등이어도 차이가 잡음 수준이면 근거가 아니다
     (model_a._highlights 와 같은 판단. '포장'을 막는 장치다).
  3. 지어내지 않는다. 모든 문장의 숫자는 실제 특성값이다.
  4. 모든 후보에 같은 말을 붙이지 않는다. 축 카드조차 이 경로가 그 축에서
     실제로 나을 때만 낸다. 전 후보에 붙는 문구는 설명이 아니라 장식이다.

⚠️ 카드 수를 억지로 채우지 않는다. 근거가 둘뿐이면 둘만 낸다.
   다섯 칸을 채우려고 없는 장점을 만들면 이 모듈의 존재 이유가 사라진다.

⚠️ 임계값은 **실측 분포에 맞춰** 잡았다(강남역→광화문 후보 5개 기준).
   단위를 넘겨짚으면 카드가 통째로 안 뜨거나 잡음이 근거로 승격된다.
   실제로 fuel_cost 는 원이 아니라 리터(L)고, slope·road_type 은 0.01 단위다.
"""
from ..schema import PREFERENCE_AXES, AXIS_KOR

MAX_CARDS = 5

# 근거로 쓸 특성 정의
#   lower_better : 낮을수록 좋은가
#   title_best   : 후보 중 유일한 1등일 때 제목
#   title_good   : 1등은 아니지만 평균보다 뚜렷이 나을 때 제목
#   fmt          : 값 → 표시 문자열 (''이면 수치 생략하고 비율만 말한다)
#   why          : 이 특성이 왜 좋은지 (고정 문구)
#   min_abs      : 의미 있는 최소 절대 격차 (다른 후보 평균 대비)
#   min_rel      : 의미 있는 최소 상대 격차 (다른 후보 평균 대비 비율)
_SPECS = (
    dict(key='duration_min', icon='⏱️', lower_better=True,
         title_best='가장 빨리 도착해요', title_good='도착이 빠른 편이에요',
         fmt=lambda v: f'{round(v)}분',
         why='같은 구간의 다른 경로보다 시간을 아낄 수 있어요.',
         min_abs=2.0, min_rel=0.05),
    dict(key='signal_count', icon='🚦', lower_better=True,
         title_best='신호등이 가장 적어요', title_good='신호등이 적은 편이에요',
         fmt=lambda v: f'km당 {v:.1f}개',
         why='불필요한 정차가 줄어 흐름이 끊기지 않아요.',
         min_abs=1.0, min_rel=0.15),
    dict(key='congestion', icon='🚘', lower_better=True,
         title_best='혼잡 구간이 가장 적어요', title_good='혼잡 구간이 적은 편이에요',
         fmt=lambda v: '',
         why='막히는 구간이 적어 도착 시각을 예측하기 좋아요.',
         min_abs=0.03, min_rel=0.15),
    dict(key='curvature', icon='↪️', lower_better=True,
         title_best='급커브가 가장 적어요', title_good='급커브가 적은 편이에요',
         fmt=lambda v: '',
         why='굽이가 완만해 핸들 조작이 적고 승차감이 안정적이에요.',
         min_abs=0.0, min_rel=0.20),
    dict(key='slope', icon='⛰️', lower_better=True,
         title_best='경사가 가장 완만해요', title_good='경사가 완만한 편이에요',
         fmt=lambda v: '',
         why='급한 오르막·내리막이 적어 부담이 덜해요.',
         min_abs=0.005, min_rel=0.15),
    # ⚠️ min_value 가 없으면 "고속도로 4%인데 평균보다 86% 높음 → 큰 도로 위주"
    #    같은 과장이 나온다. 상대 격차가 커도 절대 수준이 낮으면 근거가 아니다.
    dict(key='road_type', icon='🛣️', lower_better=False,
         title_best='큰 도로 비율이 가장 높아요', title_good='큰 도로를 많이 타요',
         fmt=lambda v: f'고속·자동차전용 {v * 100:.0f}%',
         why='차선이 넓고 신호가 적어 주행이 단순해져요.',
         min_abs=0.05, min_rel=0.20, min_value=0.15),
    # ⚠️ fuel_cost 는 '원'이 아니라 표준차 예상 소비량(L)이다(features/fuel.py).
    #    차종·유가를 반영한 실제 기름값은 아직 서빙에 없으므로 L 로만 말한다.
    dict(key='fuel_cost', icon='⛽', lower_better=True,
         title_best='연료를 가장 적게 써요', title_good='연료를 적게 쓰는 편이에요',
         fmt=lambda v: f'약 {v:.1f}L 예상',
         why='거리·경사·정체를 함께 반영한 표준차 기준 소비량이에요.',
         min_abs=0.08, min_rel=0.08),
    dict(key='toll', icon='💰', lower_better=True,
         title_best='통행료가 가장 저렴해요', title_good='통행료가 저렴한 편이에요',
         fmt=lambda v: ('없음' if v <= 0 else f'{int(v):,}원'),
         why='유료도로 이용이 적거나 없어요.',
         min_abs=500.0, min_rel=0.10),
)

# 장점이 하나도 없는 대안용 — 추천 경로와의 차이를 그대로 말한다.
# ⚠️ 문구는 **그 자체로 끝나는 명사구**여야 한다. '느리지만' 처럼 뒤를 잇는 말로
#    두면 장점이 없을 때 "추천 경로보다 8분 느리지만" 에서 문장이 끊긴다.
# (키, 좋아짐, 나빠짐, 낮을수록 좋은가, 최소 차이, 포맷터)
_TRADEOFF_SPECS = (
    ('duration_min', '{v} 빠름', '{v} 느림', True, 1.0, lambda d: f'{round(d)}분'),
    ('toll', '통행료 {v} 저렴', '통행료 {v} 비쌈', True, 100.0, lambda d: f'{int(d):,}원'),
    ('distance_km', '거리 {v} 짧음', '거리 {v} 김', True, 0.3, lambda d: f'{d:.1f}km'),
    ('fuel_cost', '연료 {v} 덜 씀', '연료 {v} 더 씀', True, 0.08, lambda d: f'{d:.1f}L'),
)


def _vals(key, feats):
    v = [f.get(key) for f in feats]
    return None if any(x is None for x in v) else [float(x) for x in v]


def _axis_card(idx: int, feats_len: int, axes_all: list, weights: dict) -> dict | None:
    """왜 '이 사람에게' 이 경로인지 — score = w·f 를 그대로 풀어 쓴다.

    후보 비교가 아니라 모델이 실제로 계산한 값이라, 우리 추천이 성향 맞춤이라는
    주장의 유일한 직접 증거다. 다만 **이 경로가 그 축에서 실제로 나을 때만** 낸다.
    (전 후보에 똑같이 붙으면 37점짜리 경로에도 "성향에 맞아요"가 붙는다.)
    """
    if not weights or not axes_all or axes_all[idx] is None:
        return None
    axis = max(PREFERENCE_AXES, key=lambda a: float(weights.get(a, 0)))
    mine = float(axes_all[idx].get(axis, 0))
    others = [float(a.get(axis, 0)) for j, a in enumerate(axes_all) if j != idx]
    if others:
        avg = sum(others) / len(others)
        if mine <= avg:
            return None                    # 그 축에서 평균 이하면 근거가 아니다
        is_best = all(mine > o for o in others)
    else:
        is_best = True

    label = AXIS_KOR.get(axis, axis)
    contrib = {a: float(weights.get(a, 0)) * float(axes_all[idx].get(a, 0))
               for a in PREFERENCE_AXES}
    total = sum(contrib.values())
    share = (contrib[axis] / total) if total > 0 else 0.0
    return {
        'icon': '🎯',
        'title': (f'{label} 성향에 가장 잘 맞아요' if is_best
                  else f'{label} 성향에 맞는 편이에요'),
        'desc': (
            f'추론된 성향에서 {label} 비중이 {float(weights[axis]) * 100:.0f}%로 가장 큽니다. '
            f'이 경로는 그 축에서 {mine * 100:.0f}점으로, 추천 점수의 '
            f'{share * 100:.0f}%가 여기서 나왔어요.'
        ),
    }


def _tradeoff_card(idx: int, ref: int, feats: list) -> dict | None:
    """장점이 없는 대안용 — 추천 경로 대비 무엇을 얻고 무엇을 잃는지."""
    if ref is None or ref == idx:
        return None
    gains, losses = [], []
    for key, good, bad, lower_better, min_d, fmt in _TRADEOFF_SPECS:
        vals = _vals(key, feats)
        if vals is None:
            continue
        diff = vals[ref] - vals[idx]           # + 면 내가 작다
        better = diff > 0 if lower_better else diff < 0
        if abs(diff) < min_d:
            continue
        (gains if better else losses).append(
            (good if better else bad).format(v=fmt(abs(diff))))
    items = losses[:2] + gains[:2]        # 잃는 것을 먼저 — 숨기지 않는다
    if not items:
        return None
    return {'icon': '⚖️', 'title': '추천 경로와의 차이',
            'desc': f"추천 경로 대비 {' · '.join(items)}."}


def build(idx: int, feats: list, axes_all: list = None, weights: dict = None,
          top_idx: int = None) -> list:
    """경로 하나의 근거 카드 목록 [{icon, title, desc}, ...] 을 만든다.

    idx      : feats 안에서 이 경로의 위치
    feats    : 후보 전체의 원시 특성 dict 리스트 (vectorize.build_feature_vector)
    axes_all : 후보 전체의 축 만족도 f (0~1) dict 리스트
    weights  : 사용자 성향 가중치 w (합 1)
    top_idx  : 가드레일이 고른 1순위 (대안 설명의 기준점)
    """
    cards = []
    axis_card = _axis_card(idx, len(feats), axes_all or [], weights or {})
    if axis_card:
        cards.append(axis_card)

    # 후보가 하나뿐이면 비교가 성립하지 않는다. 비교 없이 사실만 남긴다.
    if len(feats) < 2:
        mine = feats[idx] if feats else {}
        if mine.get('toll') is not None and float(mine['toll']) <= 0:
            cards.append({'icon': '💰', 'title': '통행료가 없어요',
                          'desc': '이 경로는 유료도로를 지나지 않아요.'})
        if mine.get('duration_min') is not None:
            cards.append({
                'icon': '⏱️', 'title': f"예상 {round(float(mine['duration_min']))}분",
                'desc': '이 구간에서 찾은 유일한 경로라 다른 후보와의 비교는 없어요.'})
        return cards[:MAX_CARDS]

    scored = []
    for spec in _SPECS:
        vals = _vals(spec['key'], feats)
        if vals is None:
            continue
        mine = vals[idx]
        others = [v for j, v in enumerate(vals) if j != idx]
        avg = sum(others) / len(others)
        gain = (avg - mine) if spec['lower_better'] else (mine - avg)
        if gain <= 0:
            continue                                   # 평균보다 나쁘면 근거가 아니다
        # 절대·상대 양쪽 기준을 넘어야 근거로 인정한다.
        # (한쪽만 보면 값이 작은 특성에서 잡음이 근거로 승격된다)
        if gain < spec['min_abs']:
            continue
        rel = (gain / abs(avg)) if avg else 0.0
        if rel < spec['min_rel']:
            continue
        # 상대 격차가 커도 절대 수준이 낮으면 근거로 삼지 않는다
        if 'min_value' in spec and mine < spec['min_value']:
            continue

        best = min(vals) if spec['lower_better'] else max(vals)
        is_best = mine == best and sum(1 for v in vals if v == best) == 1

        detail = spec['fmt'](mine)
        pieces = [detail] if detail else []
        pieces.append(f"다른 후보 평균보다 {rel * 100:.0f}% "
                      + ('적어요' if spec['lower_better'] else '높아요'))
        scored.append((
            (1 if is_best else 0, rel),                # 1등 우선, 그다음 격차 큰 순
            {'icon': spec['icon'],
             'title': spec['title_best'] if is_best else spec['title_good'],
             'desc': f"{' · '.join(pieces)}. {spec['why']}"},
        ))

    scored.sort(key=lambda t: t[0], reverse=True)
    cards.extend(card for _, card in scored)

    # 내세울 게 없는 대안은 침묵하지 말고 차이를 알린다(왜 목록에 있는지).
    if not cards:
        tc = _tradeoff_card(idx, top_idx, feats)
        cards.append(tc or {
            'icon': '🗺️', 'title': '비슷한 조건의 대안',
            'desc': '추천 경로와 시간·거리·비용이 비슷해 골라도 손해가 크지 않아요.'})
    return cards[:MAX_CARDS]
