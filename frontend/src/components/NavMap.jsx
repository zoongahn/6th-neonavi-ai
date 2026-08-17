import React, { useEffect, useRef, useState } from 'react';

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

const ROUTE_COLOR = '#4f46e5';   // indigo-600
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
    const wasFollowingRef = useRef(false);
    const followBreakRef = useRef(onFollowBreak);
    followBreakRef.current = onFollowBreak;

    const [isReady, setIsReady] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

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
                setIsReady(true);
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
            // 과녁형 현위치 표시. 회전대칭이라 지도가 돌아도 모양이 안 변한다.
            markerRef.current = new Tmapv3.Marker({
                position: here,
                iconHTML:
                    '<div style="position:relative;width:24px;height:24px">' +
                    '<span style="position:absolute;inset:0;border-radius:9999px;' +
                    'background:rgba(99,102,241,0.25)"></span>' +
                    '<span style="position:absolute;inset:5px;border-radius:9999px;' +
                    'background:#4f46e5;border:2px solid #fff;' +
                    'box-shadow:0 1px 3px rgba(0,0,0,0.3)"></span></div>',
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
    }, [isReady, position, heading, follow]);

    if (errorMessage) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200 px-6 text-center">
                <span className="text-4xl mb-3">🗺️</span>
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
