import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import TopNavBar from '../components/TopNavBar';
import RouteMap from '../components/RouteMap';
import DepartureTimeModal from '../components/S4_Timesetting'; // 모달 컴포넌트 추가
import { getRouteRecommendation } from '../api/naviApi';
import { hasUsableProfile, readProfile } from '../utils/profileStorage';
import { buildRecommendRequest } from '../utils/buildRecommendRequest';
import { readTrip, writeTrip } from '../utils/tripStorage';

export default function S4_RouteResult() {
    const navigate = useNavigate();
    const location = useLocation();

    const tripData = useMemo(
        () => ({
            ...readTrip(),
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
    // 프로필이 없어 추천 자체가 불가능한 상태 (에러가 아니라 '할 일'이다)
    const [needsProfile, setNeedsProfile] = useState(false);
    // 성향은 사용자당 하나라 경로마다 반복하지 않고 목록 위에 한 번만 보여준다.
    const [preference, setPreference] = useState(null);

    /*
        지도는 컨테이너 전체에 경로를 맞추는데, 실제로는 위(탐색 경로 카드)와
        아래(경로 목록)가 지도를 덮고 있다. 그래서 그냥 맞추면 출발·도착점이
        UI 뒤로 숨는다. 덮는 높이를 실제로 재서 여백으로 넘긴다
        (숫자를 박아 두면 카드 내용이 길어질 때마다 다시 어긋난다).
    */
    const topOverlayRef = useRef(null);
    const bottomOverlayRef = useRef(null);
    const [mapPadding, setMapPadding] = useState({ top: 40, right: 32, bottom: 40, left: 32 });

    useEffect(() => {
        const measure = () => {
            const top = topOverlayRef.current?.getBoundingClientRect().height ?? 0;
            const bottom = bottomOverlayRef.current?.getBoundingClientRect().height ?? 0;
            setMapPadding((prev) => {
                // 상단 카드는 지도 시작선(56px)보다 16px 아래에서 시작한다
                const next = { top: Math.round(top) + 32, right: 32, bottom: Math.round(bottom) + 16, left: 32 };
                return prev.top === next.top && prev.bottom === next.bottom ? prev : next;
            });
        };
        measure();

        const observer = new ResizeObserver(measure);
        [topOverlayRef.current, bottomOverlayRef.current].forEach((el) => el && observer.observe(el));
        return () => observer.disconnect();
    }, [routes, preference, isLoading]);

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
            /*
                보통은 S0 에서 갈라주므로 여기 오지 않는다. 다만 주소를 직접 치거나
                저장소가 비워진 뒤 뒤로가기로 들어올 수 있어서, 그때 빨간 에러만
                띄우지 않고 바로 입력 화면으로 갈 수 있게 한다.
            */
            if (!hasUsableProfile()) {
                setIsLoading(false);
                setNeedsProfile(true);
                setRoutes([]);
                return;
            }
            setNeedsProfile(false);
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
                    // 이 경로를 1순위로 고르는 다른 성향들 (없으면 빈 배열)
                    preferredBy: route.preferred_by_labels || [],
                    path: route.path || [],
                    // 주행 화면(S5)이 쓰는 것 — 남은시간 환산에 숫자가 필요하고,
                    // steps 는 턴바이턴 안내다. 문자열('25분')만 넘기면 S5에서 못 쓴다.
                    durationMin: route.duration_min,
                    distanceKm: route.distance_km,
                    steps: route.steps || []
                }));

                setRoutes(list);
                setPreference(data.preference || null);
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
            route: selectedRoute,
            // 층3 지표용 — 모델이 1순위로 민 경로와 사용자가 실제로 고른 경로가
            // 같은지 세려면 둘 다 필요하다. 여기서 안 넘기면 S6에서 복원할 수 없다.
            recommendedRouteId: routes[0]?.routeId || '',
            candidateCount: routes.length,
            preferenceAxis: preference?.axis || ''
        };

        writeTrip(navigationData);

        navigate('/navi', {
            state: navigationData
        });
    };

    return (
        <div className="relative w-full h-[100dvh] overflow-hidden flex flex-col bg-gray-100">
            <div className="relative z-50 bg-white">
                <TopNavBar title="경로 탐색 결과" />
            </div>

            {/* h-full 을 빼야 한다. top-[56px] 과 함께 쓰면 height 가 이기고 bottom:0 이
                무시돼서 지도가 화면보다 56px 아래로 삐져나간다 → 지도는 자기 높이를
                실제 보이는 것보다 크게 알고 화면을 맞춘다(경로 아래쪽이 잘린다). */}
            <div className="absolute inset-0 top-[56px] w-full bg-gray-200 z-0">
                {routes.length > 0 ? (
                    <RouteMap
                        routes={routes}
                        selectedId={selectedRouteId ?? 0}
                        onSelect={setSelectedRouteId}
                        padding={mapPadding}
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

            <div ref={topOverlayRef} className="absolute top-[72px] left-4 right-4 z-30 space-y-2">
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

                    {/* 랭킹 근거는 여기서 한 번만. 경로마다 반복하면 설명이 아니라 소음이 된다. */}
                    {preference && (
                        <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-100">
                            {preference.source === 'selected' ? '선택하신 ' : '입력하신 정보로는 '}
                            <span className="font-bold text-gray-900">{preference.label}</span>
                            {preference.source === 'selected'
                                ? ' 기준으로 정렬했습니다'
                                : '을(를) 우선하는 성향입니다'}
                            {preference.unanimous && (
                                <span className="block text-[11px] text-gray-400 mt-0.5">
                                    이 구간은 어떤 성향이어도 같은 경로가 1순위입니다
                                </span>
                            )}
                        </p>
                    )}
                </div>
            </div>

            <div ref={bottomOverlayRef} className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-white via-white/95 to-transparent pt-8 pb-8">
                {isLoading && (
                    <div className="px-4 pb-4">
                        <div className="bg-white rounded-2xl border border-gray-200 px-4 py-6 text-center">
                            <p className="font-bold text-gray-700">성향에 맞는 경로를 찾는 중...</p>
                            <p className="text-xs text-gray-500 mt-1">도로·신호·경사 정보를 분석하고 있어요</p>
                        </div>
                    </div>
                )}

                {needsProfile && (
                    <div className="px-4 pb-4">
                        <div className="bg-white rounded-2xl border border-indigo-200 px-4 py-5">
                            <p className="font-bold text-gray-900 mb-1">기본 정보가 필요해요</p>
                            <p className="text-xs text-gray-600 mb-4">
                                나이·성별·차종·연식으로 운전 성향을 추론합니다. 한 번만 입력하면 돼요.
                            </p>
                            <button
                                type="button"
                                onClick={() =>
                                    navigate('/profile', { state: { profileRequired: true } })
                                }
                                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold active:bg-indigo-700 transition-colors"
                            >
                                기본 정보 입력하기
                            </button>
                        </div>
                    </div>
                )}

                {!isLoading && !needsProfile && errorMessage && (
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
                                {/* 다른 성향이었다면 이 경로가 1순위였다는 표시 */}
                                {route.preferredBy.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-1.5">
                                        {route.preferredBy.map((label) => (
                                            <span
                                                key={label}
                                                className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded"
                                            >
                                                {label} 우선이라면
                                            </span>
                                        ))}
                                    </div>
                                )}

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