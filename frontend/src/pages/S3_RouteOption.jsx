import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import TopNavBar from '../components/TopNavBar';

const TRIP_STORAGE_KEY = 'neonaviTrip';

function readSavedTrip() {
    try {
        return JSON.parse(sessionStorage.getItem(TRIP_STORAGE_KEY) || '{}');
    } catch (error) {
        console.error('저장된 경로 정보를 읽지 못했습니다.', error);
        return {};
    }
}

export default function S3_RouteOption() {
    const navigate = useNavigate();
    const location = useLocation();

    const tripData = useMemo(
        () => ({
            ...readSavedTrip(),
            ...(location.state || {})
        }),
        [location.state]
    );

    const [mode, setMode] = useState(tripData.mode || 'Comfort');
    const [autoRecommend, setAutoRecommend] = useState(
        tripData.autoRecommend ?? true
    );

    const modes = ['Comfort', 'Sports', 'Eco'];

    const handleAutoRecommend = () => {
        const nextValue = !autoRecommend;
        setAutoRecommend(nextValue);

        if (nextValue) {
            setMode('Comfort');
        }
    };

    const handleModeSelect = (selectedMode) => {
        setAutoRecommend(false);
        setMode(selectedMode);
    };

    const handleRecommend = () => {
        const nextTripData = {
            ...tripData,
            mode,
            autoRecommend
        };

        sessionStorage.setItem(
            TRIP_STORAGE_KEY,
            JSON.stringify(nextTripData)
        );

        navigate('/result', {
            state: nextTripData
        });
    };

    return (
        <div className="min-h-[100dvh] bg-white flex flex-col">
            <TopNavBar title="경로 옵션 설정" />

            <main className="flex-1 p-6">
                <section className="bg-white rounded-2xl border border-gray-200 px-4 py-4 shadow-sm mt-2">
                    <p className="text-xs text-gray-500 mb-2">입력한 경로</p>
                    <p className="font-bold text-gray-900 break-words">
                        {tripData.departure || '출발지'}
                        <span className="mx-2 text-brand-500">→</span>
                        {tripData.destination || '도착지'}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                        동승자: {tripData.passenger || '혼자'}
                    </p>
                </section>

                <section className="bg-gray-50 p-5 rounded-2xl border border-gray-100 mt-4">
                    <div className="flex justify-between items-start gap-4 mb-4">
                        <div>
                            <h2 className="font-bold text-gray-800">
                                AI 성향 자동 추천
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                사용자 성향에 맞는 모드를 자동으로 선택해요
                            </p>
                        </div>

                        <input
                            type="checkbox"
                            checked={autoRecommend}
                            onChange={handleAutoRecommend}
                            className="w-6 h-6 accent-brand-600 cursor-pointer flex-none"
                            aria-label="AI 성향 자동 추천"
                        />
                    </div>

                    <div className="border-t border-gray-200 pt-4">
                        <p className="text-sm font-semibold text-gray-700 mb-3">
                            직접 모드 선택
                        </p>

                        <div className="flex gap-2">
                            {modes.map((item) => {
                                const isSelected =
                                    !autoRecommend && mode === item;

                                return (
                                    <button
                                        key={item}
                                        type="button"
                                        onClick={() => handleModeSelect(item)}
                                        className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-all ${
                                            isSelected
                                                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                                                : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'
                                        }`}
                                        aria-pressed={isSelected}
                                    >
                                        {item}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-4 bg-white rounded-xl border border-gray-200 px-4 py-3">
                            <p className="text-xs text-gray-500 mb-1">
                                현재 설정
                            </p>
                            <p className="font-bold text-brand-600">
                                {autoRecommend
                                    ? 'AI 자동 추천'
                                    : `${mode} 모드`}
                            </p>
                        </div>
                    </div>
                </section>
            </main>

            <div className="w-full bg-white px-6 pt-3 pb-8">
                <button
                    type="button"
                    onClick={handleRecommend}
                    className="w-full bg-brand-600 text-white py-4 rounded-xl font-bold text-lg shadow-sm active:bg-brand-700 transition-colors"
                >
                    분석하고 경로 추천받기
                </button>
            </div>
        </div>
    );
}
