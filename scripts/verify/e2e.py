# -*- coding: utf-8 -*-
"""배포본 클릭 완주 E2E — 프로필→검색→추천→상세→주행(실좌표 GPS)→피드백→기록.
   각 화면 스크린샷 저장(발표 캡처 겸용) + 콘솔 에러 수집."""
import re, sys, time, pathlib
from playwright.sync_api import sync_playwright

BASE = 'https://6th-neonavi-ai.vercel.app'
OUT = pathlib.Path(__file__).parent / 'shots'
OUT.mkdir(exist_ok=True)
GANGNAM = {'latitude': 37.4980863, 'longitude': 127.0280014}  # 강남역

errors = []       # (화면, 콘솔 에러)
shots = []

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={'width': 390, 'height': 844},      # iPhone 급 폭
            device_scale_factor=2,
            locale='ko-KR',
            geolocation=GANGNAM,
            permissions=['geolocation'],
        )
        pg = ctx.new_page()
        screen = ['?']
        pg.on('console', lambda m: errors.append((screen[0], m.text))
              if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append((screen[0], f'PAGEERROR {e}')))

        def shot(name):
            path = OUT / f'{len(shots):02d}_{name}.png'
            pg.screenshot(path=str(path))
            shots.append(path)
            print(f'  📸 {name}')

        def goto(url):
            pg.goto(url, timeout=45000)
            pg.wait_for_load_state('networkidle', timeout=45000)

        # ── S0 온보딩 ──────────────────────────────────────────
        screen[0] = 'S0'
        goto(BASE)
        shot('onboarding')
        pg.get_by_role('button').filter(has_text='시작').first.click()
        pg.wait_for_timeout(800)

        # ── S1 프로필 (온보딩에서 왔으면 프로필 화면) ─────────────
        screen[0] = 'S1'
        if '/profile' in pg.url:
            pg.get_by_placeholder('이름').fill('검증봇') if pg.get_by_placeholder('이름').count() else pg.locator('input[type="text"]').first.fill('검증봇')
            # 나이
            num = pg.locator('input[type="number"]').first
            if num.count(): num.fill('27')
            # 성별·차종은 첫 번째 선택지 클릭
            for label in ('남성', '남자', 'M'):
                b = pg.get_by_role('button', name=label)
                if b.count(): b.first.click(); break
            for label in ('세단', 'sedan'):
                b = pg.get_by_role('button', name=label)
                if b.count(): b.first.click(); break
            shot('profile_filled')
            pg.get_by_role('button').filter(has_text='다음').first.click()
            # 저장 API(콜드스타트 시 수 초)가 끝나야 앱이 스스로 /home 으로 보낸다.
            # 여기서 성급하게 goto 하면 저장이 끊겨 '기본 정보가 필요해요'가 뜬다.
            pg.wait_for_url('**/home', timeout=30000)
            pg.wait_for_timeout(500)

        # ── S2 홈: 출발·도착 ──────────────────────────────────
        screen[0] = 'S2'
        if '/home' not in pg.url:
            goto(BASE + '/home')
        shot('home')
        inputs = pg.get_by_placeholder('출발지')
        inputs.first.click(); inputs.first.fill('강남역')
        pg.wait_for_timeout(1600)                       # 디바운스+검색
        pg.locator('li, [role="option"], .dropdown-item, button').filter(has_text='강남역').first.click()
        pg.wait_for_timeout(400)
        dst = pg.get_by_placeholder('도착지')
        dst.first.click(); dst.first.fill('광화문')
        pg.wait_for_timeout(1600)
        pg.locator('li, [role="option"], .dropdown-item, button').filter(has_text='광화문').first.click()
        pg.wait_for_timeout(400)
        shot('home_filled')
        pg.get_by_role('button').filter(has_text='경로 찾기').first.click()

        # ── S3 경로 옵션 ──────────────────────────────────────
        screen[0] = 'S3'
        pg.wait_for_url('**/option', timeout=15000)
        pg.wait_for_timeout(800)
        shot('option')
        pg.get_by_role('button').filter(has_text='분석하고 경로 추천받기').first.click()

        # ── S4 결과 (추천 API ~15초) ──────────────────────────
        screen[0] = 'S4'
        pg.wait_for_url('**/result', timeout=15000)
        # '추천' 은 로딩 화면의 'AI 자동 추천' 에 먼저 매치된다 — 결과 카드의
        # 제목(너네비추천)이 떠야 진짜 끝난 것.
        pg.wait_for_selector('text=너네비추천', timeout=120000)
        pg.wait_for_timeout(3000)                       # 지도 타일
        shot('result')

        # ── 상세 ──────────────────────────────────────────────
        screen[0] = 'Detail'
        det = pg.get_by_text('상세', exact=False)
        if det.count():
            det.first.click()
            pg.wait_for_url('**/detail', timeout=10000)
            pg.wait_for_timeout(3000)
            shot('detail')
            pg.go_back()
            pg.wait_for_url('**/result', timeout=10000)
            pg.wait_for_timeout(1500)

        # ── S5 주행 (실좌표 GPS = 강남역) ─────────────────────
        screen[0] = 'S5'
        start = pg.get_by_role('button').filter(has_text=re.compile('안내\\s*시작'))
        start.first.click()
        pg.wait_for_url('**/navi**', timeout=15000)
        pg.wait_for_timeout(6000)                       # TMAP 로드+GPS 스냅
        shot('navi')
        # 종료 (버튼 문구는 '안내 종료')
        end = pg.get_by_role('button').filter(has_text=re.compile('안내\\s*종료'))
        end.first.click()
        pg.wait_for_url('**/feedback', timeout=10000)
        pg.wait_for_timeout(800)

        # ── S6 피드백 ────────────────────────────────────────
        screen[0] = 'S6'
        if '/feedback' in pg.url:
            shot('feedback')
            stars = pg.locator('button[aria-label$="점"]')
            if stars.count() >= 5:
                stars.nth(4).click(); pg.wait_for_timeout(400)
                shot('feedback_5stars')
                pg.get_by_role('button').filter(has_text='별 5개').first.click()
                # 저장 두 건(기록+별점)이 끝나야 앱이 /saying 으로 보낸다.
                # 그 전에 goto 하면 fetch 가 끊겨 별점이 서버에 안 남는다(실제로 그랬다).
                pg.wait_for_url('**/saying', timeout=15000)

        # ── S7a 기록 ─────────────────────────────────────────
        screen[0] = 'S7a'
        goto(BASE + '/S7a_history')
        pg.wait_for_timeout(1500)
        shot('history')

        browser.close()

try:
    run()
except Exception as e:
    print(f'💥 완주 실패: {type(e).__name__}: {str(e)[:300]}')
    sys.exit(2)
finally:
    print()
    print(f'스크린샷 {len(shots)}장 → {OUT}')
    # TMAP/카카오 SDK 잡음은 걸러내고 우리 코드 에러만
    NOISE = ('favicon', 'sdk.js', 'tmap', 'ERR_BLOCKED_BY_ORB', 'net::')
    ours = [(s, t) for s, t in errors if not any(n in t.lower() for n in NOISE)]
    print(f'콘솔 에러: 전체 {len(errors)}건 / SDK 잡음 제외 {len(ours)}건')
    for s, t in ours[:10]:
        print(f'  [{s}] {t[:150]}')
