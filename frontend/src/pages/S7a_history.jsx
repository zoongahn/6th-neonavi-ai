import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchTrips } from '../api/naviApi';

const HISTORY_STORAGE_KEY = 'neonaviDriveHistories';

const MODE_LABEL = { comfort: '편안함', sports: '스포티', eco: '경제성' };

/** 서버 주행 기록 → 이 화면이 쓰는 표시 형태 */
const fromServerTrip = (trip) => ({
    id: `server-${trip.id}`,
    createdAt: trip.created_at,
    date: new Date(trip.created_at).toLocaleString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    }),
    departure: trip.origin_name,
    destination: trip.destination_name,
    distance: trip.distance_km != null ? `${trip.distance_km}km` : '',
    time: trip.duration_min != null ? `${Math.round(trip.duration_min)}분` : '',
    mode: MODE_LABEL[trip.mode] || trip.mode || '',
    fee: trip.toll != null ? `${trip.toll}원` : '0원',
    rating: trip.rating || 0
});

const safeParse = (value, fallback = []) => {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const loadHistories = () => {
    const saved = localStorage.getItem(
        HISTORY_STORAGE_KEY
    );

    if (!saved) {
        return [];
    }

    const parsed = safeParse(saved, []);

    if (!Array.isArray(parsed)) {
        return [];
    }

    return parsed.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
            return (
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            );
        }

        return Number(b.id || 0) -
            Number(a.id || 0);
    });
};

const formatFee = (fee) => {
    if (
        fee === undefined ||
        fee === null ||
        fee === ''
    ) {
        return '0원';
    }

    const text = String(fee);

    if (text.includes('원')) {
        return text;
    }

    return `${text}원`;
};

export default function S7a() {
    const navigate = useNavigate();

    /*
        먼저 로컬 기록으로 즉시 그리고, 서버 기록이 오면 그쪽으로 교체한다.
        서버가 진실원천이지만(다른 기기·집계 반영) 꺼져 있을 수 있으므로
        로컬을 폴백으로 남긴다.
    */
    const [histories, setHistories] = useState(() =>
        loadHistories()
    );

    useEffect(() => {
        let isActive = true;

        fetchTrips().then((trips) => {
            if (!isActive || trips === null) return;   // null = 서버 응답 없음
            setHistories(trips.map(fromServerTrip));
        });

        return () => {
            isActive = false;
        };
    }, []);

    // 실제 저장된 주행 거리 총합
    const totalDistance = histories
        .reduce((acc, curr) => {
            const distance =
                parseFloat(curr.distance);

            if (Number.isNaN(distance)) {
                return acc;
            }

            return acc + distance;
        }, 0)
        .toFixed(1);

    // 별점 렌더링
    const renderStars = (score) => {
        if (!score) {
            return (
                <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">
                    피드백 대기
                </span>
            );
        }

        return (
            <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                    <svg
                        key={i}
                        className={`w-4 h-4 ${
                            i < score
                                ? 'text-yellow-400'
                                : 'text-gray-200'
                        }`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                ))}

                <span className="ml-1.5 text-sm font-extrabold text-gray-700">
                    {score}점
                </span>
            </div>
        );
    };

    return (
        <div className="relative w-full min-h-[100dvh] bg-gray-100 flex flex-col">
            {/* 상단 네비게이션 바 */}
            <div className="sticky top-0 z-50 bg-white px-4 py-4 flex items-center border-b border-gray-200 shadow-sm">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="text-xl font-bold mr-4 text-gray-800"
                >
                    ←
                </button>

                <h2 className="text-lg font-bold text-gray-800">
                    주행 기록 및 피드백
                </h2>
            </div>

            {/* 메인 콘텐츠 */}
            <div className="flex-1 px-4 pt-6 pb-10">

                {/* 누적 주행거리 */}
                <div className="bg-indigo-600 rounded-2xl p-6 shadow-md mb-6 text-white">
                    <p className="text-indigo-100 text-sm font-medium mb-1">
                        지금까지 너네비와 함께
                    </p>

                    <div className="flex items-end gap-1">
                        <span className="text-4xl font-black tracking-tight">
                            {totalDistance}
                        </span>

                        <span className="text-lg font-bold mb-1">
                            km
                        </span>

                        <span className="text-lg font-bold mb-1 ml-1">
                            달렸어요! 🚗
                        </span>
                    </div>
                </div>

                {/* 실제 주행 기록 */}
                <div className="space-y-4">
                    {histories.map((history) => (
                        <div
                            key={history.id}
                            className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
                        >
                            {/* 날짜 및 별점 */}
                            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
                                <span className="text-sm font-bold text-gray-500">
                                    {history.date || '-'}
                                </span>

                                {renderStars(
                                    history.rating
                                )}
                            </div>

                            {/* 경로 */}
                            <div className="mb-5">
                                <p className="text-xs text-gray-400 mb-1">
                                    탐색 경로
                                </p>

                                <p className="font-extrabold text-gray-900 text-lg flex items-center flex-wrap gap-2">
                                    {history.departure ||
                                        '출발지 정보 없음'}

                                    <svg
                                        className="w-4 h-4 text-indigo-500"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="3"
                                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                                        />
                                    </svg>

                                    {history.destination ||
                                        '도착지 정보 없음'}
                                </p>
                            </div>

                            {/* 주행 상세 */}
                            <div className="grid grid-cols-2 gap-y-4 gap-x-2 bg-gray-50 p-4 rounded-xl">
                                <div>
                                    <p className="text-xs text-gray-500 mb-0.5">
                                        주행 거리
                                    </p>

                                    <p className="font-bold text-gray-800">
                                        {history.distance ??
                                            '0.0'}{' '}
                                        km
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500 mb-0.5">
                                        주행 시간
                                    </p>

                                    <p className="font-bold text-gray-800">
                                        {history.time ||
                                            '-'}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500 mb-0.5">
                                        선택 모드
                                    </p>

                                    <p className="font-bold text-indigo-600">
                                        {history.mode ||
                                            '추천 경로'}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500 mb-0.5">
                                        비용 (통행료)
                                    </p>

                                    <p className="font-bold text-gray-800">
                                        {formatFee(
                                            history.fee
                                        )}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* 기록 없음 */}
                {histories.length === 0 && (
                    <div className="text-center py-20 text-gray-400">
                        <span className="text-5xl block mb-4">
                            📭
                        </span>

                        <p className="font-bold">
                            아직 주행 기록이 없습니다.
                        </p>

                        <p className="text-sm mt-1">
                            너네비와 함께 첫 주행을
                            시작해 보세요!
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}