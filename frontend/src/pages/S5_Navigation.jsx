import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import NavMap from '../components/NavMap';
import { getRouteRecommendation } from '../api/naviApi';
import { readProfile } from '../utils/profileStorage';
import { buildRecommendRequest } from '../utils/buildRecommendRequest';
import { readTrip, writeTrip } from '../utils/tripStorage';
import useDrivePosition from '../hooks/useDrivePosition';
import { cumulative, formatDistance, haversine, snapToPath } from '../utils/geo';
import { currentStep, prepareSteps } from '../utils/navSteps';

/** 추론된 성향 축 → 버튼에 쓰는 모드 이름 */
const AXIS_TO_MODE = { sports: 'Sports', comfort: 'Comfort', fuel: 'Eco' };

const ARRIVAL_M = 50;        // 남은거리가 이 아래면 도착으로 본다
const OFF_ROUTE_M = 60;      // 주행 중 경로에서 이만큼 벗어나면
const OFF_ROUTE_MS = 5000;   // 이 시간 이상 지속돼야 이탈로 친다(신호 튐 방지)
// 출발 전 스냅 허용 반경. 출발지를 도로에 붙이는 과정(카카오)과 GPS 오차를
// 합쳐 100m 안팎까지 벌어질 수 있어 넉넉히 잡는다. 이 값이 '주행 시작' 판정은
// 아니다 — 그건 OFF_ROUTE_M 이 따로 본다.
const START_SNAP_M = 150;
/*
    ⚠️ 주행 '시작' 판정은 OFF_ROUTE_M 보다 훨씬 느슨해야 한다. 그 값은 원래
    주행 중 경로 이탈을 잡으려던 것이고, 출발 시점에는 다음이 겹친다.
      · 카카오가 출발지를 도로에 붙인다 — 단지·골목 안이면 그대로 100m 가까이
      · GPS 오차 — PC 는 WiFi 측위라 수십 m
    실제로 '가락한신아파트'를 찍으면 경로 시작점이 단지 밖 도로라, 60m 기준으로는
    "출발지에서 100m 떨어져 있습니다"에서 안내가 시작되지 않았다.
*/
const START_ON_ROUTE_M = 150;
const BACKTRACK_M = 30;      // 이만큼의 후퇴는 신호 흔들림으로 보고 무시한다
const SIM_SPEEDS = [40, 80, 160];

export default function S5_Navigation() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();

    const navigationData = useMemo(
        () => ({ ...readTrip(), ...(location.state || {}) }),
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
    const path = useMemo(() => route.path || [], [route.path]);

    // ── 경로 기하 (경로가 바뀔 때만 다시 만든다) ──────────────────
    const cum = useMemo(() => (path.length > 1 ? cumulative(path) : null), [path]);
    const totalM = cum ? cum[cum.length - 1] : 0;
    const steps = useMemo(() => prepareSteps(route.steps || [], cum), [route.steps, cum]);

    // ── 위치 ──────────────────────────────────────────────────
    // ?sim=1 이면 모의 주행으로 시작한다(발표·개발용).
    const [source, setSource] = useState(() => (searchParams.get('sim') === '1' ? 'sim' : 'gps'));
    const [simSpeed, setSimSpeed] = useState(80);
    const { position, heading, accuracyM, effectiveSource, notice } = useDrivePosition({
        source,
        path,
        speedKmh: simSpeed,
        active: !isRerouting,
    });

    // 현위치를 경로선 위로 붙인다. 직전 인덱스를 힌트로 줘서 엉뚱한 구간에 붙는 걸 막는다.
    //
    // ⚠️ state + effect 로 만들면 안 된다. 위치가 20fps 로 갱신되는 동안
    // setPosition 커밋 → effect → setSnapped 재커밋의 중첩 업데이트 사슬이
    // 계속 이어져 React 가 무한루프로 오인한다("Maximum update depth exceeded").
    // 파생값이므로 렌더 중에 계산한다.
    const snapHintRef = useRef(0);
    const snapPathRef = useRef(path);
    const maxAlongRef = useRef(0);
    // 스냅 방식을 출발 전/후로 가르는데, state 는 이 계산보다 늦게 반영되므로
    // ref 로도 들고 최신값을 본다.
    const hasStartedRef = useRef(false);
    if (snapPathRef.current !== path) {
        // 경로가 바뀌면(모드 전환) 힌트도 처음부터
        snapPathRef.current = path;
        snapHintRef.current = 0;
        maxAlongRef.current = 0;
    }
    const snapped = useMemo(() => {
        if (!position || !cum || path.length < 2) return null;
        const hit = snapToPath(path, cum, position, snapHintRef.current, 60, {
            // 출발 전에는 '가장 가까운' 대신 '붙을 수 있는 가장 이른' 지점.
            // 안 그러면 초반에 블록을 도는 경로에서, 경로선이 출발지 근처를
            // 두 번 지나가는 탓에 두 번째 통과 지점에 붙어 그 구간을 이미
            // 달린 것으로 잡힌다(출발지를 현위치로 찍어도 경로 중간에 서 있는
            // 그림이 나오던 원인).
            earliestWithin: hasStartedRef.current ? 0 : START_SNAP_M,
        });
        snapHintRef.current = hit.index;
        return hit;
    }, [position, path, cum]);

    /*
        진행거리는 뒤로 가지 않는다. GPS 가 튀거나 경로가 자기 자신에 가까워지는
        구간(나들목·지하차도)에서 한참 뒤로 붙으면 남은거리가 갑자기 늘어난다.
        되돌아간 것처럼 보이는 값은 표시하지 않는다(BACKTRACK_M 만큼은 신호
        흔들림으로 보고 허용).
    */
    const monotonicAlong = useMemo(() => {
        if (!snapped) return 0;
        if (snapped.distAlong + BACKTRACK_M < maxAlongRef.current) {
            return maxAlongRef.current;
        }
        maxAlongRef.current = Math.max(maxAlongRef.current, snapped.distAlong);
        return maxAlongRef.current;
    }, [snapped]);

    /*
        아직 경로에 올라타지 않은 상태(= 출발 전).

        snapToPath 는 아무리 멀리 있어도 "경로 위 가장 가까운 점"을 찾아준다.
        그래서 다른 동네에서 안내를 켜면 현위치가 경로 중간에 붙어 버린다.
        (가산동에서 강남역→광화문을 켜면 12.5km 떨어져 있는데도 경로의 42%
         지점에 붙어 "5.4km 왔고 6.0km 남음"이라고 표시됐다.)

        한 번이라도 경로 위에 올라온 적이 있는지로 구분한다.
          올라온 적 없음 + 지금 벗어남  → 출발 전(진행도를 0으로 두고 미리보기)
          올라온 적 있음 + 지금 벗어남  → 주행 중 경로 이탈
        모의 주행은 경로 위에서 시작하므로 곧바로 주행 중이 된다.
    */
    const [hasStarted, setHasStarted] = useState(false);
    // 측위가 ±80m 라고 스스로 말하는데 60m 이내를 요구하는 건 앞뒤가 맞지 않는다.
    const startRadiusM = Math.max(START_ON_ROUTE_M, accuracyM || 0);
    useEffect(() => {
        if (snapped && snapped.offsetM <= startRadiusM) setHasStarted(true);
    }, [snapped, startRadiusM]);
    hasStartedRef.current = hasStarted;

    /*
        경로 이탈 경고는 **한 번이라도 실제 경로 위에 올라온 뒤**에만 켠다.
        출발 판정을 느슨하게 잡았으므로, 그것만으로 이탈을 재면 단지에서 나오는
        동안 계속 "경로를 벗어났습니다"가 뜬다.
    */
    const [hasBeenOnRoute, setHasBeenOnRoute] = useState(false);
    useEffect(() => {
        if (snapped && snapped.offsetM <= OFF_ROUTE_M) setHasBeenOnRoute(true);
    }, [snapped]);

    // 경로가 바뀌면(모드 전환) 진행 상태를 처음으로
    useEffect(() => {
        setHasStarted(false);
        setHasBeenOnRoute(false);
        hasStartedRef.current = false;
    }, [path]);

    const onRoute = hasStarted && snapped;

    /*
        현위치 화살표가 가리킬 방향.

        경로 위에 있으면 **경로의 진행방향**을 쓴다. GPS 의 coords.heading 은
        정지 상태에서 null 이라, 첫 측위 때는 초기값 0(=정북)에 머물고 그
        뒤로는 '직전 점과의 방위'로 대체되는데 서 있으면 신호가 미세하게
        튀어 화살표가 제멋대로 돈다. 마커를 이미 경로에 스냅해 그리므로
        방향도 경로를 따라야 어긋나지 않는다.
        경로 밖(출발 대기)일 때만 GPS 방위를 쓴다 — 그땐 따라갈 선이 없다.
    */
    const displayHeading = onRoute ? snapped.heading : heading;
    const distanceToStart = useMemo(
        () => (position && path.length ? haversine(position, path[0]) : null),
        [position, path]
    );
    const distAlong = onRoute ? monotonicAlong : 0;
    const remainM = Math.max(0, totalM - distAlong);
    const step = useMemo(() => currentStep(steps, distAlong), [steps, distAlong]);

    /*
        남은 시간은 최초 예상 소요시간을 남은거리 비율로 줄여서 쓴다.
        실시간 교통으로 다시 재려면 매번 카카오를 다시 불러야 하고, 그건 곧
        리라우팅 복잡도로 이어진다(범위 밖). 이 값은 "처음 추정치의 잔여분"이다.
    */
    const baseDurationMin = Number(route.durationMin) || 0;
    const remainMin = totalM > 0 ? Math.max(0, (baseDurationMin * remainM) / totalM) : baseDurationMin;
    const arrivalText = useMemo(() => {
        const at = new Date(Date.now() + remainMin * 60000);
        return at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
    }, [remainMin]);

    // ── 경로 이탈 (표시만 한다. 재탐색은 하지 않는다) ──────────────
    const [isOffRoute, setIsOffRoute] = useState(false);
    const offSinceRef = useRef(0);
    useEffect(() => {
        if (!snapped || !hasBeenOnRoute) return;   // 경로에 올라오기 전은 이탈이 아니다
        if (snapped.offsetM > OFF_ROUTE_M) {
            if (!offSinceRef.current) offSinceRef.current = Date.now();
            else if (Date.now() - offSinceRef.current > OFF_ROUTE_MS) setIsOffRoute(true);
        } else {
            offSinceRef.current = 0;
            setIsOffRoute(false);
        }
    }, [snapped, hasBeenOnRoute]);

    // ── 화면 꺼짐 방지 ────────────────────────────────────────
    // 화면이 꺼지면 watchPosition 도 멈춘다(브라우저 정책). 주행 화면에선 필수.
    useEffect(() => {
        let lock = null;
        let cancelled = false;

        const acquire = async () => {
            if (!('wakeLock' in navigator)) return;
            try {
                lock = await navigator.wakeLock.request('screen');
                if (cancelled) lock.release();
            } catch (error) {
                // 배터리 절약 모드 등에서 거부될 수 있다. 주행을 막을 일은 아니다.
                console.warn('화면 꺼짐 방지를 켜지 못했습니다.', error);
            }
        };

        // 탭을 떠났다 돌아오면 lock 이 해제돼 있다 → 다시 잡는다
        const onVisible = () => {
            if (document.visibilityState === 'visible') acquire();
        };

        acquire();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisible);
            if (lock) lock.release().catch(() => {});
        };
    }, []);

    // ── 카메라 추적 ───────────────────────────────────────────
    const [follow, setFollow] = useState(true);
    const handleFollowBreak = useCallback(() => setFollow(false), []);

    // ── 안내 종료 / 도착 ──────────────────────────────────────
    const finishedRef = useRef(false);
    const finish = useCallback(
        (arrived) => {
            if (finishedRef.current) return;
            finishedRef.current = true;
            const trip = {
                ...navigationData,
                mode: currentMode,
                // 재탐색했으면 바뀐 경로가 실제 주행한 경로다
                route: selectedRoute,
                arrived,
            };
            writeTrip(trip);
            navigate('/feedback', { state: trip });
        },
        [navigationData, currentMode, selectedRoute, navigate]
    );

    useEffect(() => {
        // 출발 전에는 도착 판정을 하지 않는다. 목적지 근처 동네에서 안내를 켜면
        // 현위치가 경로 끝에 붙어 곧바로 /feedback 으로 튕길 수 있다.
        if (onRoute && totalM > 0 && remainM < ARRIVAL_M) finish(true);
    }, [onRoute, totalM, remainM, finish]);

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
                    autoRecommend: false,
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
                durationMin: top.duration_min,
                distanceKm: top.distance_km,
                path: top.path || [],
                steps: top.steps || [],
            };
            setRoute(nextRoute);

            writeTrip({
                ...navigationData,
                mode: newMode,
                autoRecommend: false,
                preferenceAxis: data.preference?.axis || '',
                recommendedRouteId: top.route_id,
                candidateCount: (data.routes || []).length,
                route: nextRoute,
            });
        } catch (error) {
            console.error('경로 재탐색 실패', error);
            setCurrentMode(previousMode);   // 실패했으면 표시도 되돌린다
            setRerouteError(error.message || '경로를 다시 찾지 못했습니다.');
        } finally {
            setIsRerouting(false);
        }
    };

    const hasPath = path.length > 1;

    return (
        <div className="w-full h-[100dvh] bg-gray-200 relative overflow-hidden flex flex-col">
            <div className="absolute inset-0">
                {hasPath ? (
                    <NavMap
                        path={path}
                        // 출발 전이면 경로에 붙이지 않는다. 엉뚱한 지점에 마커를
                        // 찍느니 경로 전체를 보여주는 미리보기가 정직하다.
                        position={onRoute ? { lng: snapped.lng, lat: snapped.lat } : null}
                        heading={displayHeading}
                        follow={follow && Boolean(onRoute)}
                        onFollowBreak={handleFollowBreak}
                    />
                ) : (
                    <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                        <div className="text-center px-6">
                            <p className="text-gray-500 font-bold text-lg">경로 정보가 없습니다</p>
                            <p className="text-sm text-gray-500 mt-2 break-words">
                                {navigationData.departure || '출발지'} → {destination}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* 회전 안내 카드 — 카카오가 준 안내문을 그대로 쓴다 */}
            <div className="absolute top-4 left-4 right-4 z-10">
                <div className="bg-brand-600 text-white rounded-2xl p-5 shadow-2xl flex items-center gap-4">
                    <div className="text-5xl leading-none flex-none w-14 text-center">
                        {onRoute ? (step ? step.icon : '🏁') : '📍'}
                    </div>
                    <div className="flex-1 min-w-0">
                        {onRoute ? (
                            <>
                                <div className="text-3xl font-extrabold mb-1">
                                    {step ? formatDistance(step.remainM) : formatDistance(remainM)}
                                </div>
                                <div className="text-lg font-medium opacity-90 break-words">
                                    {step ? step.guidance : `${destination} 도착`}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="text-2xl font-extrabold mb-1">출발 대기 중</div>
                                <div className="text-sm font-medium opacity-90 break-words">
                                    {navigationData.departure || '출발지'}에서 안내가 시작됩니다
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {(notice || isOffRoute || !onRoute) && (
                    <div className="mt-2 flex flex-col gap-1 items-start">
                        {!onRoute && distanceToStart !== null && (
                            <span className="bg-white/95 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full shadow">
                                출발지에서 <b>{formatDistance(distanceToStart)}</b> 떨어져 있습니다 ·
                                {' '}지금 보이는 건 경로 미리보기입니다
                            </span>
                        )}
                        {isOffRoute && (
                            <span className="bg-warn text-white text-xs font-bold px-3 py-1.5 rounded-full shadow">
                                경로를 벗어났습니다 · 재탐색은 하지 않습니다
                            </span>
                        )}
                        {notice && (
                            <span className="bg-white/95 text-gray-600 text-xs font-medium px-3 py-1.5 rounded-full shadow">
                                {notice}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* 우하단 컨트롤 — 하단 시트(약 188px) 위로 띄운다. bottom-32 면 시트에 겹쳐
                도착 시각과 "…주행 중" 표시를 가린다(예전 화면이 그랬다). */}
            <div className="absolute bottom-52 right-4 z-20 flex flex-col items-end gap-2">
                {!follow && (
                    <button
                        type="button"
                        onClick={() => setFollow(true)}
                        className="bg-white text-gray-700 text-sm font-bold py-2 px-4 rounded-full shadow-lg border border-gray-100 active:scale-95 transition-transform"
                    >
                        내 위치로
                    </button>
                )}

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
                                        ? 'bg-brand-50 text-brand-600'
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
                    className="bg-white text-brand-600 font-extrabold py-3 px-5 rounded-full shadow-lg border-2 border-brand-100 flex items-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
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

            {/* 좌하단 — 위치 소스 전환(데모용) */}
            <div className="absolute bottom-52 left-4 z-20 flex flex-col items-start gap-2">
                <button
                    type="button"
                    onClick={() => setSource(effectiveSource === 'sim' ? 'gps' : 'sim')}
                    className="bg-white/95 text-gray-600 text-xs font-bold py-2 px-3 rounded-full shadow border border-gray-100"
                >
                    {effectiveSource === 'sim' ? '모의 주행' : '실제 GPS'}
                </button>

                {effectiveSource === 'sim' && (
                    <div className="bg-white/95 rounded-full shadow border border-gray-100 flex overflow-hidden">
                        {SIM_SPEEDS.map((speed) => (
                            <button
                                key={speed}
                                type="button"
                                onClick={() => setSimSpeed(speed)}
                                className={`text-xs font-bold py-2 px-3 transition-colors ${
                                    simSpeed === speed
                                        ? 'bg-brand-600 text-white'
                                        : 'text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                                {speed}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-6 z-10">
                <div className="flex justify-between items-end gap-3 mb-4">
                    <div className="min-w-0">
                        <div className="text-3xl font-extrabold text-gray-900">
                            {onRoute ? `${arrivalText} 도착` : selectedRoute.arrivalTime || '—'}
                        </div>
                        <div className="text-gray-500 font-medium mt-1">
                            <span className="text-brand-600 font-bold">
                                {onRoute ? `${Math.max(1, Math.round(remainMin))}분` : selectedRoute.time || '—'}
                            </span>
                            {onRoute ? ' 남음 · ' : ' · '}
                            {onRoute ? formatDistance(remainM) : selectedRoute.distance || '—'}
                        </div>
                    </div>

                    <div className="flex-none bg-gray-100 px-3 py-1.5 rounded-lg text-sm font-bold text-gray-600">
                        {currentMode} 주행 중
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => finish(false)}
                    className="w-full bg-red-500 text-white py-4 rounded-xl font-bold text-lg shadow-md active:bg-red-600 transition-colors"
                >
                    안내 종료
                </button>
            </div>
        </div>
    );
}
