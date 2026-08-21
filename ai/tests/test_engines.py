"""torch 엔진 ↔ 순수 파이썬 엔진 동치성.

서빙에 torch(733MB)를 들고 가지 않으려고 순수 파이썬 백엔드를 뒀다. 두 경로가
**같은 추천을 내놓는지**가 이 교체의 전제라, 그 전제를 테스트로 못박는다.

차이는 float32(torch) ↔ float64(파이썬) 반올림뿐이라야 한다.
"""
from ai.recommender import model_a

# 합성 후보 — 실제 수집 없이 돌린다(네트워크·공공데이터 불필요)
CANDIDATES = [
    {'id': 'a', 'coords': [(127.0, 37.5), (127.02, 37.5), (127.04, 37.5)],
     'distance_km': 8.0, 'duration_min': 14.0, 'toll': 0.0},
    {'id': 'b', 'coords': [(127.0, 37.5), (127.01, 37.504), (127.03, 37.5),
                           (127.05, 37.506)],
     'distance_km': 11.0, 'duration_min': 16.0, 'toll': 1200.0},
    {'id': 'c', 'coords': [(127.0, 37.5), (127.03, 37.51), (127.06, 37.5)],
     'distance_km': 13.5, 'duration_min': 22.0, 'toll': 0.0},
]

PROFILES = [
    {'age': 28, 'gender': 'M', 'passenger': 'alone', 'car_type': 'sedan',
     'load_kg': 0, 'car_age': 1},
    {'age': 68, 'gender': 'F', 'passenger': 'vulnerable', 'car_type': 'suv',
     'load_kg': 60, 'car_age': 2},
    {'age': 45, 'gender': 'F', 'passenger': 'alone', 'car_type': 'compact',
     'load_kg': 0, 'car_age': 9},
]

TOL = 1e-5      # float32 반올림 여유. 실측 오차는 2.6e-07 수준이다.


def _both():
    return model_a.load_model(engine='torch'), model_a.load_model(engine='pure')


def test_두_엔진이_같은_순위를_낸다():
    t, p = _both()
    for profile in PROFILES:
        rt = model_a.recommend(profile, CANDIDATES, model=t)
        rp = model_a.recommend(profile, CANDIDATES, model=p)
        assert [r.route_id for r in rt] == [r.route_id for r in rp]


def test_점수가_반올림_오차_안에서_같다():
    t, p = _both()
    for profile in PROFILES:
        rt = model_a.recommend(profile, CANDIDATES, model=t)
        rp = model_a.recommend(profile, CANDIDATES, model=p)
        for a, b in zip(rt, rp):
            assert abs(a.score - b.score) < TOL, (a.route_id, a.score, b.score)


def test_설명도_같다():
    """근거 문구는 점수가 아니라 특성 비교에서 나오므로 완전히 같아야 한다."""
    t, p = _both()
    for profile in PROFILES:
        rt = model_a.recommend(profile, CANDIDATES, model=t)
        rp = model_a.recommend(profile, CANDIDATES, model=p)
        for a, b in zip(rt, rp):
            assert a.reason == b.reason
            assert a.highlights == b.highlights
            assert [c['title'] for c in a.reasons] == [c['title'] for c in b.reasons]


def test_성향_가중치가_같다():
    t, p = _both()
    for profile in PROFILES:
        wt = model_a.describe_preference(profile, model=t)
        wp = model_a.describe_preference(profile, model=p)
        assert wt['axis'] == wp['axis']
        for axis in wt['weights']:
            assert abs(wt['weights'][axis] - wp['weights'][axis]) < 1e-3


def test_반사실_배지가_같다():
    t, p = _both()
    assert (model_a.counterfactual_tops(CANDIDATES, model=t)
            == model_a.counterfactual_tops(CANDIDATES, model=p))


def test_모드_가중치가_같다():
    t, p = _both()
    for mode in ('sports', 'comfort', 'eco'):
        wt = model_a.mode_weights(mode, model=t)
        wp = model_a.mode_weights(mode, model=p)
        for axis in wt:
            assert abs(wt[axis] - wp[axis]) < TOL


def test_auto_는_torch_가_있으면_torch_를_쓴다():
    assert model_a.load_model(engine='auto').engine == 'torch'


def test_pure_핸들은_torch_모듈을_들지_않는다():
    assert model_a.load_model(engine='pure').model is None
