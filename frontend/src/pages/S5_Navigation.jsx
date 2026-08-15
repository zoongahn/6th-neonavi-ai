import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getRouteRecommendation } from '../api/naviApi';
import { readProfile } from '../utils/profileStorage';
import { buildRecommendRequest } from '../utils/buildRecommendRequest';

const TRIP_STORAGE_KEY = 'neonaviTrip';

/** 추론된 성향 축 → 버튼에 쓰는 모드 이름 */
const AXIS_TO_MODE = { sports: 'Sports', comfort: 'Comfort', fuel: 'Eco' };

function readSavedTrip() {
    try {
        return JSON.parse(sessionStorage.getItem(TRIP_STORAGE_KEY) || '{}');
    } catch (error) {
        console.error('저장된 경로 정보를 읽지 못했습니다.', error);
        return {};
    }
}

export default function S5_Navigation() {
    const navigate = useNavigate();
    const location = useLocation();

    const navigationData = useMemo(
        () => ({
            ...readSavedTrip(),
            ...(location.state || {})
        }),
        [location.state]
    );

    const destination = navigationData.destination || '도착지';

    /*
        자동 추천이면 S4가 추론한 성향축(preferenceAxis)을 그대로 보여준다.
        예전엔 무조건 'Comfort'로 떨어져서, 스포티로 추론된 주행인데 화면엔
        "Comfort 주행 중"이 뜨고 그 값이 주행 기록에도 남았다.
    */
    const [currentMode, setCurrentMode] = useState(() => {
        if (navigationData.autoRecommend && navigationData.preferenceAxis) {
            return AXIS_TO_MODE[navigationData.preferenceAxis] || 'Comfort';
        }
        return navigationData.mode || 'Comfort';
    });
    const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
    const [route, setRoute] = useState(navigationData.route || {});
    const [isRerouting, setIsRerouting] = useState(false);
    const [rerouteError, setRerouteError] = useState('');

    const selectedRoute = route;

    /** 모드를 바꾸면 그 기준으로 실제 재탐색한다(예전엔 로그만 찍었다). */
    const handleModeChange = async (newMode) => {
        setIsModeMenuOpen(false);
        if (newMode === currentMode) return;

        const previousMode = currentMode;
        setCurrentMode(newMode);
        setIsRerouting(true);
        setRerouteError('');

        try {
            const data = await getRouteRecommendation(
                buildRecommendRequest(readProfile(), {
                    ...navigationData,
                    mode: newMode,
                    autoRecommend: false
                })
            );

            const top = (data.routes || [])[0];
            if (!top) throw new Error('경로를 찾지 못했습니다.');

            const nextRoute = {
                routeId: top.route_id,
                title: top.title,
                description: top.reason,
                time: `${top.duration_min}분`,
                distance: `${top.distance_km}km`,
                fee: `${top.toll.toLocaleString()}원`,
                path: top.path || []
            };
            setRoute(nextRoute);

            sessionStorage.setItem(
                TRIP_STORAGE_KEY,
                JSON.stringify({
                    ...navigationData,
                    mode: newMode,
                    autoRecommend: false,
                    preferenceAxis: data.preference?.axis || '',
                    recommendedRouteId: top.route_id,
                    candidateCount: (data.routes || []).length,
                    route: nextRoute
                })
            );
        } catch (error) {
            console.error('경로 재탐색 실패', error);
            setCurrentMode(previousMode);   // 실패했으면 표시도 되돌린다
            setRerouteError(error.message || '경로를 다시 찾지 못했습니다.');
        } finally {
            setIsRerouting(false);
        }
    };

    const handleFinishNavigation = () => {
        navigate('/feedback', {
            state: {
                ...navigationData,
                mode: currentMode,
                // 재탐색했으면 바뀐 경로가 실제 주행한 경로다
                route: selectedRoute
            }
        });
    };

    return (
        <div className="w-full h-[100dvh] bg-gray-200 relative overflow-hidden flex flex-col">
            <div className="absolute inset-0 bg-gray-300 flex items-center justify-center">
                <div className="text-center px-6">
                    <p className="text-gray-500 font-bold text-lg">
                        지도 영역 (API 연동)
                    </p>
                    <p className="text-sm text-gray-500 mt-2 break-words">
                        {navigationData.departure || '출발지'} → {destination}
                    </p>
                </div>
            </div>

            <div className="absolute top-4 left-4 right-4 z-10">
                <div className="bg-indigo-600 text-white rounded-2xl p-5 shadow-2xl flex items-center gap-4">
                    <div className="text-5xl">↪️</div>
                    <div className="flex-1 min-w-0">
                        <div className="text-3xl font-extrabold mb-1">300m</div>
                        <div className="text-lg font-medium opacity-90 break-words">
                            {destination} 방면 우회전
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-32 right-4 z-20 flex flex-col items-end gap-2">
                {isModeMenuOpen && (
                    <div className="bg-white rounded-xl shadow-xl p-2 flex flex-col gap-1 mb-2 border border-gray-100 w-32">
                        {['Comfort', 'Sports', 'Eco'].map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                disabled={isRerouting}
                                onClick={() => handleModeChange(mode)}
                                className={`py-2 px-3 text-sm font-bold rounded-lg text-left transition-colors disabled:opacity-40 ${
                                    currentMode === mode
                                        ? 'bg-indigo-50 text-indigo-600'
                                        : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {mode} {currentMode === mode && '✓'}
                            </button>
                        ))}
                    </div>
                )}

                <button
                    type="button"
                    disabled={isRerouting}
                    onClick={() => setIsModeMenuOpen((open) => !open)}
                    className="bg-white text-indigo-600 font-extrabold py-3 px-5 rounded-full shadow-lg border-2 border-indigo-100 flex items-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
                >
                    <span className="text-xl">✨</span>
                    {isRerouting ? '경로 다시 찾는 중…' : currentMode}
                </button>

                {rerouteError && (
                    <div className="bg-white border border-red-200 rounded-xl px-3 py-2 text-xs text-red-500 font-medium shadow max-w-[220px] text-right">
                        {rerouteError}
                    </div>
                )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-6 z-10">
                <div className="flex justify-between items-end gap-3 mb-4">
                    <div className="min-w-0">
                        <div className="text-3xl font-extrabold text-gray-900">
                            {selectedRoute.arrivalTime || '오후 3:45 도착'}
                        </div>
                        <div className="text-gray-500 font-medium mt-1">
                            <span className="text-indigo-600 font-bold">
                                {selectedRoute.time || '25분'}
                            </span>
                            {' 남음 · '}
                            {selectedRoute.distance || '16km'}
                        </div>
                    </div>

                    <div className="flex-none bg-gray-100 px-3 py-1.5 rounded-lg text-sm font-bold text-gray-600">
                        {currentMode} 주행 중
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleFinishNavigation}
                    className="w-full bg-red-500 text-white py-4 rounded-xl font-bold text-lg shadow-md active:bg-red-600 transition-colors"
                >
                    안내 종료
                </button>
            </div>
        </div>
    );
}
