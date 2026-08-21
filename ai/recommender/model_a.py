"""방안 A — 학습 모델 추천.

학습된 Two-Tower 체크포인트(ai/data/model_a.pt)를 로드해 후보 경로를 스코어링한다.
score = w · f (w=User Tower 성향 가중치, f=Route Tower 축 만족도).

⚠️ 라벨이 규칙에서 나오므로 A의 성능 상한 = 규칙 품질(R1). A의 가치는
   '규칙을 이긴다'가 아니라 미정의 조합 일반화·특성 상호작용·부드러운 스코어.
baseline_b 와 동일한 Recommendation 을 반환해 서빙에서 교체 가능.
"""
import json
import math
import os

from ..schema import Recommendation, PREFERENCE_AXES, AXIS_KOR
from ..features import vectorize
from ..encoders import encode_profile, feature_row
from . import reasons

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
_DEFAULT_CKPT = os.path.join(_DATA_DIR, 'model_a.pt')
_DEFAULT_WEIGHTS = os.path.join(_DATA_DIR, 'model_weights.json')


"""
추론 백엔드가 둘이다. **랭킹·설명 로직은 한 벌만 두고**, 두 백엔드가 같은
인터페이스(파이썬 리스트 in/out)를 내놓게 해서 계산 방식만 갈아끼운다.

  torch  학습에 쓰는 체크포인트(model_a.pt)를 그대로 로드. 기본값.
  pure   가중치 JSON 만 읽어 순수 파이썬으로 계산(ai/export_weights.py).

⚠️ 서빙에 torch 를 들고 가면 733MB 다. 모델은 파라미터 1,062개뿐이라 순수
   파이썬으로 계산해도 되고, 그러면 배포 용량 22.5KB · 콜드스타트마다 torch
   import 0.8초 절감이다. 정확도 손해는 float32↔float64 반올림뿐 —
   무작위 2,000회 대조에서 점수 최대오차 2.6e-07, 랭킹 불일치 0건.
   (서빙 마진은 0.27~0.37 이라 여섯 자릿수 아래다)
   속도는 추론 자체가 69µs → 162µs 로 느려지지만, 추천 요청 전체가 3.7~4.4초라
   0.004% 다. 학습은 계속 torch 로 한다.
"""


def _linear(x, W, b):
    """nn.Linear — W 는 (out, in)."""
    return [sum(wi * xi for wi, xi in zip(row, x)) + bj for row, bj in zip(W, b)]


class _PureBackend:
    """torch 없이 도는 Two-Tower forward."""

    name = 'pure'
    model = None            # torch 모듈이 없다(오프라인 도구는 torch 백엔드를 쓴다)

    def __init__(self, weights_path):
        with open(weights_path, encoding='utf-8') as f:
            payload = json.load(f)
        self._t = payload['tensors']

    def _tower(self, rows, prefix, activation):
        w0, b0 = self._t[f'{prefix}.net.0.weight'], self._t[f'{prefix}.net.0.bias']
        w2, b2 = self._t[f'{prefix}.net.2.weight'], self._t[f'{prefix}.net.2.bias']
        out = []
        for x in rows:
            h = _linear(x, w0, b0)
            h = [v if v > 0 else 0.0 for v in h]        # ReLU
            out.append(activation(_linear(h, w2, b2)))
        return out

    @staticmethod
    def _softmax(v):
        m = max(v)
        e = [math.exp(a - m) for a in v]                # overflow 방지
        s = sum(e)
        return [a / s for a in e]

    @staticmethod
    def _sigmoid(v):
        return [1.0 / (1.0 + math.exp(-a)) for a in v]

    def weights(self, rows):
        return self._tower(rows, 'user_tower', self._softmax)

    def satisfaction(self, rows):
        return self._tower(rows, 'route_tower', self._sigmoid)


class _TorchBackend:
    """학습 체크포인트를 그대로 쓰는 기존 경로."""

    name = 'torch'

    def __init__(self, ckpt_path):
        import torch
        from ..models.two_tower import TwoTower

        self._torch = torch
        ckpt = torch.load(ckpt_path, map_location='cpu', weights_only=False)
        model = TwoTower(ckpt['user_dim'], ckpt['route_dim'], latent=ckpt.get('latent', 4))
        model.load_state_dict(ckpt['state_dict'])
        model.eval()
        self.model = model

    def _run(self, fn, rows):
        with self._torch.no_grad():
            t = self._torch.tensor(rows, dtype=self._torch.float32)
            return fn(t).tolist()

    def weights(self, rows):
        return self._run(self.model.weights, rows)

    def satisfaction(self, rows):
        return self._run(self.model.satisfaction, rows)


class LoadedModel:
    """추론 핸들. 백엔드가 뭐든 리스트를 받고 리스트를 돌려준다."""

    def __init__(self, backend):
        self._backend = backend
        # report.py·diagnose.py 가 torch 모듈을 직접 쓴다(오프라인 분석 도구).
        self.model = getattr(backend, 'model', None)

    @property
    def engine(self) -> str:
        return self._backend.name

    def weights(self, rows) -> list:
        """[[프로필 인코딩], ...] → [[축별 가중치 w], ...] (합=1)"""
        return self._backend.weights(rows)

    def satisfaction(self, rows) -> list:
        """[[경로 특성], ...] → [[축별 만족도 f], ...] (0~1)"""
        return self._backend.satisfaction(rows)


def load_model(ckpt_path=None, engine=None) -> LoadedModel:
    """추론 핸들 로드.

    engine: 'torch' | 'pure' | 'auto'(기본). 환경변수 NEONAVI_ENGINE 로도 준다.
    'auto' 는 torch 가 있으면 torch, 없으면 pure — 배포 환경(torch 미설치)에서
    설정 없이 자동으로 순수 파이썬으로 떨어지고, 로컬은 지금과 똑같이 돈다.
    """
    engine = (engine or os.environ.get('NEONAVI_ENGINE') or 'auto').lower()
    if engine not in ('auto', 'torch', 'pure'):
        raise ValueError(f'알 수 없는 엔진: {engine}')

    if engine == 'pure':
        return LoadedModel(_PureBackend(_DEFAULT_WEIGHTS))
    if engine == 'torch':
        return LoadedModel(_TorchBackend(ckpt_path or _DEFAULT_CKPT))

    try:
        return LoadedModel(_TorchBackend(ckpt_path or _DEFAULT_CKPT))
    except ImportError:
        return LoadedModel(_PureBackend(_DEFAULT_WEIGHTS))


def _route_id(route, idx):
    rid = route.get('id') if isinstance(route, dict) else getattr(route, 'id', None)
    return rid if rid is not None else f'route_{idx}'


# 사실 근거로 쓸 특성 — (키, 라벨, 낮을수록 좋은가, 포맷터, 의미 있는 최소 격차)
#
# ⚠️ 최소 격차가 없으면 **잡음이 근거로 승격된다.** 평균 속력 23.4 vs 23.0km/h 인
#    경로에 "평균 속력 가장 높음"이 붙었는데, 그 경로는 1등 경로보다 8분 느리고
#    3.3km 길었다. 1등이라는 사실은 맞지만 사용자에게는 아무 의미가 없다.
_FACT_SPECS = (
    ('duration_min', '가장 빠름', True, lambda v: f'{round(v)}분', 1.0),      # 1분
    ('distance_km', '가장 짧음', True, lambda v: f'{v:.1f}km', 0.5),          # 500m
    ('toll', '통행료 최저', True, lambda v: f'{int(v):,}원', 500.0),          # 500원
    ('signal_count', '신호 가장 적음', True, lambda v: f'{int(v)}개', 2.0),   # 2개
    ('curvature', '가장 매끄러움', True, lambda v: '', 0.0),                  # 아래 상대 기준
    ('avg_speed', '평균 속력 가장 높음', False, lambda v: f'{v:.0f}km/h', 3.0),  # 3km/h
)
# 절대 단위를 정하기 어려운 특성은 2등 대비 상대 격차로 본다
_RELATIVE_MIN_GAP = {'curvature': 0.10}
_MAX_HIGHLIGHTS = 2


def _highlights(idx: int, feats: list) -> list:
    """후보집합에서 이 경로만의 강점을 뽑는다.

    '스포티한 주행' 같은 축 이름은 사용자 성향의 이름이지 경로의 성질이 아니다.
    한 요청 안에서 모든 후보에 같은 문구가 붙어 설명 기능을 잃으므로,
    후보들과 실제로 비교해 이 경로가 **유일하게 1등인 항목**만 근거로 쓴다.
    """
    # 후보가 하나면 "후보집합에서 유일하게 1등"이라는 말 자체가 성립하지 않는다.
    # (예전엔 2등을 찾으려다 IndexError 로 추천 전체가 500 이 됐다. 짧은 O-D 나
    #  경유지 교란이 전부 중복 제거되면 실제로 pool 이 1개가 된다.)
    if len(feats) < 2:
        return []

    out = []
    for key, label, lower_better, fmt, min_gap in _FACT_SPECS:
        vals = [f.get(key) for f in feats]
        if any(v is None for v in vals):
            continue
        best = min(vals) if lower_better else max(vals)
        mine = vals[idx]
        if mine != best or sum(1 for v in vals if v == best) > 1:
            continue                      # 1등이 아니거나 동률이면 변별력이 없다
        runner = sorted(vals, reverse=not lower_better)[1]
        gap = abs(runner - mine)
        # 1등이어도 격차가 무의미하면 근거로 쓰지 않는다(잡음을 근거로 포장하지 않기)
        rel = _RELATIVE_MIN_GAP.get(key)
        floor = abs(runner) * rel if rel is not None else min_gap
        if gap < floor:
            continue
        detail = fmt(mine)
        if key == 'toll' and mine == 0:
            out.append(f'통행료 없음 ({int(gap):,}원 절약)')
        elif key == 'duration_min' and gap >= 1:
            out.append(f'가장 빠름 ({detail}, 다음보다 {round(gap)}분 빠름)')
        elif key == 'curvature':
            out.append(label)
        elif detail:
            out.append(f'{label} ({detail})')
        else:
            out.append(label)
        if len(out) >= _MAX_HIGHLIGHTS:
            break
    return out


# 1등 항목이 없는 경로용 — 추천 경로와의 차이를 그대로 쓴다.
# (키, 좋아짐 문구, 나빠짐 문구, 낮을수록 좋은가, 의미 있는 최소 차이, 포맷터)
_DELTA_SPECS = (
    ('duration_min', '{v} 빠름', '{v} 느림', True, 1.0, lambda d: f'{round(d)}분'),
    ('toll', '통행료 {v} 저렴', '통행료 {v} 비쌈', True, 100.0, lambda d: f'{int(d):,}원'),
    ('distance_km', '{v} 짧음', '{v} 더 돌아감', True, 0.3, lambda d: f'{d:.1f}km'),
    ('signal_count', '신호 {v} 적음', '신호 {v} 많음', True, 1.0, lambda d: f'{int(d)}개'),
)


def _tradeoff(idx: int, ref: int, feats: list) -> list:
    """추천 경로(ref) 대비 이 경로의 장단점 한 쌍.

    후보의 44%는 어떤 항목에서도 1등이 아니다. 그런 경로에 '강점 없음'만 쓰면
    목록의 절반이 같은 문구가 되므로, 무엇을 얻고 무엇을 잃는지로 대신한다.
    """
    better, worse = None, None
    for key, up, down, lower_better, eps, fmt in _DELTA_SPECS:
        mine, other = feats[idx].get(key), feats[ref].get(key)
        if mine is None or other is None:
            continue
        gain = (other - mine) if lower_better else (mine - other)
        if gain >= eps and better is None:
            better = up.format(v=fmt(abs(gain)))
        elif gain <= -eps and worse is None:
            worse = down.format(v=fmt(abs(gain)))
    if worse and not better:
        return [f'추천 경로보다 {worse}']       # 단점뿐이면 기준을 밝혀야 읽힌다
    return [x for x in (better, worse) if x]


# 사용자가 실제로 치르는 비용. 이 셋이 전부 나쁘면 "성향에 맞다"고 말할 수 없다.
_COST_KEYS = ('duration_min', 'distance_km', 'toll')


def _is_dominated(idx: int, feats: list) -> bool:
    """다른 후보가 시간·거리·통행료를 **모두** 같거나 더 잘 내는가."""
    mine = feats[idx]
    for j, other in enumerate(feats):
        if j == idx:
            continue
        vals = [(other.get(k), mine.get(k)) for k in _COST_KEYS]
        if any(o is None or v is None for o, v in vals):
            continue
        if all(o <= v for o, v in vals) and any(o < v for o, v in vals):
            return True
    return False


def _pick_top(scores, feats: list) -> int:
    """1순위를 고른다 — 단, **파레토 지배당하는 경로는 1순위가 될 수 없다.**

    점수만 보면 지배당한 경로가 1등이 되는 일이 실제로 일어난다(546건 중 25건,
    최악 +6분/+4.6km). 원인은 sports 축이 보상하는 `avg_speed` 가 **거리를 늘려서
    올릴 수 있는 값**이라는 데 있다 — 고속 구간으로 크게 돌면 총 시간·거리는
    나빠지는데 평균 속력은 올라간다. 그래서 "의도적으로 돌아가는 길"이 1등이 된다.

    축 정의를 고치려면 재학습이 필요하므로(검증 수치가 전부 무효가 된다) 여기서는
    서빙 단계 가드레일로 막는다. 시간·거리·통행료가 모두 남만 못한 경로를 1순위로
    내놓는 건 어떤 성향으로도 설명할 수 없다 — 실제로 그런 경로엔 근거 문구조차
    만들어지지 않는다.
    """
    order = sorted(range(len(feats)), key=lambda i: float(scores[i]), reverse=True)
    for i in order:
        if not _is_dominated(i, feats):
            return i
    return order[0]   # 전부 지배당하는 일은 없지만(지배는 비순환) 방어적으로


def _reason(highlights: list, solo: bool = False, is_top: bool = False) -> str:
    """근거 조각 → 한 줄 문장. 내세울 게 없으면 솔직히 그렇게 쓴다.

    solo:   후보가 하나뿐. 비교 상대가 없으니 강점도 대안도 말할 수 없다.
    is_top: 1순위. 어느 항목에서도 단독 1등은 아니지만 축을 종합하면 가장 높다.
            (둘 다 처리하지 않으면 1순위나 유일 경로에 '추천 경로와 비슷한 대안'이
             붙어, 추천 경로가 자기 자신을 대안이라 부르는 문장이 된다.)
    """
    if highlights:
        return ' · '.join(highlights)
    if solo:
        return '이 구간에서 찾은 유일한 경로'
    if is_top:
        return '성향을 종합하면 가장 잘 맞는 경로'
    return '추천 경로와 비슷한 대안'


def _peer_avg(idx: int, feats: list) -> dict:
    """나머지 후보들의 특성 평균 — 상세 화면의 '후보 평균' 열.

    자기 자신을 빼야 "내가 평균보다 낫다"는 비교가 성립한다.
    후보가 하나뿐이면 비교 대상이 없으므로 빈 dict 를 준다(화면이 열을 숨긴다).
    """
    others = [f for j, f in enumerate(feats) if j != idx]
    if not others:
        return {}
    keys = [k for k, v in feats[idx].items() if isinstance(v, (int, float))]
    out = {}
    for k in keys:
        vals = [float(f[k]) for f in others if isinstance(f.get(k), (int, float))]
        if vals:
            out[k] = round(sum(vals) / len(vals), 4)
    return out


def recommend(user_profile, candidate_routes, model=None, enrich=False,
              weights=None) -> list:
    """모델 스코어링으로 점수 내림차순 Recommendation 리스트 반환.

    candidate_routes: CandidateRoute/dict 리스트. 원시특성은 vectorize 로 추출.
    weights: 성향 가중치 dict 를 직접 지정(사용자가 모드를 손으로 고른 경우).
             None 이면 프로필에서 추론한다(자동 추천). mode_weights() 참고.
    """
    if not candidate_routes:
        return []
    handle = model or load_model()

    # 학습과 동일: 후보집합 내 상대 정규화(vectorize.normalize)
    feats = [vectorize.build_feature_vector(r, enrich=enrich) for r in candidate_routes]
    norms = vectorize.normalize(feats)

    w = ([float(weights[a]) for a in PREFERENCE_AXES] if weights
         else handle.weights([encode_profile(user_profile)])[0])       # (3,)
    f = handle.satisfaction([feature_row(n) for n in norms])           # (N, 3)
    scores = [sum(wi * fi for wi, fi in zip(w, row)) for row in f]     # (N,)
    top = _pick_top(scores, feats)                 # 대안 설명의 기준점
    w_dict = {a: float(w[i]) for i, a in enumerate(PREFERENCE_AXES)}

    # 축 만족도는 후보끼리 비교해야 의미가 생긴다(전 후보에 같은 축 문구가
    # 붙는 걸 막으려면 근거 생성기가 남의 값도 봐야 한다).
    axes_all = [{a: float(f[j][i]) for i, a in enumerate(PREFERENCE_AXES)}
                for j in range(len(candidate_routes))]

    recs = []
    for idx, route in enumerate(candidate_routes):
        f_dict = axes_all[idx]
        marks = _highlights(idx, feats) or (_tradeoff(idx, top, feats) if idx != top else [])
        recs.append(Recommendation(
            route_id=_route_id(route, idx),
            score=round(float(scores[idx]), 4),
            reason=_reason(marks, solo=len(candidate_routes) == 1, is_top=idx == top),
            features={a: round(v, 3) for a, v in f_dict.items()},
            highlights=marks,
            # 상세 화면의 '추천하는 이유' 카드. 여기서 만들어 두면 상세를 열 때
            # 추가 호출이 없다(같은 후보집합·같은 w·f 라 설명이 어긋나지 않는다).
            reasons=reasons.build(idx, feats, axes_all, w_dict, top_idx=top),
            raw_features={k: round(float(v), 4) for k, v in feats[idx].items()
                          if isinstance(v, (int, float))},
            peer_features=_peer_avg(idx, feats),
        ))
    # 점수 내림차순. 단 가드레일이 고른 1순위(top)는 맨 앞에 둔다 — 점수만으로
    # 정렬하면 지배당한 경로가 다시 1번 자리로 올라온다.
    top_id = _route_id(candidate_routes[top], top)
    recs.sort(key=lambda r: (r.route_id != top_id, -r.score))
    return recs


# 반사실 설명용 대표 프로필 — "다른 성향이었다면 어떤 경로였을까"를 계산한다.
# 규칙 프리셋(MODE_PRESETS) 대신 이 프로필들을 User Tower 에 통과시킨다.
# 실제 사용자 랭킹과 같은 경로로 계산해야 '내 성향 배지가 1순위가 아닌' 모순이
# 줄기 때문(측정: 규칙 프리셋 모순율 12.0% vs 대표 프로필 2.9%).
REPRESENTATIVE_PROFILES = {
    'sports': {'age': 28, 'gender': 'M', 'passenger': 'alone',
               'car_type': 'sedan', 'load_kg': 0, 'car_age': 1},
    'comfort': {'age': 68, 'gender': 'F', 'passenger': 'vulnerable',
                'car_type': 'suv', 'load_kg': 60, 'car_age': 2},
    'eco': {'age': 45, 'gender': 'F', 'passenger': 'alone',
            'car_type': 'compact', 'load_kg': 0, 'car_age': 9},
}


def mode_weights(mode: str, model=None) -> dict:
    """사용자가 손으로 고른 모드 → 성향 가중치.

    규칙 프리셋(MODE_PRESETS)을 바로 쓰지 않고 **대표 프로필을 User Tower 에
    통과시킨다**. 반사실 배지가 같은 방식으로 계산되므로, 이렇게 해야 '스포티
    모드인데 스포티 배지가 1순위가 아닌' 모순이 구조적으로 생기지 않는다.
    """
    profile = REPRESENTATIVE_PROFILES.get(mode)
    if profile is None:
        raise ValueError(f'알 수 없는 모드: {mode}')
    handle = model or load_model()
    w = handle.weights([encode_profile(profile)])[0]
    return {a: float(w[i]) for i, a in enumerate(PREFERENCE_AXES)}


def counterfactual_tops(candidate_routes, model=None, enrich=False) -> dict:
    """{모드: 그 성향이었다면 1순위였을 route_id}.

    후보 특성은 한 번만 계산하고 가중치만 갈아끼운다(모델 호출 1회).
    """
    if not candidate_routes:
        return {}
    handle = model or load_model()

    feats = [vectorize.build_feature_vector(r, enrich=enrich) for r in candidate_routes]
    norms = vectorize.normalize(feats)
    f = handle.satisfaction([feature_row(n) for n in norms])

    tops = {}
    for mode, profile in REPRESENTATIVE_PROFILES.items():
        w = handle.weights([encode_profile(profile)])[0]
        # 배지도 랭킹과 같은 가드레일을 거쳐야 한다. 안 그러면 1순위에서 금지한
        # 경로를 "스포티 우선이라면 이 경로"라고 가리키게 된다.
        scores = [sum(wi * fi for wi, fi in zip(w, row)) for row in f]
        idx = _pick_top(scores, feats)
        tops[mode] = _route_id(candidate_routes[idx], idx)
    return tops


def describe_preference(user_profile, model=None, weights=None) -> dict:
    """무엇을 우선해 랭킹했는지 — 리스트 상단에 한 번만 보여줄 요약.

    성향은 사용자당 하나이므로 경로마다 반복하면 설명이 아니라 소음이 된다.
    weights 를 주면(수동 모드) 그 가중치를 그대로 설명한다.
    """
    if weights is None:
        handle = model or load_model()
        w = handle.weights([encode_profile(user_profile)])[0]
        weights = {a: float(w[i]) for i, a in enumerate(PREFERENCE_AXES)}
    weights = {a: round(float(weights[a]), 3) for a in PREFERENCE_AXES}
    axis = max(weights, key=weights.get)
    return {'axis': axis, 'label': AXIS_KOR.get(axis, axis), 'weights': weights}
