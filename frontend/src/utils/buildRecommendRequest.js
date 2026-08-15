// src/utils/buildRecommendRequest.js
// 화면 상태(프로필 + 여정) → 백엔드 추천 API 요청 형식으로 변환한다.
// 표기 차이(한글 동승자, camelCase, 모드 대문자)를 여기서 한 번에 맞춘다.

const PASSENGER_MAP = {
    혼자: 'alone',
    가족: 'family',
    노약자: 'vulnerable',
    친구: 'friend'
};

/**
 * @param {object} profile  { age, gender, carType, carAge }  — 고정 프로필
 * @param {object} trip     { departure, destination, passenger, loadKg, mode, autoRecommend }
 */
export function buildRecommendRequest(profile, trip) {
    if (!profile) {
        throw new Error('프로필 정보가 없습니다. 기본 정보를 먼저 입력해 주세요.');
    }

    return {
        profile: {
            age: Number(profile.age),
            gender: profile.gender || 'M',
            car_type: profile.carType || 'sedan',
            car_age: Number(profile.carAge || 0)
        },
        passenger: PASSENGER_MAP[trip.passenger] || trip.passenger || 'alone',
        load_kg: Number(trip.loadKg || 0),
        // 검색 목록에서 고른 장소면 좌표를 그대로 쓰고, 아니면 이름으로 백엔드가 찾는다.
        origin: toPoint(trip.departurePlace) || trip.departure,
        destination: toPoint(trip.destinationPlace) || trip.destination,
        mode: (trip.mode || 'comfort').toLowerCase(),
        auto_recommend: trip.autoRecommend ?? true,
        // 'now' 또는 'YYYY-MM-DDThh:mm'(로컬 시각). 백엔드가 카카오 형식으로 바꾸고,
        // 과거 시각이면 현재 기준으로 되돌린다(카카오가 과거를 조용히 무시하므로).
        departure_time: trip.departureTime || 'now'
    };
}

/** 선택한 장소 → 백엔드가 받는 좌표 형식 */
function toPoint(place) {
    if (!place || place.lng == null || place.lat == null) return null;
    return { lng: place.lng, lat: place.lat, name: place.name };
}
