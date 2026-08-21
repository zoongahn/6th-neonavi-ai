"""학습된 체크포인트(model_a.pt) → 순수 파이썬 추론용 가중치 JSON.

    .venv/bin/python -m ai.export_weights

**왜 필요한가.** 서빙에 torch 를 들고 가면 733MB 다. 모델은 파라미터가 1,062개
(Linear 13→32→3, 12→32→3)뿐이라 순수 파이썬으로 계산해도 되고, 그러면 배포
용량이 22.5KB 로 줄고 콜드스타트마다 torch import 0.8초를 아낀다.
Vercel 서버리스의 250MB 한도도 이걸로 통과한다.

**정확도.** float32(torch) ↔ float64(파이썬) 반올림 차이뿐이라 알고리즘이 같다.
무작위 2,000회 대조에서 점수 최대오차 2.6e-07, 랭킹 불일치 0건. 서빙 마진이
0.27~0.37 이므로 여섯 자릿수 아래다.

학습은 계속 torch 로 한다. 재학습할 때마다 이 스크립트를 다시 돌려야 한다.
"""
import json
import os

import torch

from .models.two_tower import TwoTower

_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DEFAULT_CKPT = os.path.join(_DATA_DIR, 'model_a.pt')
DEFAULT_OUT = os.path.join(_DATA_DIR, 'model_weights.json')


def export(ckpt_path: str = None, out_path: str = None) -> str:
    ckpt_path = ckpt_path or DEFAULT_CKPT
    out_path = out_path or DEFAULT_OUT

    ckpt = torch.load(ckpt_path, map_location='cpu', weights_only=False)
    model = TwoTower(ckpt['user_dim'], ckpt['route_dim'], latent=ckpt.get('latent', 4))
    model.load_state_dict(ckpt['state_dict'])
    model.eval()

    payload = {
        'user_dim': ckpt['user_dim'],
        'route_dim': ckpt['route_dim'],
        'latent': ckpt.get('latent', 4),
        # nn.Linear.weight 는 (out, in). 순수 구현도 같은 방향으로 읽는다.
        'tensors': {k: v.tolist() for k, v in model.state_dict().items()},
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f)

    n = sum(p.numel() for p in model.parameters())
    size_kb = os.path.getsize(out_path) / 1024
    print(f'{ckpt_path} → {out_path}')
    print(f'파라미터 {n}개 · {size_kb:.1f}KB')
    return out_path


if __name__ == '__main__':
    export()
