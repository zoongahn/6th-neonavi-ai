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


/**
 * 이 프로필로 경로 추천이 가능한가.
 *
 * 추천 요청에 실제로 실려 가는 필수값은 **나이**다(`buildRecommendRequest`).
 * 이름은 화면 표시용이라 서버·모델로 가지 않으므로 여기서 따지지 않는다.
 * 프로필 객체는 있는데 나이가 비어 있으면 `Number('')` → NaN 이 되어
 * 경로 추천 단계에서야 실패하므로, 값의 유효성까지 본다.
 */
export function isProfileComplete(profile) {
    if (!profile) return false;
    const age = Number(profile.age);
    return Number.isFinite(age) && age > 0;
}

/** 지금 저장된 프로필로 추천이 가능한가 (화면 진입 가드용) */
export function hasUsableProfile() {
    return isProfileComplete(readProfile());
}

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