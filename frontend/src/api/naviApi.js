// src/api/naviApi.js
// 백엔드(Django) 연동.
//
// 주소를 정하는 순서:
//   1. REACT_APP_API_BASE_URL 이 있으면 그것 (명시가 항상 이긴다)
//   2. 로컬 개발(localhost)이면 http://127.0.0.1:8000
//   3. 그 외(배포)면 **같은 오리진** — 빈 문자열이라 /api/... 가 상대 경로가 된다
//
// 배포는 프론트와 백엔드를 한 도메인에서 서비스한다(Vercel services: / 는 프론트,
// /api 는 Django). 같은 오리진이라 CORS 도 필요 없고, 프론트에 백엔드 주소를
// 넣어 줄 필요도 없다 — 미리보기 배포처럼 도메인이 매번 달라져도 그대로 맞는다.
// ⚠️ REACT_APP_* 는 빌드 시점에 코드에 박히므로, 주소를 못 박아 두면 도메인이
//    바뀔 때마다 재배포해야 한다. 그래서 기본을 상대 경로로 둔다.
const _isLocalDev =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);

const BASE_URL = (
    process.env.REACT_APP_API_BASE_URL ??
    (_isLocalDev ? 'http://127.0.0.1:8000' : '')
).replace(/\/$/, '');

async function postJson(path, body) {
    const response = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        // DRF 는 {detail:"..."} 또는 {field:["..."]} 형태로 에러를 준다.
        const message =
            data.detail ||
            Object.values(data).flat().join('\n') ||
            `요청에 실패했습니다. (${response.status})`;
        throw new Error(message);
    }

    return data;
}

/* 프로필 저장 (S1_Profile) — 고정 정보만. 동승자·짐은 여정별이라 제외. */
export const saveProfile = async (profile) =>
    postJson('/api/users/profile/', {
        age: Number(profile.age),
        gender: profile.gender,
        car_type: profile.carType,
        car_age: Number(profile.carAge)
    });

/* 저장된 프로필 조회 (없으면 null) */
export const fetchProfile = async () => {
    const response = await fetch(`${BASE_URL}/api/users/profile/`);
    if (response.status === 204 || !response.ok) return null;
    return response.json();
};

/* 장소 검색 (S2_Home 자동완성) — "강남역" 같은 입력의 후보 목록 */
export const searchPlaces = async (query) => {
    const response = await fetch(
        `${BASE_URL}/api/routes/places/?q=${encodeURIComponent(query)}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.places || [];
};

/* 경로 추천 (S4_RouteResult) — 랭킹된 경로 리스트를 받는다.
   지오코딩·경로수집·공간조인이 들어가 응답이 느리므로,
   같은 조건의 요청이 이미 진행 중이면 그 결과를 함께 쓴다. */
const pendingRecommendations = new Map();

export const getRouteRecommendation = async (requestData) => {
    const key = JSON.stringify(requestData);

    if (!pendingRecommendations.has(key)) {
        const request = postJson('/api/routes/recommend/', requestData).finally(
            () => pendingRecommendations.delete(key)
        );
        pendingRecommendations.set(key, request);
    }

    return pendingRecommendations.get(key);
};

/* 경로 상세의 LLM 설명 (RouteDetail 폴백).
   추천 근거는 보통 추천 응답에 함께 실려 오므로, 이건 그 값이 없을 때만 쓴다. */
export const explainRoute = async ({ profile, mode, axes }) =>
    postJson('/api/routes/explain/', { profile, mode, axes });

/* 주행 기록 저장 (S6_Feedback) — 서버에 남는 실사용 데이터.
   추천 경로와 실제로 고른 경로를 함께 보내야 '추천 수용률'을 셀 수 있다. */
export const saveTrip = async (trip) => postJson('/api/trips/', trip);

/* 별점 저장 — 주행 기록 1건에 붙는다 */
export const saveFeedback = async (tripId, { rating, comment = '' }) =>
    postJson(`/api/trips/${tripId}/feedback/`, { rating, comment });

/* 주행 기록 목록 (S7a_history). 서버가 없으면 null → 호출 측이 로컬 기록으로 대체 */
/*
    ⚠️ profileId 없이 부르면 서버가 **모든 사용자의 기록**을 돌려준다
    (로그인이 없는 데모 전제라 서버는 요청이 준 id 로만 거른다).
    실제로 데스크탑·폰에서 서로 다른 프로필로 쓴 기록이 한 목록에 섞여 보였다.
    프로필 id 가 없으면(서버 저장 전의 옛 프로필) 서버 조회를 포기하고
    로컬 기록만 쓴다 — 남의 기록을 보여주는 것보다 낫다.
*/
export const fetchTrips = async (profileId) => {
    if (profileId == null) return null;
    try {
        const response = await fetch(
            `${BASE_URL}/api/trips/?profile=${encodeURIComponent(profileId)}`
        );
        if (!response.ok) return null;
        const data = await response.json();
        return data.trips || [];
    } catch (error) {
        console.warn('주행 기록을 서버에서 불러오지 못했습니다.', error);
        return null;
    }
};
