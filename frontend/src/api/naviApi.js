// src/api/naviApi.js
// 백엔드(Django) 연동. 로컬 개발 기본값: http://127.0.0.1:8000
// 다른 주소를 쓰려면 frontend/.env 에 REACT_APP_API_BASE_URL 지정 (CRA 규칙).
const BASE_URL =
    process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';

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
export const fetchTrips = async () => {
    try {
        const response = await fetch(`${BASE_URL}/api/trips/`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.trips || [];
    } catch (error) {
        console.warn('주행 기록을 서버에서 불러오지 못했습니다.', error);
        return null;
    }
};
