import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function RouteDetail() {
    const navigate = useNavigate();
    const location = useLocation();

    // 이전 페이지에서 넘겨준 경로 데이터 (없을 경우 기본 더미 데이터 사용)
    const route = location.state?.route || {
        title: '추천 경로 A',
        time: '18분',
        distance: '5.2km'
    };

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
                        <h2 className="text-xl font-extrabold text-gray-900">{route.title}</h2>
                        <p className="text-sm text-gray-500 mt-1">🕒 예상 시간 {route.time} · 📏 {route.distance}</p>
                    </div>
                </div>

                {/* 2. 이 경로를 추천하는 이유 (Image 1 파트) */}
                <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-1">
                        <span className="text-indigo-500">✨</span> 이 경로를 추천하는 이유
                    </h3>
                    <div className="space-y-3">
                        {/* 이유 카드 리스트 */}
                        {[
                            { icon: '🚦', title: '신호등 수 매우 적음', desc: '불필요한 정차가 적어 편안하게 주행할 수 있어요.' },
                            { icon: '⛰️', title: '경사 완만', desc: '급한 오르막·내리막이 적어 초보 운전자에게 부담이 적어요.' },
                            { icon: '↪️', title: '급커브 적음', desc: '회전이 많은 구간이 적어 안정적으로 이동할 수 있어요.' },
                            { icon: '🚘', title: '혼잡도 낮음', desc: '막히는 구간이 적어 예측 가능한 이동이 가능해요.' },
                            { icon: '🛣️', title: '큰 도로 비율 높음', desc: '넓은 도로 위주로 안내해 더욱 안전하게 주행할 수 있어요.' }
                        ].map((item, idx) => (
                            <div key={idx} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex gap-4 items-center">
                                <div className="text-3xl bg-gray-50 w-12 h-12 flex items-center justify-center rounded-full flex-none">{item.icon}</div>
                                <div>
                                    <h4 className="font-bold text-gray-900">{item.title}</h4>
                                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. AI 경로 분석 (Image 2 파트) */}
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