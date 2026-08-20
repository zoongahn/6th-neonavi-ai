import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import TopNavBar from '../components/TopNavBar';

/*
    성향 축은 sports/comfort/fuel 셋뿐이다. '안전성'은 2026-07-18 계약 개정에서
    삭제되고 comfort 로 흡수됐다 — 화면에 남겨 두면 없는 축의 점수를 보여주게 된다.

    ⚠️ 라벨은 ai/schema.py 의 AXIS_KOR 과 같아야 한다. 근거 카드 문구가 거기서
       나오므로, 다르면 한 화면에서 같은 축이 두 이름으로 불린다.
*/
const AXIS_LABEL = {
    sports: '스포티',
    comfort: '편안함',
    fuel: '경제성'
};

/*
    '원본 데이터' 표에 쓸 특성. 값이 없으면(공공데이터 미커버 구간 등) 행을 뺀다.
    없는 값을 0으로 채워 보여주면 "신호등 0개"라는 거짓말이 된다.
    [키, 표시명, 포맷터]
*/
const RAW_ROWS = [
    ['signal_count', '신호등 밀도', (v) => `${v.toFixed(1)}개/km`],
    // slope 는 무단위 grade (0.05 = 5%) — elevation.route_slope
    ['slope', '평균 경사도', (v) => `${(v * 100).toFixed(1)}%`],
    // turn_count 는 '횟수'가 아니라 km당 밀도다 (vectorize._turn_density)
    ['turn_count', '회전 밀도', (v) => `${v.toFixed(1)}회/km`],
    ['curvature', '곡률 지수', (v) => v.toFixed(4)],
    ['congestion', '혼잡도', (v) => `${(v * 100).toFixed(0)}%`],
    ['road_type', '큰 도로 비율', (v) => `${(v * 100).toFixed(0)}%`],
    ['speed_limit', '평균 제한속도', (v) => `${Math.round(v)}km/h`],
    ['avg_speed', '평균 주행속력', (v) => `${Math.round(v)}km/h`],
    ['fuel_cost', '예상 연료', (v) => `${v.toFixed(2)}L`],
    ['toll', '통행료', (v) => (v > 0 ? `${Math.round(v).toLocaleString()}원` : '없음')],
    ['distance_km', '총 거리', (v) => `${v.toFixed(1)}km`],
    ['duration_min', '예상 시간', (v) => `${Math.round(v)}분`]
];

// 0 이 '공백'이 아니라 실제 측정값인 특성 — 0 이어도 표에 남긴다.
const ZERO_IS_REAL = new Set(['toll']);

export default function RouteDetail() {
    const location = useLocation();

    // 이전 페이지(S4)에서 넘겨준 데이터
    const { tripData, route, axes, preference } = location.state || {};

    /*
        rank 0 = 추천 경로, 1.. = 대안. 제목 문자열('대안 경로 1')을 파싱하지 않고
        숫자로 판단한다 — 문구가 바뀌면 조용히 깨지는 종류의 의존이라서.
    */
    const isTopRoute = (route?.rank ?? 0) === 0;
    const routeCaption = isTopRoute
        ? (preference?.label ? `${preference.label} 성향` : '성향 종합 1순위')
        : `${route?.rank}번째 대안`;

    const tollValue = route?.features?.toll;
    const tollText =
        typeof tollValue !== 'number'
            ? ''
            : tollValue > 0
                ? `통행료 ${Math.round(tollValue).toLocaleString()}원`
                : '통행료 없음';

    // 직접 URL 로 들어온 경우를 대비한 기본값
    const displayRoute = route || {
        title: '추천 경로 A',
        time: '18분',
        distance: '5.2km',
        axes: {} // 기본 빈 객체 추가
    };

    /*
        추천 근거는 **추천 계산에서 이미 나온다**(backend recommend → recommend_reasons).
        같은 후보집합·같은 w·f 로 만들어지므로 목록의 배지와 상세의 근거가
        서로 다른 말을 하지 않고, 상세를 열 때 기다릴 것도 없다.

        LLM 호출(/api/routes/explain/)은 그 값이 없을 때만 쓰는 폴백이다.
        (구버전 백엔드에 붙었거나 응답이 비어 온 경우)
    */
    const localReasons = route?.recommendReasons || route?.recommend_reasons || [];
    const hasLocalReasons = localReasons.length > 0;

    /* ── 아래 세 블록은 예전엔 전부 하드코딩된 예시값이었다. ──────────────
       숫자가 그럴듯해서 진짜 모델 출력처럼 보였고, 근거 카드와 서로 다른 말을
       했다(카드엔 안 나오는 '신호등 7개'가 표에 있었다). 실값만 그린다. */
    const axisStats = useMemo(() => {
        const src = route?.axes || axes || {};
        return Object.keys(AXIS_LABEL)
            .filter((k) => typeof src[k] === 'number')
            .map((k) => ({
                label: AXIS_LABEL[k],
                score: Math.round(src[k] * 100)
            }));
    }, [route, axes]);

    // 매 렌더 새 객체를 만들면 아래 useMemo 가 무의미해진다(CRA 는 이 경고를
    // CI 빌드에서 에러로 취급한다).
    const rawFeatures = useMemo(() => route?.features || {}, [route]);
    const peerFeatures = useMemo(
        () => route?.featuresPeerAvg || route?.features_peer_avg || {},
        [route]
    );

    /*
        값이 후보 전체에서 0 이면 '측정된 0'이 아니라 **공백**일 가능성이 높다.
        실제로 신호등 표준데이터는 경기도만 수집돼 있어 서울 경로는 전부 0 인데,
        그대로 그리면 "신호등 0개/km"라는 사실과 다른 문장이 된다.
    */
    const shownKeys = useMemo(
        () =>
            RAW_ROWS.filter(([key]) => {
                if (typeof rawFeatures[key] !== 'number') return false;
                if (ZERO_IS_REAL.has(key)) return true;
                const peer = peerFeatures[key];
                const peerEmpty = typeof peer !== 'number' || peer === 0;
                return !(rawFeatures[key] === 0 && peerEmpty);
            }),
        [rawFeatures, peerFeatures]
    );

    const rawRows = useMemo(
        () =>
            shownKeys.map(([key, label, fmt]) => [
                label,
                fmt(rawFeatures[key]),
                typeof peerFeatures[key] === 'number' ? fmt(peerFeatures[key]) : '—'
            ]),
        [shownKeys, rawFeatures, peerFeatures]
    );

    const [aiReasons, setAiReasons] = useState(localReasons);
    const [isLoading, setIsLoading] = useState(!hasLocalReasons);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (hasLocalReasons) return;      // 이미 근거가 있으면 호출하지 않는다

        if (!route || !tripData) {
            setErrorMessage('경로 데이터가 부족하여 추천 근거를 표시할 수 없습니다.');
            setIsLoading(false);
            return;
        }

        const fetchAiExplanation = async () => {
            setIsLoading(true);
            setErrorMessage('');
            try {
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
    }, [hasLocalReasons, route, tripData, axes, displayRoute.axes]);

    return (
        <div className="bg-gray-50 min-h-[100dvh] flex flex-col pb-10">
            {/* 상단 바는 공용 컴포넌트를 쓴다. 예전엔 이 화면만 자체 헤더라
                높이·패딩·제목 색이 다른 페이지와 달랐고, 제목도 서비스 이름
                ('너네비 · NeoNavi')이라 지금 무슨 화면인지 알려주지 않았다.
                다른 화면 규칙: '경로 옵션 설정' · '경로 탐색 결과'. */}
            <TopNavBar title="경로 상세" />

            <div className="p-4 space-y-6">
                {/* 1. 경로 요약 — 배지+정체 한 줄, 지표 한 줄.
                    예전엔 왼쪽에 📍 아바타 원이 있었는데 모든 경로에서 같은 그림이라
                    아무것도 구별하지 않으면서 글 폭만 좁혔다. 그리고 배지가
                    '★ 추천 경로'로 **하드코딩**돼 있어 대안 경로 상세를 열어도
                    추천 경로라고 표시됐다(제목은 '대안 경로 1'인데). rank 로 판단한다. */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span
                            className={
                                'text-xs font-bold px-2 py-1 rounded-md ' +
                                (isTopRoute
                                    ? 'text-indigo-600 bg-indigo-50'
                                    : 'text-gray-500 bg-gray-100')
                            }
                        >
                            {isTopRoute ? '추천 경로' : '대안'}
                        </span>
                        <span className="text-sm font-bold text-gray-700">{routeCaption}</span>
                    </div>
                    <p className="text-lg font-extrabold text-gray-900 mt-3">
                        {[displayRoute.time, displayRoute.distance, tollText]
                            .filter(Boolean)
                            .join(' · ')}
                    </p>
                </div>

                {/* 2. 추천 근거 — 추천 계산에서 함께 내려온다 */}
                <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-3">
                        이 경로를 추천하는 이유
                    </h3>

                    <div className="space-y-3">
                        {/* 로딩 스켈레톤 (LLM 폴백 경로에서만 보인다) */}
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

                        {/* 에러 메시지 */}
                        {!isLoading && errorMessage && (
                            <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm font-medium">
                                {errorMessage}
                            </div>
                        )}

                        {/* 근거 카드 */}
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
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                        AI 경로 분석
                    </h3>

                    <div className="flex items-center gap-6 mb-6">
                        {/* 진행바 — 모델이 낸 축 만족도 f (0~1). 지어낸 값이 아니다.
                            축은 sports/comfort/fuel 셋뿐이다('안전성'은 2026-07-18
                            계약에서 삭제되고 comfort 로 흡수됐다). */}
                        <div className="flex-1 space-y-3">
                            {axisStats.map((stat, idx) => (
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
                        <h4 className="font-bold text-gray-800 mb-3">
                            원본 데이터
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
                                {rawRows.map((row, idx) => (
                                    <tr key={idx} className="text-gray-700">
                                        <td className="py-2.5 text-gray-600">{row[0]}</td>
                                        <td className="py-2.5 text-center font-bold text-indigo-600">{row[1]}</td>
                                        <td className="py-2.5 text-center text-gray-400">{row[2]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}