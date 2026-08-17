"""방안 A — 학습 모델 추천.

학습된 Two-Tower 체크포인트(ai/data/model_a.pt)를 로드해 후보 경로를 스코어링한다.
score = w · f (w=User Tower 성향 가중치, f=Route Tower 축 만족도).

⚠️ 라벨이 규칙에서 나오므로 A의 성능 상한 = 규칙 품질(R1). A의 가치는
   '규칙을 이긴다'가 아니라 미정의 조합 일반화·특성 상호작용·부드러운 스코어.
baseline_b 와 동일한 Recommendation 을 반환해 서빙에서 교체 가능.
"""
import os

import torch

from ..schema import Recommendation, PREFERENCE_AXES
from ..features import vectorize
from ..encoders import encode_profile, feature_row
from ..models.two_tower import TwoTower

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
_DEFAULT_CKPT = os.path.join(_DATA_DIR, 'model_a.pt')

AXIS_KOR = {'sports': '스포티한 주행', 'comfort': '편안함', 'fuel': '경제성', 'safety': '안전'}


class LoadedModel:
    """체크포인트 1개를 감싼 추론 핸들."""

    def __init__(self, model):
        self.model = model


def load_model(ckpt_path=None) -> LoadedModel:
    """학습된 Two-Tower 체크포인트 로드."""
    ckpt_path = ckpt_path or _DEFAULT_CKPT
    ckpt = torch.load(ckpt_path, map_location='cpu', weights_only=False)
    model = TwoTower(ckpt['user_dim'], ckpt['route_dim'], latent=ckpt.get('latent', 4))
    model.load_state_dict(ckpt['state_dict'])
    model.eval()
    return LoadedModel(model)


def _route_id(route, idx):
    rid = route.get('id') if isinstance(route, dict) else getattr(route, 'id', None)
    return rid if rid is not None else f'route_{idx}'


# 사실 근거로 쓸 특성 — (키, 라벨, 낮을수록 좋은가, 포맷터)
_FACT_SPECS = (
    ('duration_min', '가장 빠름', True, lambda v: f'{round(v)}분'),
    ('distance_km', '가장 짧음', True, lambda v: f'{v:.1f}km'),
    ('toll', '통행료 최저', True, lambda v: f'{int(v):,}원'),
    ('signal_count', '신호 가장 적음', True, lambda v: f'{int(v)}개'),
    ('curvature', '가장 매끄러움', True, lambda v: ''),
    ('avg_speed', '평균 속력 가장 높음', False, lambda v: f'{v:.0f}km/h'),
)
_MAX_HIGHLIGHTS = 2


def _highlights(idx: int, feats: list) -> list:
    """후보집합에서 이 경로만의 강점을 뽑는다.

    '스포티한 주행' 같은 축 이름은 사용자 성향의 이름이지 경로의 성질이 아니다.
    한 요청 안에서 모든 후보에 같은 문구가 붙어 설명 기능을 잃으므로,
    후보들과 실제로 비교해 이 경로가 **유일하게 1등인 항목**만 근거로 쓴다.
    """
    out = []
    for key, label, lower_better, fmt in _FACT_SPECS:
        vals = [f.get(key) for f in feats]
        if any(v is None for v in vals):
            continue
        best = min(vals) if lower_better else max(vals)
        mine = vals[idx]
        if mine != best or sum(1 for v in vals if v == best) > 1:
            continue                      # 1등이 아니거나 동률이면 변별력이 없다
        runner = sorted(vals, reverse=not lower_better)[1]
        gap = abs(runner - mine)
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


def _reason(highlights: list) -> str:
    """근거 조각 → 한 줄 문장. 내세울 게 없으면 솔직히 그렇게 쓴다."""
    return ' · '.join(highlights) if highlights else '추천 경로와 비슷한 대안'


@torch.no_grad()
def recommend(user_profile, candidate_routes, model=None, enrich=False) -> list:
    """모델 스코어링으로 점수 내림차순 Recommendation 리스트 반환.

    candidate_routes: CandidateRoute/dict 리스트. 원시특성은 vectorize 로 추출.
    """
    if not candidate_routes:
        return []
    handle = model or load_model()
    m = handle.model

    # 학습과 동일: 후보집합 내 상대 정규화(vectorize.normalize)
    feats = [vectorize.build_feature_vector(r, enrich=enrich) for r in candidate_routes]
    norms = vectorize.normalize(feats)
    user_x = torch.tensor([encode_profile(user_profile)], dtype=torch.float32)
    route_x = torch.tensor([feature_row(n) for n in norms], dtype=torch.float32)

    w = m.weights(user_x)[0]                       # (4,)
    f = m.satisfaction(route_x)                    # (N, 4)
    scores = (f * w).sum(dim=-1)                   # (N,)
    top = int(torch.argmax(scores))                # 대안 설명의 기준점

    recs = []
    for idx, route in enumerate(candidate_routes):
        f_dict = {a: float(f[idx][i]) for i, a in enumerate(PREFERENCE_AXES)}
        marks = _highlights(idx, feats) or (_tradeoff(idx, top, feats) if idx != top else [])
        recs.append(Recommendation(
            route_id=_route_id(route, idx),
            score=round(float(scores[idx]), 4),
            reason=_reason(marks),
            features={a: round(v, 3) for a, v in f_dict.items()},
            highlights=marks,
        ))
    recs.sort(key=lambda r: r.score, reverse=True)
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


@torch.no_grad()
def counterfactual_tops(candidate_routes, model=None, enrich=False) -> dict:
    """{모드: 그 성향이었다면 1순위였을 route_id}.

    후보 특성은 한 번만 계산하고 가중치만 갈아끼운다(모델 호출 1회).
    """
    if not candidate_routes:
        return {}
    handle = model or load_model()
    m = handle.model

    norms = vectorize.normalize(
        [vectorize.build_feature_vector(r, enrich=enrich) for r in candidate_routes])
    f = m.satisfaction(torch.tensor([feature_row(n) for n in norms], dtype=torch.float32))

    tops = {}
    for mode, profile in REPRESENTATIVE_PROFILES.items():
        w = m.weights(torch.tensor([encode_profile(profile)], dtype=torch.float32))[0]
        idx = int(torch.argmax((f * w).sum(dim=-1)))
        tops[mode] = _route_id(candidate_routes[idx], idx)
    return tops


@torch.no_grad()
def describe_preference(user_profile, model=None) -> dict:
    """이 사용자가 무엇을 우선하는지 — 리스트 상단에 한 번만 보여줄 요약.

    성향은 사용자당 하나이므로 경로마다 반복하면 설명이 아니라 소음이 된다.
    """
    handle = model or load_model()
    w = handle.model.weights(
        torch.tensor([encode_profile(user_profile)], dtype=torch.float32))[0]
    weights = {a: round(float(w[i]), 3) for i, a in enumerate(PREFERENCE_AXES)}
    axis = max(weights, key=weights.get)
    return {'axis': axis, 'label': AXIS_KOR.get(axis, axis), 'weights': weights}
