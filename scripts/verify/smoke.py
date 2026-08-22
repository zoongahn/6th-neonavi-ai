# -*- coding: utf-8 -*-
"""배포본 스모크 테스트 — 전 엔드포인트 × 정상/경계. 실패만 자세히 찍는다."""
import json, re, sys, time, urllib.request, urllib.error, pathlib

BASE = 'https://6th-neonavi-ai.vercel.app'
REPO = pathlib.Path('/home/ajh/dev/hongik/neonavi')

# Icon.jsx 가 아는 키 — 근거 카드 icon 이 여기 없으면 화면에서 아이콘이 비거나 폴백이 뜬다
icon_src = (REPO / 'frontend/src/components/Icon.jsx').read_text(encoding='utf-8')
body = icon_src[icon_src.index('export const ICONS'):icon_src.index('\nexport default')]
KNOWN_ICONS = set(re.findall(r"^\s{4}'?([a-zA-Z_][\w-]*)'?:\s*P\(", body, re.M))

results = []
def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('✅' if ok else '❌'), name, ('— ' + detail if detail and not ok else ''))

def req(method, path, payload=None, timeout=90):
    url = BASE + path
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(url, data=data, method=method,
                               headers={'Content-Type': 'application/json'})
    t0 = time.time()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode()), time.time() - t0
    except urllib.error.HTTPError as e:
        try: body = json.loads(e.read().decode())
        except Exception: body = {}
        return e.code, body, time.time() - t0
    except Exception as e:
        return 0, {'error': str(e)}, time.time() - t0

PROFILE = {'age': 27, 'gender': 'M', 'car_type': 'sedan', 'car_age': 3}
def rec_payload(o, d, mode='comfort', auto=True, profile=PROFILE, **kw):
    p = {'profile': profile, 'passenger': 'alone', 'load_kg': 0,
         'origin': o, 'destination': d, 'mode': mode,
         'auto_recommend': auto, 'departure_time': 'now'}
    p.update(kw); return p

print('═══ 1. 프로필 ═══')
st, prof, _ = req('POST', '/api/users/profile/', {
    'name': '스모크테스트', 'age': 27, 'gender': 'M', 'car_type': 'sedan', 'car_age': 3})
check('프로필 생성 201', st == 201, f'HTTP {st}: {prof}')
profile_id = prof.get('id')
check('프로필 id 반환', profile_id is not None)

print('═══ 2. 장소 검색 ═══')
for q, expect_any in [('강남역', True), ('ㅅ', None), ('asdfqwerzxcv없는곳', None), ('해운대해수욕장', True)]:
    st, d, t = req('GET', f'/api/routes/places/?q={urllib.parse.quote(q)}')
    ok = st == 200 and isinstance(d.get('places'), list)
    if expect_any: ok = ok and len(d['places']) > 0
    check(f'검색 "{q}" ({t:.1f}s)', ok, f'HTTP {st}')

print('═══ 3. 추천 — 정상 ═══')
st, rec, t = req('POST', '/api/routes/recommend/', rec_payload('강남역', '광화문'))
routes = rec.get('routes', [])
check(f'단거리 추천 200 ({t:.1f}s)', st == 200 and len(routes) >= 1, f'HTTP {st}')
if routes:
    r0 = routes[0]
    need = ['route_id', 'title', 'rank', 'distance_km', 'duration_min', 'toll',
            'axes', 'recommend_reasons', 'features', 'path']
    missing = [k for k in need if k not in r0]
    check('응답 스키마 (1위 경로)', not missing, f'누락: {missing} / 있는 키: {sorted(r0)[:12]}')
    icons = [c.get('icon') for r in routes for c in (r.get('recommend_reasons') or [])]
    bad = [i for i in icons if i not in KNOWN_ICONS]
    check(f'근거 카드 아이콘 키 전부 유효 ({len(icons)}장)', not bad, f'없는 키: {bad}')
    check('거리·시간 상식선', 5 < r0['distance_km'] < 30 and 10 < r0['duration_min'] < 120,
          f"{r0['distance_km']}km {r0['duration_min']}분")
    ranks = [r.get('rank') for r in routes]
    check('rank 0..n 연속', ranks == list(range(len(routes))), str(ranks))

print('═══ 4. 추천 — 모드·경계 ═══')
for mode in ('sports', 'eco'):
    st, d, t = req('POST', '/api/routes/recommend/', rec_payload('강남역', '광화문', mode=mode, auto=False))
    check(f'모드 {mode} ({t:.1f}s)', st == 200 and d.get('routes'), f'HTTP {st}')
st, d, t = req('POST', '/api/routes/recommend/',
               rec_payload('서정센텀퍼스티지아파트', '해운대해수욕장'))
lr = d.get('routes', [])
check(f'장거리 400km ({t:.1f}s)', st == 200 and lr, f'HTTP {st}')
if lr:
    check('장거리 시간 표시용 값 상식선', 200 < lr[0]['duration_min'] < 420,
          f"{lr[0]['duration_min']}분")
st, d, t = req('POST', '/api/routes/recommend/', rec_payload('강남역', '강남역'))
check(f'같은 출발·도착 → 4xx 또는 안내 ({t:.1f}s)', st in (200, 400, 422),
      f'HTTP {st}: {str(d)[:100]}')
st, d, t = req('POST', '/api/routes/recommend/',
               rec_payload('강남역', '광화문', profile={'age': 100, 'gender': 'F', 'car_type': 'truck', 'car_age': 20}, load_kg=200))
check(f'극단 프로필(100세·트럭·200kg) ({t:.1f}s)', st == 200 and d.get('routes'), f'HTTP {st}')
st, d, t = req('POST', '/api/routes/recommend/', rec_payload('asdf없는출발지qwer', '광화문'))
check(f'없는 장소 → 오류 메시지 ({t:.1f}s)', st in (400, 404, 422) and d, f'HTTP {st}: {str(d)[:100]}')

print('═══ 5. 상세 explain ═══')
if routes:
    st, d, t = req('POST', '/api/routes/explain/',
                   {'profile': PROFILE, 'mode': 'comfort', 'axes': routes[0].get('axes', {})})
    check(f'explain 200 ({t:.1f}s)', st == 200, f'HTTP {st}: {str(d)[:100]}')

print('═══ 6. 주행 기록 사이클 ═══')
st, trip, _ = req('POST', '/api/trips/', {
    'profile': profile_id, 'passenger': 'alone', 'load_kg': 0,
    'origin_name': '스모크출발', 'destination_name': '스모크도착',
    'mode': 'comfort', 'auto_recommend': True, 'preference_axis': 'comfort',
    'candidate_count': 3, 'recommended_route_id': 'route_0',
    'selected_route_id': 'route_0', 'distance_km': 10.8, 'duration_min': 21, 'toll': 0})
trip_id = trip.get('id')
check('기록 저장 201 + id', st == 201 and trip_id, f'HTTP {st}: {trip}')
if trip_id:
    st, d, _ = req('POST', f'/api/trips/{trip_id}/feedback/', {'rating': 5, 'comment': '스모크'})
    check('피드백 저장', st in (200, 201), f'HTTP {st}: {d}')
    st, d, _ = req('GET', f'/api/trips/?profile={profile_id}')
    mine = d.get('trips', [])
    check('내 프로필 필터 조회에 방금 기록 있음',
          any(t_.get('id') == trip_id for t_ in mine), f'{len(mine)}건 중 없음')
    st, d, _ = req('GET', '/api/trips/?profile=999999')
    check('남의(없는) 프로필 조회에 내 기록 없음',
          st == 200 and not any(t_.get('id') == trip_id for t_ in d.get('trips', [])))
    st, d, _ = req('GET', '/api/trips/stats/')
    check('stats 집계', st == 200 and d.get('trips_total', 0) >= 1, str(d)[:120])

print()
fails = [(n, d) for n, ok, d in results if not ok]
print(f'══════ 결과: {len(results) - len(fails)}/{len(results)} 통과 ══════')
for n, d in fails:
    print('  ❌', n, '—', d)
sys.exit(1 if fails else 0)
