"""Route Tower 축 붕괴 진단 — 학습 전/후 비교용 지표.

층1 정확도(train.py)는 트레이드오프 쌍에서만 재므로, 실제 서빙 후보집합에서
성향축이 살아있는지를 잡아내지 못한다. 이 모듈이 그 사각지대를 측정한다.

지표:
  1. 축 간 상관   — f 의 3축이 서로 얼마나 붙어있나(1에 가까우면 단일 품질축으로 붕괴)
  2. 모드 갈림    — 성향(sports/comfort/eco)별 1순위가 실제로 갈리는 O-D 비율
  3. 파레토 지배  — 후보집합에 모든 축 우세 경로가 있나(있으면 동의가 정당)

규칙(project_to_axes)을 같은 방식으로 측정해 상한/기준선으로 함께 낸다.
설계: docs/축붕괴_f앵커_설계.md

실행: .venv/bin/python -m ai.diagnose
"""
import collections
import json
import os
import statistics

import pyarrow.parquet as pq
import torch

from .encoders import feature_row
from .features import vectorize
from .recommender import model_a
from .schema import MODE_PRESETS, PREFERENCE_AXES

_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
MODES = ('sports', 'comfort', 'eco')

# 서빙과 동일한 후보 선별(kakao.fetch_pool mode='serve')
SERVE_DETOUR = 1.5
SERVE_TOP = 5


def load_candidate_sets(routes_path=None, min_candidates=3) -> list:
    """routes.parquet → O-D별 serve 후보 리스트. 서빙 입력 분포를 그대로 재현한다."""
    routes_path = routes_path or os.path.join(_DATA_DIR, 'routes.parquet')
    groups = collections.defaultdict(list)
    for row in pq.read_table(routes_path).to_pylist():
        coords = row.get('coords')
        if isinstance(coords, str):        # parquet 에 JSON 문자열로 저장돼 있다
            row['coords'] = [tuple(p) for p in json.loads(coords)]
        groups[row['od_id']].append(row)

    sets = []
    for od in sorted(groups):
        cands = groups[od]
        best = min(c['duration_min'] for c in cands)
        kept = [c for c in cands if c['duration_min'] <= best * SERVE_DETOUR]
        kept.sort(key=lambda c: c['duration_min'])
        kept = kept[:SERVE_TOP]
        if len(kept) >= min_candidates:
            sets.append(kept)
    return sets


def _axes_pairs(rows) -> float:
    """축 만족도 dict 리스트 → 축쌍 상관의 평균. 분산 0이면 해당 쌍은 건너뛴다."""
    vals = []
    for x, y in (('sports', 'comfort'), ('sports', 'fuel'), ('comfort', 'fuel')):
        try:
            vals.append(statistics.correlation([r[x] for r in rows], [r[y] for r in rows]))
        except statistics.StatisticsError:
            pass
    return statistics.mean(vals) if vals else float('nan')


def _mode_winner(axis_vals) -> dict:
    """성향축 만족도 → 모드별 1순위 인덱스(규칙 가중치 MODE_PRESETS 기준)."""
    out = {}
    for mode in MODES:
        w = MODE_PRESETS[mode]
        out[mode] = max(range(len(axis_vals)),
                        key=lambda i: sum(w.get(a, 0.0) * axis_vals[i][a] for a in PREFERENCE_AXES))
    return out


def _dominates(a, b, eps=1e-3) -> bool:
    """a 가 모든 축에서 b 이상이고 한 축 이상에서 우세한가(파레토 지배)."""
    diffs = [a[ax] - b[ax] for ax in PREFERENCE_AXES]
    return min(diffs) >= -eps and max(diffs) > eps


@torch.no_grad()
def diagnose(ckpt_path=None, routes_path=None, verbose=True) -> dict:
    """서빙 후보집합에서 모델·규칙의 축 구조를 측정해 지표 dict 반환."""
    handle = model_a.load_model(ckpt_path)
    sat = handle.model.satisfaction

    sets = load_candidate_sets(routes_path)
    model_rows, rule_rows = [], []
    split_model = split_rule = has_dom = 0

    for cands in sets:
        norms = vectorize.normalize([vectorize.build_feature_vector(c) for c in cands])
        rule_ax = [vectorize.project_to_axes(n) for n in norms]
        f = sat(torch.tensor([feature_row(n) for n in norms], dtype=torch.float32))
        model_ax = [{a: float(f[i][j]) for j, a in enumerate(PREFERENCE_AXES)}
                    for i in range(len(cands))]

        model_rows += model_ax
        rule_rows += rule_ax
        split_model += len(set(_mode_winner(model_ax).values())) > 1
        split_rule += len(set(_mode_winner(rule_ax).values())) > 1
        has_dom += any(all(_dominates(rule_ax[i], rule_ax[j])
                           for j in range(len(cands)) if j != i)
                       for i in range(len(cands)))

    n = len(sets)
    result = {
        'n_sets': n,
        'axis_corr_model': _axes_pairs(model_rows),
        'axis_corr_rule': _axes_pairs(rule_rows),
        'mode_split_model': split_model / n,
        'mode_split_rule': split_rule / n,
        'pareto_dominant': has_dom / n,
    }

    if verbose:
        print(f'serve 후보 {SERVE_TOP}개 이하·3개 이상인 O-D: {n}개\n')
        print('                        모델      규칙')
        print(f"  축 간 상관          {result['axis_corr_model']:+7.3f}  {result['axis_corr_rule']:+7.3f}"
              '   ← 낮을수록 축이 독립')
        print(f"  모드 갈림 비율      {result['mode_split_model']*100:6.1f}%  "
              f"{result['mode_split_rule']*100:6.1f}%   ← 높을수록 개인화 작동")
        print(f"\n  파레토 지배 경로 있는 후보집합: {result['pareto_dominant']*100:.1f}% "
              '(나머지는 진짜 트레이드오프)')
    return result


def main():
    diagnose()


if __name__ == '__main__':
    main()
