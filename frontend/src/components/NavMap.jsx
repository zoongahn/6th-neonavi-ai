import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BRAND } from '../theme';
import Icon from './Icon';

import { loadTmap } from '../utils/tmapMap';

/*
    주행 화면 전용 지도 — TMAP 벡터(Tmapv3).

    S5 만 카카오가 아니라 TMAP 을 쓴다. 카카오 웹 SDK(v3)는 래스터 타일이라
    회전 API 가 없고, 컨테이너를 CSS 로 돌리면 지명 라벨까지 같이 돌아가
    글자가 거꾸로 읽혔다. TMAP JS SDK v3 는 국내 서비스 중 유일하게 웹에서
    벡터 렌더링(WebGL)을 제공해서, setBearing 으로 지도를 돌려도 라벨은
    매 프레임 화면 기준으로 다시 그려져 항상 서 있다.

    S4(후보 비교)는 계속 카카오다. 경로선 좌표는 어느 쪽이든 WGS84 라 호환.

    RouteMap 을 재사용하지 않는 이유는 이전과 같다: S4 는 "후보 여러 개를
    한눈에", 여기는 "경로 하나를 따라가는 카메라"라 요구가 정반대다.
*/

const ROUTE_COLOR = BRAND[600];
const FOLLOW_ZOOM = 17;          // 주행 중 확대 수준 (웹 메르카토르 줌)
const DRAG_PX = 8;               // 이보다 크게 끌면 "사용자가 지도를 움직였다"

/**
 * @param {Array}  path          [{lng,lat}] 주행 중인 경로
 * @param {object} position      {lng,lat} 현위치 (경로에 붙인 좌표)
 * @param {number} heading       진행 방위(도, 정북 기준)
 * @param {boolean} follow       카메라가 현위치를 따라가며 진행방향으로 정렬할지
 * @param {func}   onFollowBreak 사용자가 지도를 직접 움직였을 때
 */
export default function NavMap({
    path = [],
    position = null,
    heading = 0,
    follow = true,
    onFollowBreak,
}) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const lineRef = useRef(null);
    const markerRef = useRef(null);
    // SDK 가 iconHTML 을 복제해 붙이므로, 렌더된 요소들은 DOM 에서 찾아 쥔다
    const arrowElRef = useRef(null);
    const cursorElRef = useRef(null);
    // 359°→1° 를 -358° 로 돌지 않도록 누적각으로 이어 붙인다
    const arrowTurnRef = useRef(0);
    const wasFollowingRef = useRef(false);
    const followBreakRef = useRef(onFollowBreak);
    followBreakRef.current = onFollowBreak;
    const headingRef = useRef(heading);
    headingRef.current = heading;

    const [isReady, setIsReady] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    /*
        커서(원판+화살표)를 지도 시점에 맞춘다.
          화살표  rotate(진행방위 − 지도 bearing) → 지도가 어떻게 돌아도 실제 진행방향
          원판    rotateX(지도 pitch)             → 기울이면 바닥에 누운 것처럼 눌린다
        위치 갱신(20fps)에서만 계산하면 사용자가 지도를 돌리는 동안 화살표가
        늦게 계단식으로 따라와 떨려 보인다. 그래서 Rotate/Pitch 이벤트에도
        묶어서 프레임마다 부른다(그래서 CSS transition 도 걸지 않는다).
    */
    const syncCursor = useCallback(() => {
        const map = mapRef.current;
        if (!map) return;
        if (!arrowElRef.current || !arrowElRef.current.isConnected) {
            arrowElRef.current =
                containerRef.current?.querySelector('.nav-heading-arrow') || null;
            cursorElRef.current =
                containerRef.current?.querySelector('.nav-cursor') || null;
        }
        if (arrowElRef.current) {
            const mapBearing =
                typeof map.getBearing === 'function' ? map.getBearing() : 0;
            const target = headingRef.current - mapBearing;
            const delta =
                (((target - arrowTurnRef.current) % 360) + 540) % 360 - 180;
            arrowTurnRef.current += delta;
            arrowElRef.current.style.transform =
                `rotate(${arrowTurnRef.current}deg)`;
        }
        if (cursorElRef.current) {
            const pitch =
                typeof map.getPitch === 'function' ? map.getPitch() : 0;
            cursorElRef.current.style.transform = `rotateX(${pitch}deg)`;
        }
    }, []);

    // 지도 생성
    useEffect(() => {
        let isActive = true;

        loadTmap()
            .then((Tmapv3) => {
                if (!isActive || !containerRef.current || mapRef.current) return;
                const map = new Tmapv3.Map(containerRef.current, {
                    center: new Tmapv3.LatLng(37.5665, 126.978),
                    width: '100%',
                    height: '100%',
                    zoom: FOLLOW_ZOOM,
                });
                mapRef.current = map;
                if (process.env.NODE_ENV !== 'production') {
                    window.__navMap = map;   // 개발용: 콘솔에서 피치·베어링 실험
                }
                // 벡터 지도는 스타일 로드가 끝나기 전에 폴리라인·마커를 얹으면
                // "No style loaded" 예외가 난다. ConfigLoad 후에만 그린다.
                map.on('ConfigLoad', () => {
                    if (isActive) setIsReady(true);
                });
            })
            .catch((error) => {
                if (isActive) setErrorMessage(error.message);
            });

        return () => {
            isActive = false;
            if (mapRef.current?.destroy) mapRef.current.destroy();
            mapRef.current = null;
        };
    }, []);

    // 지도를 돌리거나 기울이는 동안 커서가 프레임 단위로 따라오도록
    useEffect(() => {
        const map = mapRef.current;
        if (!isReady || !map) return undefined;
        map.on('Rotate', syncCursor);
        map.on('Pitch', syncCursor);
        return () => {
            if (typeof map.off === 'function') {
                map.off('Rotate', syncCursor);
                map.off('Pitch', syncCursor);
            }
        };
    }, [isReady, syncCursor]);

    // 추적 해제 감지 — SDK 이벤트 대신 DOM 포인터로 잡는다.
    // 프로그램이 카메라를 옮길 땐 포인터 이벤트가 없으므로 자기움직임 가드가
    // 필요 없고, SDK 이벤트 이름(버전별 상이)에도 의존하지 않는다.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return undefined;

        let start = null;
        const down = (e) => {
            start = { x: e.clientX, y: e.clientY };
        };
        const move = (e) => {
            if (!start) return;
            if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_PX) {
                start = null;
                if (followBreakRef.current) followBreakRef.current();
            }
        };
        const up = () => {
            start = null;
        };

        el.addEventListener('pointerdown', down);
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        return () => {
            el.removeEventListener('pointerdown', down);
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
        };
    }, []);

    // 경로 폴리라인 (경로가 바뀔 때만)
    useEffect(() => {
        const Tmapv3 = window.Tmapv3;
        const map = mapRef.current;
        if (!isReady || !Tmapv3 || !map || path.length < 2) return undefined;

        if (lineRef.current) lineRef.current.setMap(null);

        const pts = path.map((p) => new Tmapv3.LatLng(p.lat, p.lng));
        lineRef.current = new Tmapv3.Polyline({
            path: pts,
            strokeColor: ROUTE_COLOR,
            strokeWeight: 7,
            strokeOpacity: 0.9,
            map,
        });

        // 첫 진입은 경로 전체를 보여 주고, 첫 위치가 오면 추적으로 넘어간다
        let minLat = Infinity;
        let maxLat = -Infinity;
        let minLng = Infinity;
        let maxLng = -Infinity;
        path.forEach((p) => {
            minLat = Math.min(minLat, p.lat);
            maxLat = Math.max(maxLat, p.lat);
            minLng = Math.min(minLng, p.lng);
            maxLng = Math.max(maxLng, p.lng);
        });
        if (map.fitBounds && Tmapv3.LatLngBounds) {
            map.fitBounds(
                new Tmapv3.LatLngBounds(
                    new Tmapv3.LatLng(minLat, minLng),
                    new Tmapv3.LatLng(maxLat, maxLng)
                )
            );
        } else {
            map.setCenter(
                new Tmapv3.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2)
            );
        }

        return () => {
            if (lineRef.current) lineRef.current.setMap(null);
            lineRef.current = null;
        };
    }, [isReady, path]);

    // 현위치 마커 · 카메라 · 회전
    useEffect(() => {
        const Tmapv3 = window.Tmapv3;
        const map = mapRef.current;
        if (!isReady || !Tmapv3 || !map || !position) return;

        const here = new Tmapv3.LatLng(position.lat, position.lng);

        if (!markerRef.current) {
            // 주행 커서: 큰 원(흰 바탕 + 옅은 후광) 안의 방향 화살표.
            // 아래 effect 에서 두 축을 맞춘다 — 바닥에 붙은 것처럼 보이게.
            //   nav-cursor(전체)  : rotateX(지도 pitch)  → 기울이면 원이 눌린다
            //   nav-heading-arrow : rotate(진행방위 − 지도 bearing)
            // 추적 중엔 지도가 진행방향으로 돌아가 있어 화살표가 항상 위를 향하고,
            // 추적을 풀면 지도 위에서 실제 진행방위를 가리킨다.
            markerRef.current = new Tmapv3.Marker({
                position: here,
                iconHTML:
                    '<div class="nav-cursor" ' +
                    'style="position:relative;width:60px;height:60px">' +
                    '<span style="position:absolute;inset:0;border-radius:9999px;' +
                    'background:rgba(99,102,241,0.18)"></span>' +
                    '<span style="position:absolute;inset:6px;border-radius:9999px;' +
                    'background:#ffffff;box-shadow:0 1px 6px rgba(0,0,0,0.35)"></span>' +
                    '<svg class="nav-heading-arrow" viewBox="0 0 24 24" ' +
                    'style="position:absolute;inset:11px">' +
                    '<path d="M12 3 L19.5 20 L12 16 L4.5 20 Z" fill="' + BRAND[600] + '" ' +
                    'stroke="#4338ca" stroke-width="0.5" stroke-linejoin="round"/>' +
                    '</svg></div>',
                anchor: 'center',
                map,
            });
        } else {
            markerRef.current.setPosition(here);
        }

        if (follow) {
            // 추적을 시작하는 순간에만 확대한다. 매번 setZoom 하면 주행 중
            // 사용자가 축소해서 앞을 보려 해도 바로 되돌아가 버린다.
            if (!wasFollowingRef.current) {
                map.setZoom(FOLLOW_ZOOM);
                wasFollowingRef.current = true;
            }
            map.setCenter(here);
            // 진행방향이 화면 위를 향하도록. 벡터 지도라 라벨은 계속 서 있다.
            map.setBearing(heading);
        } else {
            wasFollowingRef.current = false;
        }

        // 방위·기울기 반영 (지도 조작 중엔 Rotate/Pitch 이벤트가 대신 부른다)
        syncCursor();
    }, [isReady, position, heading, follow, syncCursor]);

    if (errorMessage) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200 px-6 text-center">
                <span className="mb-3 text-gray-400"><Icon name="map" size={40} /></span>
                <p className="text-gray-600 font-bold mb-1">지도를 표시할 수 없습니다</p>
                <p className="text-xs text-gray-500">{errorMessage}</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-hidden relative bg-gray-200">
            <div ref={containerRef} className="w-full h-full" />
        </div>
    );
}
