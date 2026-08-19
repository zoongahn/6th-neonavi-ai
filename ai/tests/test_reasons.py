"""추천 근거 카드(recommender/reasons.py) sanity 테스트.

이 모듈의 존재 이유가 '지어내지 않는 근거'라서, 지켜야 할 성질을 테스트로 못박는다.
특히 **잡음을 근거로 승격하지 않는다**와 **모든 후보에 같은 말을 붙이지 않는다** 둘.
"""
from ai.recommender import reasons

W = {'sports': 0.2, 'comfort': 0.6, 'fuel': 0.2}


def _feat(**kw):
    base = dict(distance_km=10.0, duration_min=20.0, avg_speed=30.0, toll=0.0,
                congestion=0.2, turn_count=10.0, curvature=0.003, slope=0.05,
                fuel_cost=1.0, signal_count=0.0, road_type=0.1, speed_limit=50.0)
    base.update(kw)
    return base


def test_no_card_when_gap_is_noise():
    """1등이어도 격차가 잡음 수준이면 근거로 쓰지 않는다."""
    feats = [_feat(duration_min=20.0), _feat(duration_min=20.1)]
    cards = reasons.build(0, feats, None, None)
    assert not any('빨리' in c['title'] for c in cards)


def test_card_when_gap_is_meaningful():
    """격차가 뚜렷하면 근거로 쓴다."""
    feats = [_feat(duration_min=20.0), _feat(duration_min=40.0)]
    cards = reasons.build(0, feats, None, None)
    assert any('가장 빨리' in c['title'] for c in cards)


def test_worse_than_average_gets_no_card():
    """평균보다 나쁜 특성은 근거가 될 수 없다."""
    feats = [_feat(duration_min=40.0), _feat(duration_min=20.0)]
    cards = reasons.build(0, feats, None, None)
    assert not any('빨리' in c['title'] for c in cards)


def test_axis_card_only_for_routes_strong_on_that_axis():
    """축 카드가 전 후보에 붙으면 설명이 아니라 장식이다.

    (실제로 그랬다 — 축 만족도 37점짜리 경로에도 '성향에 맞는 경로'가 붙었다.)
    """
    feats = [_feat(), _feat()]
    axes = [{'sports': 0.9, 'comfort': 0.9, 'fuel': 0.9},
            {'sports': 0.2, 'comfort': 0.2, 'fuel': 0.2}]
    strong = reasons.build(0, feats, axes, W)
    weak = reasons.build(1, feats, axes, W)
    assert any(c['icon'] == '🎯' for c in strong)
    assert not any(c['icon'] == '🎯' for c in weak)


def test_high_relative_gap_but_low_absolute_is_rejected():
    """고속도로 4%인데 '평균보다 86% 높음'으로 '큰 도로 위주'라 말하면 과장이다."""
    feats = [_feat(road_type=0.04), _feat(road_type=0.01)]
    cards = reasons.build(0, feats, None, None)
    assert not any('큰 도로' in c['title'] for c in cards)

    feats = [_feat(road_type=0.60), _feat(road_type=0.10)]
    cards = reasons.build(0, feats, None, None)
    assert any('큰 도로' in c['title'] for c in cards)


def test_route_without_strengths_still_explains_itself():
    """내세울 게 없어도 침묵하지 않는다 — 왜 목록에 있는지는 말해야 한다."""
    feats = [_feat(duration_min=20.0, distance_km=10.0),
             _feat(duration_min=35.0, distance_km=18.0)]
    cards = reasons.build(1, feats, None, None, top_idx=0)
    assert cards, '카드가 하나도 없으면 사용자는 이유를 알 수 없다'
    assert '느림' in cards[0]['desc']       # 손해를 숨기지 않는다


def test_single_candidate_makes_no_comparative_claim():
    """후보가 하나면 '가장 ~' 이라는 말 자체가 성립하지 않는다."""
    cards = reasons.build(0, [_feat()], None, None)
    assert not any('가장' in c['title'] for c in cards)


def test_cards_are_capped():
    feats = [_feat(duration_min=10.0, congestion=0.01, curvature=0.0001, slope=0.001,
                   road_type=0.8, fuel_cost=0.3, toll=0.0, signal_count=0.0),
             _feat(duration_min=60.0, congestion=0.9, curvature=0.05, slope=0.5,
                   road_type=0.05, fuel_cost=3.0, toll=5000.0, signal_count=10.0)]
    axes = [{'sports': 0.9, 'comfort': 0.9, 'fuel': 0.9},
            {'sports': 0.1, 'comfort': 0.1, 'fuel': 0.1}]
    cards = reasons.build(0, feats, axes, W)
    assert len(cards) <= reasons.MAX_CARDS
