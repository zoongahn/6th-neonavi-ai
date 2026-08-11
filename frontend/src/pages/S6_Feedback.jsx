import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';

const HISTORY_STORAGE_KEY = 'neonaviDriveHistories';

const RECENT_TRIP_STORAGE_KEYS = [
    'neonaviRecentTrip',
    'recentTrip'
];

const safeParse = (value, fallback = null) => {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

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
        ''
    );
};

const getRecentTrip = (locationState) => {
    // 이전 페이지에서 state로 전달한 경우 우선 사용
    const stateTrip =
        locationState?.trip ||
        locationState?.recentTrip ||
        locationState?.route;

    if (stateTrip) {
        return stateTrip;
    }

    // state 자체에 주행정보가 들어온 경우
    if (
        locationState?.departure ||
        locationState?.destination ||
        locationState?.origin ||
        locationState?.from
    ) {
        return locationState;
    }

    // localStorage에 저장된 최근 주행정보 확인
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

const normalizeDistance = (trip) => {
    const raw =
        trip.distance_km ??
        trip.distanceKm ??
        trip.route?.distance_km ??
        trip.route?.distanceKm ??
        trip.distance ??
        trip.route?.distance;

    if (raw === undefined || raw === null || raw === '') {
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

    const hasKmField =
        trip.distance_km !== undefined ||
        trip.distanceKm !== undefined ||
        trip.route?.distance_km !== undefined ||
        trip.route?.distanceKm !== undefined;

    // Kakao 등의 API에서 distance가 meter로 오는 경우 대비
    if (!hasKmField && number >= 1000) {
        return (number / 1000).toFixed(1);
    }

    return number.toFixed(1);
};

const normalizeTime = (trip) => {
    const minuteValue =
        trip.duration_min ??
        trip.durationMin ??
        trip.route?.duration_min ??
        trip.route?.durationMin;

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
        trip.route?.durationSeconds;

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
        trip.route?.duration;

    if (raw === undefined || raw === null) {
        return '-';
    }

    if (typeof raw === 'string') {
        if (
            raw.includes('분') ||
            raw.includes('시간')
        ) {
            return raw;
        }

        const number = Number(raw);

        if (!Number.isNaN(number)) {
            return number > 300
                ? `${Math.round(number / 60)}분`
                : `${Math.round(number)}분`;
        }

        return raw;
    }

    if (typeof raw === 'number') {
        return raw > 300
            ? `${Math.round(raw / 60)}분`
            : `${Math.round(raw)}분`;
    }

    return '-';
};

const normalizeFee = (trip) => {
    const raw =
        trip.toll ??
        trip.tollFee ??
        trip.fee ??
        trip.cost ??
        trip.route?.toll ??
        trip.route?.tollFee ??
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

const normalizeMode = (trip) => {
    const raw =
        trip.mode ??
        trip.selectedMode ??
        trip.preference ??
        trip.routeMode ??
        trip.route?.mode ??
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
        time: 'Time (최단 시간)'
    };

    return labels[mode.toLowerCase()] || mode;
};

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
                btnText: `별 ${rating}개 · 아쉬워요`
            };
        }

        if (rating === 3) {
            return {
                starColor: 'text-yellow-400',
                btnColor:
                    'bg-yellow-400 text-white shadow-lg',
                btnText: '별 3개 · 무난했어요'
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

    const handleSubmitFeedback = () => {
        if (rating === 0) {
            return;
        }

        const trip = getRecentTrip(location.state);

        const departure =
            getPlaceName(
                trip.departure ??
                trip.origin ??
                trip.from ??
                trip.start ??
                trip.startPlace
            ) || '출발지 정보 없음';

        const destination =
            getPlaceName(
                trip.destination ??
                trip.arrival ??
                trip.to ??
                trip.end ??
                trip.endPlace
            ) || '도착지 정보 없음';

        const newHistory = {
            id: Date.now(),
            createdAt: new Date().toISOString(),
            date: formatNow(),

            departure,
            destination,

            distance: normalizeDistance(trip),
            time: normalizeTime(trip),
            mode: normalizeMode(trip),
            fee: normalizeFee(trip),

            rating
        };

        const existing =
            safeParse(
                localStorage.getItem(
                    HISTORY_STORAGE_KEY
                ),
                []
            ) || [];

        const histories = Array.isArray(existing)
            ? existing
            : [];

        // 최신 기록이 가장 위에 오도록 저장
        const nextHistories = [
            newHistory,
            ...histories
        ].slice(0, 100);

        localStorage.setItem(
            HISTORY_STORAGE_KEY,
            JSON.stringify(nextHistories)
        );

        navigate('/home', {
            replace: true
        });
    };

    const handleSkipFeedback = () => {
        // 별점을 저장하지 않고 홈으로 이동
        navigate('/home', {
            replace: true
        });
    };

    return (
        <div className="p-6 bg-white min-h-screen flex flex-col justify-center items-center text-center">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-3xl mb-6">
                🏁
            </div>

            <h2 className="text-2xl font-bold mb-2">
                목적지에 도착했습니다
            </h2>

            <p className="text-gray-500 mb-10 text-sm">
                방금 주행하신 추천 경로는
                어떠셨나요?
                <br />
                피드백은 다음 맞춤 안내에
                반영됩니다.
            </p>

            <div className="flex justify-center gap-3 w-full px-4 mb-16">
                {[1, 2, 3, 4, 5].map((star) => {
                    const isSelected =
                        rating >= star;

                    return (
                        <button
                            key={star}
                            type="button"
                            onClick={() =>
                                setRating(star)
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
                })}
            </div>

            <button
                type="button"
                onClick={handleSubmitFeedback}
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

            <button
                type="button"
                onClick={handleSkipFeedback}
                className="mt-4 text-gray-400 text-sm font-semibold"
            >
                다음에 할게요
            </button>
        </div>
    );
}