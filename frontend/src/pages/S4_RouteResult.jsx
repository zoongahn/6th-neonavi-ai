import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import TopNavBar from '../components/TopNavBar';
import RouteMap from '../components/RouteMap';
import DepartureTimeModal from '../components/S4_Timesetting'; // 모달 컴포넌트 추가
import { getRouteRecommendation } from '../api/naviApi';
import { readProfile } from '../utils/profileStorage';
import { buildRecommendRequest } from '../utils/buildRecommendRequest';

const TRIP_STORAGE_KEY = 'neonaviTrip';

function readSavedTrip() {
    try {
        return JSON.parse(sessionStorage.getItem(TRIP_STORAGE_KEY) || '{}');
    } catch (error) {
        console.error('저장된 경로 정보를 읽지 못했습니다.', error);
        return {};
    }
}

export default function S4_RouteResult() {
    const navigate = useNavigate();
    const location = useLocation();

    const tripData = useMemo(
        () => ({
            ...readSavedTrip(),
            ...(location.state || {})
        }),
        [location.state]
    );

    const selectedMode = tripData.mode || 'Comfort';
    const autoRecommend = tripData.autoRecommend ?? true;

    const [selectedRouteId, setSelectedRouteId] = useState(null);
    const [routes, setRoutes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    // 💡 모달 상태 및 설정된 시간 상태 추가
    const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
    const [departureTime, setDepartureTime] = useState(tripData.departureTime || 'now');

    // 도착 예정 시각 = 출발 설정 시간(또는 지금) + 소요시간
    const formatArrival = (durationMin) => {
        const baseTime = departureTime === 'now' ? Date.now() : new Date(departureTime).getTime();
        const arrival = new Date(baseTime + durationMin * 60 * 1000);

        return arrival.toLocaleTimeString('ko-KR', {
            hour: 'numeric',
            minute: '2-digit'
        }) + ' 도착';
    };

    // 💡 requestKey에 departureTime 추가하여 시간이 바뀌면 useEffect 재실행
    const requestKey = `${tripData.departure}|${tripData.destination}|${tripData.passenger}|${tripData.loadKg}|${selectedMode}|${autoRecommend}|${departureTime}`;

    useEffect(() => {
        let isActive = true;

        const fetchRoutes = async () => {
            setIsLoading(true);
            setErrorMessage('');

            try {
                const request = buildRecommendRequest(readProfile(), {
                    ...tripData,
                    mode: selectedMode,
                    autoRecommend,
                    departureTime // API 요청 시 출발 시간 전달
                });

                const data = await getRouteRecommendation(request);
                if (!isActive) return;

                const list = (data.routes || []).map((route, index) => ({
                    id: index,
                    routeId: route.route_id,
                    title: route.title,
                    description: route.reason,
                    time: `${route.duration_min}분`,
                    arrivalTime: formatArrival(route.duration_min),
                    distance: `${route.distance_km}km`,
                    fee: `${route.toll.toLocaleString()}원`,
                    path: route.path || []
                }));

                setRoutes(list);
                setSelectedRouteId(list.length ? 0 : null);
            } catch (error) {
                if (!isActive) return;
                console.error('경로 추천 실패', error);
                setErrorMessage(error.message || '경로를 불러오지 못했습니다.');
                setRoutes([]);
            } finally {
                if (isActive) setIsLoading(false);
            }
        };

        fetchRoutes();
        return () => {
            isActive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestKey]);

    const selectedRoute = routes.find((route) => route.id === selectedRouteId) || routes[0];

    const handleStartNavigation = () => {
        const navigationData = {
            ...tripData,
            mode: selectedMode,
            autoRecommend,
            departureTime, // 설정된 시간 정보 저장
            route: selectedRoute
        };

        sessionStorage.setItem(
            TRIP_STORAGE_KEY,
            JSON.stringify(navigationData)
        );

        navigate('/navi', {
            state: navigationData
        });
    };

    return (
        <div className="relative w-full h-[100dvh] overflow-hidden flex flex-col bg-gray-100">
            <div className="relative z-50 bg-white">
                <TopNavBar title="경로 탐색 결과" />
            </div>

            <div className="absolute inset-0 top-[56px] w-full h-full bg-gray-200 z-0">
                {routes.length > 0 ? (
                    <RouteMap
                        routes={routes}
                        selectedId={selectedRouteId ?? 0}
                        onSelect={setSelectedRouteId}
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center opacity-40">
                        <span className="text-6xl mb-4">🗺️</span>
                        <p className="text-gray-500 font-bold text-xl">
                            {isLoading ? '경로를 찾는 중' : '표시할 경로가 없습니다'}
                        </p>
                    </div>
                )}
            </div>

            <div className="absolute top-[72px] left-4 right-4 z-30 space-y-2">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1">탐색 경로</p>
                    <p className="font-bold text-gray-900 break-words">
                        {tripData.departure || '출발지'}
                        <span className="mx-2 text-indigo-500">→</span>
                        {tripData.destination || '도착지'}
                    </p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1">현재 적용 모드</p>
                    <div className="flex items-center justify-between">
                        <p className="font-extrabold text-indigo-600">
                            {autoRecommend ? 'AI 자동 추천' : selectedMode}
                        </p>
                        <span className="text-xs text-gray-500">
                            {autoRecommend ? '성향 기반' : '직접 선택'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-white via-white/95 to-transparent pt-8 pb-8">
                {isLoading && (
                    <div className="px-4 pb-4">
                        <div className="bg-white rounded-2xl border border-gray-200 px-4 py-6 text-center">
                            <p className="font-bold text-gray-700">성향에 맞는 경로를 찾는 중...</p>
                            <p className="text-xs text-gray-500 mt-1">도로·신호·경사 정보를 분석하고 있어요</p>
                        </div>
                    </div>
                )}

                {!isLoading && errorMessage && (
                    <div className="px-4 pb-4">
                        <div className="bg-white rounded-2xl border border-red-200 px-4 py-5">
                            <p className="font-bold text-red-500 mb-1">경로를 불러오지 못했습니다</p>
                            <p className="text-xs text-gray-600 whitespace-pre-line">{errorMessage}</p>
                        </div>
                    </div>
                )}

                <div className="flex overflow-x-auto gap-3 px-4 pb-4 hide-scrollbar">
                    {routes.map((route) => {
                        const isSelected = selectedRouteId === route.id;

                        return (
                            <div
                                key={route.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedRouteId(route.id)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        setSelectedRouteId(route.id);
                                    }
                                }}
                                className={`min-w-[180px] flex-shrink-0 p-4 rounded-2xl cursor-pointer transition-all bg-white shadow-sm ${isSelected
                                    ? 'border-[2.5px] border-indigo-600'
                                    : 'border border-gray-200 opacity-90'
                                    }`}
                            >
                                <div className="flex justify-between items-start gap-2 mb-1">
                                    <span
                                        className={`font-extrabold text-[15px] ${isSelected ? 'text-indigo-600' : 'text-gray-700'
                                            }`}
                                    >
                                        {route.title}
                                    </span>
                                    <button
                                        type="button"
                                        className="flex-none text-xs font-bold text-white bg-indigo-600 px-3 py-1.5 rounded-lg shadow-sm active:bg-indigo-700 transition-colors"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            navigate('/detail', { state: { route } });
                                        }}
                                    >
                                        상세
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mb-2 leading-5">
                                    {route.description}
                                </p>
                                <div className="text-2xl font-black text-gray-900 tracking-tight my-1.5">
                                    {route.time}
                                </div>
                                <div className="text-sm text-gray-600 mb-1 font-medium">
                                    {route.arrivalTime}
                                </div>
                                <div className="text-xs text-gray-500 font-medium">
                                    {route.distance} · {route.fee}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="px-4 flex gap-2">
                    <button
                        type="button"
                        onClick={() => setIsTimeModalOpen(true)}
                        className="flex-none w-1/3 bg-gray-500 text-white py-4 rounded-xl font-bold text-[15px] shadow-sm active:bg-gray-600 transition-colors"
                    >
                        다른시간 출발
                    </button>

                    <button
                        type="button"
                        onClick={handleStartNavigation}
                        disabled={!selectedRoute}
                        className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-md active:bg-indigo-700 transition-colors disabled:bg-gray-400"
                    >
                        안내시작
                    </button>
                </div>
            </div>

            <DepartureTimeModal
                isOpen={isTimeModalOpen}
                onClose={() => setIsTimeModalOpen(false)}
                initialTime={departureTime}
                onConfirm={(newTime) => {
                    setDepartureTime(newTime);
                }}
            />

            <style>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}