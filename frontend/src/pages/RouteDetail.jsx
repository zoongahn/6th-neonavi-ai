import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function RouteDetail() {
    const navigate = useNavigate();
    const location = useLocation();

    console.log("S4에서 넘어온 데이터: ", location.state);

    // 이전 페이지(S4)에서 넘겨준 데이터
    const { tripData, route, axes } = location.state || {};

    // 💡 방어 코드: 직접 URL을 치고 들어왔을 경우를 대비한 기본 더미 데이터
    const displayRoute = route || {
        title: '추천 경로 A',
        time: '18분',
        distance: '5.2km',
        axes: {} // 기본 빈 객체 추가
    };

    const [aiReasons, setAiReasons] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        // 경로 데이터나 프로필이 없으면 더미 데이터 상태를 유지하거나 뒤로 보낼 수 있습니다.
        // 현재는 더미 데이터를 렌더링하기 위해 뒤로 보내지는 않지만,
        // 실제 API 호출 시 필수 데이터가 없다면 에러를 띄웁니다.
        if (!route || !tripData) {
            setErrorMessage('경로 데이터가 부족하여 AI 분석을 수행할 수 없습니다.');
            setIsLoading(false);
            return;
        }

        const fetchAiExplanation = async () => {
            setIsLoading(true);
            setErrorMessage('');
            try {
                // 🚀 백엔드 API 호출
                const response = await fetch('http://127.0.0.1:8000/api/routes/explain/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profile: tripData.profile,
                        mode: tripData.mode,
                        axes: axes || displayRoute.axes || {}
                    }),
                });

                if (!response.ok) {
                    throw new Error('AI 분석 데이터를 불러오지 못했습니다.');
                }

                const data = await response.json();
                setAiReasons(data.recommend_reasons || []);
            } catch (error) {
                console.error("AI 분석 호출 에러:", error);
                setErrorMessage(error.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAiExplanation();
    }, [route, tripData, axes, displayRoute.axes]);

    return (
        <div className="bg-gray-50 min-h-[100dvh] flex flex-col pb-10">
            {/* 상단 네비게이션 */}
            <div className="sticky top-0 z-50 bg-white px-4 py-4 flex items-center justify-between border-b border-gray-100 shadow-sm">
                <button onClick={() => navigate(-1)} className="text-xl font-bold text-gray-800">←</button>
                <h1 className="text-lg font-bold text-indigo-600">너네비 · NeoNavi</h1>
                <div className="w-6"></div> {/* 레이아웃 맞춤용 빈 공간 */}
            </div>

            <div className="p-4 space-y-6">
                {/* 1. 경로 요약 카드 */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center text-2xl">
                        📍
                    </div>
                    <div>
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md mb-1 inline-block">★ 추천 경로</span>
                        <h2 className="text-xl font-extrabold text-gray-900">{displayRoute.title}</h2>
                        <p className="text-sm text-gray-500 mt-1">🕒 예상 시간 {displayRoute.time} · 📏 {displayRoute.distance}</p>
                    </div>
                </div>

                {/* 2. 🚀 AI 맞춤 추천 이유 (API 연동) */}
                <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-1">
                        <span className="text-indigo-500">✨</span> 이 경로를 추천하는 이유
                    </h3>

                    <div className="space-y-3">
                        {/* 🌀 로딩 스켈레톤 UI */}
                        {isLoading && (
                            <div className="space-y-3 animate-pulse">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex gap-4 items-center">
                                        <div className="w-12 h-12 bg-gray-200 rounded-full flex-none"></div>
                                        <div className="flex-1 space-y-2 py-1">
                                            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                                            <div className="h-3 bg-gray-200 rounded w-full"></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ❌ 에러 메시지 */}
                        {!isLoading && errorMessage && (
                            <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm font-medium">
                                {errorMessage}
                            </div>
                        )}

                        {/* ✅ API 로딩 완료 후 실제 데이터 렌더링 */}
                        {!isLoading && !errorMessage && aiReasons.length > 0 && aiReasons.map((item, idx) => {
                            let displayIcon = "✨";
                            const iconStr = String(item.icon || "");

                            if (iconStr.includes("snowflake") || iconStr.includes("저감")) displayIcon = "❄️";
                            else if (iconStr.includes("money") || iconStr.includes("bill") || iconStr.includes("경제성")) displayIcon = "💰";
                            else if (iconStr.includes("shield") || iconStr.includes("안전")) displayIcon = "🛡️";
                            else if (iconStr.includes("car") || iconStr.includes("주행")) displayIcon = "🚗";
                            else if (iconStr.length <= 2) displayIcon = iconStr; // 이미 순수 이모지라면 그대로 사용

                            return (
                                <div key={idx} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex gap-4 items-center">
                                    <div className="text-3xl bg-gray-50 w-12 h-12 flex items-center justify-center rounded-full flex-none">
                                        {displayIcon}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">{item.title}</h4>
                                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            );

                        })}

                        {/* 예외: 데이터가 비어있을 경우 */}
                        {!isLoading && !errorMessage && aiReasons.length === 0 && (
                            <div className="text-center py-6 text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm">
                                분석 결과를 가져올 수 없습니다.
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. AI 경로 분석 (진행바 및 원본 데이터 유지) */}
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-1">
                        <span className="text-indigo-500">📈</span> AI 경로 분석
                    </h3>

                    <div className="flex items-center gap-6 mb-6">
                        {/* 진행바(Progress bar) 영역 */}
                        <div className="flex-1 space-y-3">
                            {[
                                { label: '🛡️ 안전성', score: 91 },
                                { label: '💺 승차감', score: 84 },
                                { label: '🍃 연비', score: 82 },
                                { label: '🚗 주행 편의성', score: 89 }
                            ].map((stat, idx) => (
                                <div key={idx} className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-gray-600 w-20">{stat.label}</span>
                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${stat.score}%` }}></div>
                                    </div>
                                    <span className="text-xs font-bold text-indigo-600">{stat.score}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 원본 데이터 비교 표 */}
                    <div className="mt-6 border-t border-gray-100 pt-4">
                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-1">
                            <span className="text-indigo-500">📊</span> 원본 데이터
                        </h4>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-500 text-xs border-b border-gray-100">
                                    <th className="font-medium pb-2 text-left">지표</th>
                                    <th className="font-bold text-indigo-600 pb-2 text-center">추천 경로</th>
                                    <th className="font-medium pb-2 text-center">후보 평균</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {[
                                    ['신호등 수', '7개', '16개'],
                                    ['평균 경사도', '1.8%', '3.6%'],
                                    ['회전 횟수', '9회', '17회'],
                                    ['곡률 지수', '0.021', '0.046'],
                                    ['혼잡도', '18%', '37%'],
                                    ['큰 도로 비율', '72%', '48%'],
                                    ['총 거리', '5.2km', '4.9km']
                                ].map((row, idx) => (
                                    <tr key={idx} className="text-gray-700">
                                        <td className="py-2.5 text-gray-600">{row[0]}</td>
                                        <td className="py-2.5 text-center font-bold text-indigo-600">{row[1]}</td>
                                        <td className="py-2.5 text-center text-gray-400">{row[2]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* 모델 입력 지표 (Pills) */}
                    <div className="mt-6 border-t border-gray-100 pt-4">
                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-1">
                            <span className="text-indigo-500">⚙️</span> 모델 입력 지표
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {[
                                'signal_count = 7', 'slope = 1.8%', 'turn_count = 9',
                                'curvature = 0.021', 'congestion = 18%', 'wide_road_ratio = 72%',
                                'distance_km = 5.2', 'duration_min = 18'
                            ].map((tag, idx) => (
                                <span key={idx} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl text-xs font-mono font-bold">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}