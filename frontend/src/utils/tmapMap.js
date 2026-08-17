// src/utils/tmapMap.js
// TMAP 벡터 지도 SDK(Tmapv3)를 필요할 때 한 번만 불러온다.
// appKey 는 frontend/.env 의 REACT_APP_TMAP_APP_KEY 에 넣는다.
// (SK open API 앱에 TMAP 상품 무료 요금제가 신청돼 있어야 키가 동작한다)
//
// 카카오(래스터)와 달리 벡터 렌더링이라 지도 회전(setBearing)이 되고,
// 회전해도 지명 라벨이 화면 기준으로 서 있다. S5 주행 화면 전용.
//
// ⚠️ 공식 로드 주소(vectorjs)는 SDK 본체가 아니라 document.write 로 실제
// 스크립트(tmapjs3.min.js)와 CSS 를 끼워 넣는 부트스트랩이다. 페이지 로드가
// 끝난 뒤 비동기로 붙이면 document.write 가 무시되므로 그대로는 못 쓴다.
// 대신 부트스트랩을 fetch 로 받아(이 요청이 게이트웨이의 appKey 검증을 겸한다)
// 실제 SDK 주소를 파싱해 직접 주입한다. SDK 는 자기 <script src> 의
// appKey= 파라미터를 읽으므로 주소에 키를 붙여 준다.

const BOOTSTRAP_URL = 'https://apis.openapi.sk.com/tmap/vectorjs';
// 부트스트랩 응답 형식이 바뀌어 파싱이 실패할 때 쓸 예비값 (2023-12-06 버전)
const SDK_BASE = 'https://toptmaptile1.tmap.co.kr/scriptSDKV3/';
const FALLBACK_SDK_FILE = 'tmapjs3.min.js?version=20231206';
const CSS_FILE = 'vsm.css';

let loadPromise = null;

function injectCss(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

function injectScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = () =>
            reject(new Error('TMAP SDK 스크립트를 불러오지 못했습니다.'));
        document.head.appendChild(script);
    });
}

export function loadTmap() {
    if (window.Tmapv3) return Promise.resolve(window.Tmapv3);
    if (loadPromise) return loadPromise;

    const appKey = process.env.REACT_APP_TMAP_APP_KEY;
    if (!appKey) {
        return Promise.reject(
            new Error(
                '지도 키가 없습니다. frontend/.env 에 REACT_APP_TMAP_APP_KEY 를 설정해 주세요.'
            )
        );
    }

    loadPromise = (async () => {
        let sdkFile = FALLBACK_SDK_FILE;
        try {
            const res = await fetch(
                `${BOOTSTRAP_URL}?version=1&appKey=${appKey}`
            );
            if (res.status === 401 || res.status === 403) {
                throw new Error(
                    'TMAP appKey가 거부되었습니다. SK open API 앱에 TMAP 상품이 신청돼 있는지 확인해 주세요.'
                );
            }
            const text = await res.text();
            const matched = text.match(/tmapjs3\.min\.js\?version=\d+/);
            if (matched) sdkFile = matched[0];
        } catch (error) {
            // 키 거부는 그대로 알리고, 네트워크/CORS 문제면 예비값으로 계속한다
            if (error.message.includes('appKey')) {
                loadPromise = null;
                throw error;
            }
        }

        injectCss(SDK_BASE + CSS_FILE);
        // SDK 는 document 의 script 태그들에서 appKey= 를 찾아 읽는다
        const joiner = sdkFile.includes('?') ? '&' : '?';
        await injectScript(`${SDK_BASE}${sdkFile}${joiner}appKey=${appKey}`);

        if (!window.Tmapv3) {
            loadPromise = null;
            throw new Error('TMAP SDK가 초기화되지 않았습니다.');
        }
        return window.Tmapv3;
    })();

    return loadPromise;
}
