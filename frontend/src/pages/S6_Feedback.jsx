import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { saveTrip, saveFeedback } from '../api/naviApi';
import { readProfile } from '../utils/profileStorage';

const HISTORY_STORAGE_KEY = 'neonaviDriveHistories';

const PASSENGER_MAP = {
    혼자: 'alone', 가족: 'family', 노약자: 'vulnerable', 친구: 'friend'
};

/** 화면 상태 → 서버 주행 기록. 숫자는 "12.5km"/"33분" 같은 표시 문자열일 수 있다. */
const toNumber = (value) => {
    const n = parseFloat(String(value ?? '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
};

const buildTripPayload = (trip, departure, destination) => {
    const route = trip.route || {};
    const profile = readProfile();
    return {
        profile: profile?.id ?? null,
        passenger: PASSENGER_MAP[trip.passenger] || trip.passenger || '',
        load_kg: toNumber(trip.loadKg) ?? null,
        origin_name: departure,
        destination_name: destination,
        origin_lng: trip.departurePlace?.lng ?? null,
        origin_lat: trip.departurePlace?.lat ?? null,
        destination_lng: trip.destinationPlace?.lng ?? null,
        destination_lat: trip.destinationPlace?.lat ?? null,
        mode: String(trip.mode || '').toLowerCase(),
        auto_recommend: trip.autoRecommend ?? true,
        preference_axis: trip.preferenceAxis || '',
        candidate_count: trip.candidateCount ?? 0,
        // 이 두 개가 층3의 핵심 — 같으면 추천 수용, 다르면 거절
        recommended_route_id: trip.recommendedRouteId || '',
        selected_route_id: route.routeId || '',
        distance_km: toNumber(route.distance),
        duration_min: toNumber(route.time),
        toll: toNumber(route.fee)
    };
};

const RECENT_TRIP_STORAGE_KEYS = [
    'neonaviRecentTrip',
    'recentTrip'
];

// JSON 안전하게 읽기
const safeParse = (value, fallback = null) => {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

// 장소 이름 추출
const getPlaceName = (value) => {
    if (!value) return '';

    if (typeof value === 'string') {
        return value;
    }

    return (
        value.name ||
        value.place_name ||
        value.placeName ||
        value.label ||
        value.address ||
        value.address_name ||
        value.road_address_name ||
        ''
    );
};

// 현재 주행 정보 가져오기
const getRecentTrip = (locationState) => {
    /*
        가장 중요:
        S5에서 출발지/도착지와 route가 같이 전달되므로
        locationState 전체를 우선 사용한다.

        예:
        {
            departure: {...},
            destination: {...},
            route: {
                distance: ...,
                duration: ...
            }
        }
    */
    if (
        locationState &&
        (
            locationState.departure ||
            locationState.destination ||
            locationState.origin ||
            locationState.from ||
            locationState.startPlace ||
            locationState.endPlace
        )
    ) {
        return locationState;
    }

    // trip / recentTrip 객체로 전달된 경우
    const stateTrip =
        locationState?.trip ||
        locationState?.recentTrip;

    if (stateTrip) {
        return stateTrip;
    }

    // localStorage에 저장된 최근 경로 확인
    for (const key of RECENT_TRIP_STORAGE_KEYS) {
        const saved = localStorage.getItem(key);

        if (!saved) continue;

        const parsed = safeParse(saved);

        if (parsed) {
            return parsed;
        }
    }

    return {};
};

// 거리 정규화
const normalizeDistance = (trip) => {
    const raw =
        trip.distance_km ??
        trip.distanceKm ??
        trip.route?.distance_km ??
        trip.route?.distanceKm ??
        trip.route?.summary?.distance_km ??
        trip.route?.summary?.distanceKm ??
        trip.distance ??
        trip.route?.distance ??
        trip.route?.summary?.distance;

    if (
        raw === undefined ||
        raw === null ||
        raw === ''
    ) {
        return '0.0';
    }

    const number = parseFloat(
        String(raw)
            .replace(/,/g, '')
            .replace(/[^\d.]/g, '')
    );

    if (Number.isNaN(number)) {
        return '0.0';
    }

    // 명시적으로 km 필드가 있으면 그대로 사용
    const hasKmField =
        trip.distance_km !== undefined ||
        trip.distanceKm !== undefined ||
        trip.route?.distance_km !== undefined ||
        trip.route?.distanceKm !== undefined ||
        trip.route?.summary?.distance_km !== undefined ||
        trip.route?.summary?.distanceKm !== undefined;

    if (hasKmField) {
        return number.toFixed(1);
    }

    /*
        Kakao 등에서 distance가 meter 단위로 오는 경우
        1000 이상이면 meter로 판단하여 km 변환
    */
    if (number >= 1000) {
        return (number / 1000).toFixed(1);
    }

    return number.toFixed(1);
};

// 주행 시간 정규화
const normalizeTime = (trip) => {
    const minuteValue =
        trip.duration_min ??
        trip.durationMin ??
        trip.route?.duration_min ??
        trip.route?.durationMin ??
        trip.route?.summary?.duration_min ??
        trip.route?.summary?.durationMin;

    if (
        minuteValue !== undefined &&
        minuteValue !== null
    ) {
        return `${Math.round(Number(minuteValue))}분`;
    }

    const secondValue =
        trip.duration_seconds ??
        trip.durationSeconds ??
        trip.route?.duration_seconds ??
        trip.route?.durationSeconds ??
        trip.route?.summary?.duration_seconds ??
        trip.route?.summary?.durationSeconds;

    if (
        secondValue !== undefined &&
        secondValue !== null
    ) {
        return `${Math.round(Number(secondValue) / 60)}분`;
    }

    const raw =
        trip.time ??
        trip.duration ??
        trip.route?.time ??
        trip.route?.duration ??
        trip.route?.summary?.duration;

    if (
        raw === undefined ||
        raw === null ||
        raw === ''
    ) {
        return '-';
    }

    // 이미 "31분", "1시간 20분" 형태면 그대로 사용
    if (typeof raw === 'string') {
        if (
            raw.includes('분') ||
            raw.includes('시간')
        ) {
            return raw;
        }

        const number = Number(raw);

        if (!Number.isNaN(number)) {
            /*
                API duration이 초 단위인 경우가 많으므로
                300 이상이면 초라고 판단
            */
            if (number > 300) {
                return `${Math.round(number / 60)}분`;
            }

            return `${Math.round(number)}분`;
        }

        return raw;
    }

    if (typeof raw === 'number') {
        if (raw > 300) {
            return `${Math.round(raw / 60)}분`;
        }

        return `${Math.round(raw)}분`;
    }

    return '-';
};

// 통행료 정규화
const normalizeFee = (trip) => {
    const raw =
        trip.toll ??
        trip.tollFee ??
        trip.fee ??
        trip.cost ??
        trip.route?.toll ??
        trip.route?.tollFee ??
        trip.route?.summary?.toll ??
        trip.route?.summary?.tollFee ??
        trip.route?.summary?.fare?.toll ??
        0;

    if (typeof raw === 'number') {
        return raw.toLocaleString('ko-KR');
    }

    const cleaned = String(raw)
        .replace(/원/g, '')
        .replace(/,/g, '')
        .trim();

    const number = Number(cleaned);

    if (!Number.isNaN(number)) {
        return number.toLocaleString('ko-KR');
    }

    return cleaned || '0';
};

// 추천 모드 이름 정리
const normalizeMode = (trip) => {
    const raw =
        trip.mode ??
        trip.selectedMode ??
        trip.preference ??
        trip.routeMode ??
        trip.route?.mode ??
        trip.route?.selectedMode ??
        '';

    if (!raw) {
        return '추천 경로';
    }

    const mode = String(raw);

    const labels = {
        comfort: 'Comfort (승차감)',
        eco: 'Eco (연비)',
        fuel: 'Eco (연비)',
        safety: 'Safety (안전)',
        sports: 'Sports (주행 재미)',
        sport: 'Sports (주행 재미)',
        time: 'Time (최단 시간)'
    };

    return (
        labels[mode.toLowerCase()] ||
        mode
    );
};

// 현재 시간 표시
const formatNow = () => {
    const now = new Date();

    const pad = (value) =>
        String(value).padStart(2, '0');

    return (
        `${now.getFullYear()}-` +
        `${pad(now.getMonth() + 1)}-` +
        `${pad(now.getDate())} ` +
        `${pad(now.getHours())}:` +
        `${pad(now.getMinutes())}`
    );
};

export default function S6_Feedback() {
    const navigate = useNavigate();
    const location = useLocation();

    const [rating, setRating] = useState(0);

    const getFeedbackConfig = () => {
        if (rating === 0) {
            return {
                starColor: 'text-gray-300',
                btnColor:
                    'bg-gray-200 text-gray-400',
                btnText: '피드백 보내기'
            };
        }

        if (rating <= 2) {
            return {
                starColor: 'text-orange-400',
                btnColor:
                    'bg-orange-500 text-white shadow-lg',
                btnText:
                    `별 ${rating}개 · 아쉬워요`
            };
        }

        if (rating === 3) {
            return {
                starColor: 'text-yellow-400',
                btnColor:
                    'bg-yellow-400 text-white shadow-lg',
                btnText:
                    '별 3개 · 무난했어요'
            };
        }

        return {
            starColor: 'text-indigo-600',
            btnColor:
                'bg-indigo-600 text-white shadow-lg',
            btnText:
                `별 ${rating}개 · 아주 만족해요!`
        };
    };

    const config = getFeedbackConfig();

    // 피드백 저장
    const handleSubmitFeedback = async () => {
        if (rating === 0) {
            return;
        }

        const trip = getRecentTrip(
            location.state
        );

        /*
            출발지 후보
        */
        const departure =
            getPlaceName(
                trip.departure ??
                trip.origin ??
                trip.from ??
                trip.start ??
                trip.startPlace ??
                trip.departurePlace
            ) ||
            '출발지 정보 없음';

        /*
            도착지 후보
        */
        const destination =
            getPlaceName(
                trip.destination ??
                trip.arrival ??
                trip.to ??
                trip.end ??
                trip.endPlace ??
                trip.destinationPlace
            ) ||
            '도착지 정보 없음';

        const newHistory = {
            id: Date.now(),

            createdAt:
                new Date().toISOString(),

            date: formatNow(),

            departure,
            destination,

            distance:
                normalizeDistance(trip),

            time:
                normalizeTime(trip),

            mode:
                normalizeMode(trip),

            fee:
                normalizeFee(trip),

            rating
        };

        // 기존 기록 불러오기
        const existing =
            safeParse(
                localStorage.getItem(
                    HISTORY_STORAGE_KEY
                ),
                []
            ) || [];

        const histories =
            Array.isArray(existing)
                ? existing
                : [];

        /*
            최신 주행이 가장 위에 표시되도록
            배열 맨 앞에 추가
        */
        const nextHistories = [
            newHistory,
            ...histories
        ].slice(0, 100);

        localStorage.setItem(
            HISTORY_STORAGE_KEY,
            JSON.stringify(nextHistories)
        );

        /*
            서버에도 남긴다. 로컬 기록은 이 기기에서만 보이지만,
            추천 수용률·만족도 집계는 서버에 쌓인 것만으로 계산된다.
            서버가 꺼져 있어도 화면 흐름은 막지 않는다(로컬 저장은 이미 끝났다).
        */
        try {
            const saved = await saveTrip(
                buildTripPayload(trip, departure, destination)
            );
            await saveFeedback(saved.id, { rating });
        } catch (error) {
            console.warn('주행 기록을 서버에 저장하지 못했습니다.', error);
        }

        navigate('/home', {
            replace: true
        });
    };

    // 피드백 저장 없이 이동
    const handleSkipFeedback = () => {
        navigate('/home', {
            replace: true
        });
    };

    return (
        <div className="p-6 bg-white min-h-screen flex flex-col justify-center items-center text-center">

            {/* 도착 아이콘 */}
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-3xl mb-6">
                🏁
            </div>

            {/* 제목 */}
            <h2 className="text-2xl font-bold mb-2">
                목적지에 도착했습니다
            </h2>

            {/* 안내 */}
            <p className="text-gray-500 mb-10 text-sm">
                방금 주행하신 추천 경로는
                어떠셨나요?
                <br />
                피드백은 다음 맞춤 안내에
                반영됩니다.
            </p>

            {/* 별점 */}
            <div className="flex justify-center gap-3 w-full px-4 mb-16">
                {[1, 2, 3, 4, 5].map(
                    (star) => {

                        const isSelected =
                            rating >= star;

                        return (
                            <button
                                key={star}
                                type="button"
                                onClick={() =>
                                    setRating(
                                        star
                                    )
                                }
                                className={`
                                    text-5xl
                                    focus:outline-none
                                    transition-colors
                                    duration-200
                                    ${
                                        isSelected
                                            ? config.starColor
                                            : 'text-gray-300'
                                    }
                                `}
                                style={{
                                    WebkitTapHighlightColor:
                                        'transparent'
                                }}
                                aria-label={`${star}점`}
                            >
                                {isSelected
                                    ? '★'
                                    : '☆'}
                            </button>
                        );
                    }
                )}
            </div>

            {/* 피드백 저장 */}
            <button
                type="button"
                onClick={
                    handleSubmitFeedback
                }
                className={`
                    w-full
                    py-4
                    rounded-xl
                    font-bold
                    text-lg
                    transition-all
                    duration-300
                    ${config.btnColor}
                `}
                disabled={rating === 0}
            >
                {config.btnText}
            </button>

            {/* 건너뛰기 */}
            <button
                type="button"
                onClick={
                    handleSkipFeedback
                }
                className="mt-4 text-gray-400 text-sm font-semibold"
            >
                다음에 할게요
            </button>
        </div>
    );
}