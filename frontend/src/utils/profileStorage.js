// src/utils/profileStorage.js
// 프로필은 백엔드에 저장하고, 브라우저에도 캐시해 둔다.
// 이름은 현재 백엔드 프로필 필드에 없으므로 브라우저 캐시에 저장한다.

const PROFILE_STORAGE_KEY = 'neonaviProfile';

export const DEFAULT_PROFILE = {
    name: '',
    age: '',
    gender: 'M',
    carType: 'sedan',
    carAge: 0
};


/** 브라우저에 캐시된 프로필 (없으면 null) */
export function readProfile() {
    try {
        const raw = localStorage.getItem(PROFILE_STORAGE_KEY);

        return raw
            ? JSON.parse(raw)
            : null;
    } catch (error) {
        console.error(
            '프로필을 불러오지 못했습니다.',
            error
        );

        return null;
    }
}


/** 프로필 캐시 저장 */
export function writeProfile(profile) {
    try {
        localStorage.setItem(
            PROFILE_STORAGE_KEY,
            JSON.stringify(profile)
        );
    } catch (error) {
        console.error(
            '프로필을 저장하지 못했습니다.',
            error
        );
    }
}


/** 서버 응답(snake_case) → 화면 상태(camelCase) */
export function fromApi(data) {
    if (!data) {
        return null;
    }

    // 이름은 서버에 없으므로 기존 브라우저 저장값을 유지
    const cachedProfile = readProfile();

    return {
        id: data.id,

        name:
            cachedProfile?.name ?? '',

        age:
            data.age ?? '',

        gender:
            data.gender ?? 'M',

        carType:
            data.car_type ?? 'sedan',

        carAge:
            data.car_age ?? 0
    };
}