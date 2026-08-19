// 진행 중인 여정(출발·도착·모드·선택한 경로)을 화면 사이로 나르는 저장소.
//
// S2 → S3 → S4 → S5 → S6 은 react-router 의 location.state 로 데이터를 넘기는데,
// 새로고침하면 state 가 사라진다. sessionStorage 는 같은 탭에서 새로고침을 견디므로
// 폴백으로 쓴다(탭을 닫으면 지워지는 것도 여정 데이터엔 맞는 수명이다).
//
// ⚠️ 예전엔 S4 는 sessionStorage['neonaviTrip'] 에 쓰는데 S6 은 그걸 읽지 않고
// localStorage['neonaviRecentTrip'] 만 봤다. 그런데 그 키에는 S2 가 저장한
// **출발·도착 지명밖에 없다.** 그래서 /feedback 에서 새로고침하면 경로·모드와
// 층3 지표(recommendedRouteId·selectedRouteId·preferenceAxis)가 조용히 사라졌다.
// 에러가 안 나서 발견이 늦는 종류의 유실이라 여기로 창구를 모은다.

export const TRIP_STORAGE_KEY = 'neonaviTrip';

export function readTrip() {
    try {
        const raw = sessionStorage.getItem(TRIP_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.error('저장된 여정 정보를 읽지 못했습니다.', error);
        return {};
    }
}

export function writeTrip(trip) {
    try {
        sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(trip));
    } catch (error) {
        // 용량 초과(경로 폴리라인이 크다) 정도로 여정 흐름이 끊기면 안 된다.
        console.error('여정 정보를 저장하지 못했습니다.', error);
    }
}
