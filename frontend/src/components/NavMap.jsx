import React, { useEffect, useRef, useState } from 'react';

import { loadKakaoMap } from '../utils/kakaoMap';

/*
    주행 화면 전용 지도.

    RouteMap 을 재사용하지 않는다. S4 는 "후보 여러 개를 한눈에"(bounds 로 전체를
    담는다)가 목적이고, 여기는 "경로 하나를 따라가는 카메라"(현위치 고정·확대 유지·
    진행방향 정렬)라 요구가 정반대다. 억지로 한 컴포넌트에 담으면 양쪽 다 나빠진다.

    ⚠️ 지도 회전: 카카오 웹 SDK(v3)에는 **회전 API가 없다**(setBearing 류가 없음).
       그래서 지도 컨테이너 자체를 CSS transform 으로 돌린다. 대가가 둘 있다.
       ① 지명 라벨도 같이 돌아간다(거꾸로 읽히는 글자가 생긴다).
       ② 돌린 뒤 네 귀퉁이가 비지 않으려면 컨테이너가 화면 대각선만큼 커야 한다.
       현위치 마커를 회전대칭(과녁)으로 둔 건 그래야 역보정이 필요 없어서다.
*/

const ROUTE_COLOR = '#4f46e5';   // indigo-600
const FOLLOW_LEVEL = 4;          // 주행 중 확대 수준

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
    const outerRef = useRef(null);
    const containerRef = useRef(null);
    const rotateRef = useRef(null);
    const mapRef = useRef(null);
    const lineRef = useRef(null);
    const markerRef = useRef(null);
    // 카메라가 옮긴 중심까지 "사용자가 움직였다"로 세면 추적이 즉시 풀린다
    const selfMoveRef = useRef(false);
    const wasFollowingRef = useRef(false);
    // 359° → 1° 를 -358° 로 읽으면 지도가 한 바퀴 역회전한다. 누적각으로 들고 간다.
    const turnRef = useRef(0);

    const [side, setSide] = useState(0);   // 회전해도 안 비도록 = 화면 대각선
    const [isReady, setIsReady] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // 바깥 크기를 재서 회전용 정사각형 한 변을 정한다
    useEffect(() => {
        const outer = outerRef.current;
        if (!outer) return undefined;

        const measure = () => {
            const { width, height } = outer.getBoundingClientRect();
            setSide(Math.ceil(Math.hypot(width, height)));
        };
        measure();

        const observer = new ResizeObserver(measure);
        observer.observe(outer);
        return () => observer.disconnect();
    }, []);

    // 지도 생성 — 컨테이너 크기가 정해진 뒤에 만든다(카카오는 생성 시점 크기를 읽는다)
    useEffect(() => {
        if (!side) return undefined;
        let isActive = true;

        loadKakaoMap()
            .then((kakao) => {
                if (!isActive || !containerRef.current) return;
                if (mapRef.current) {
                    mapRef.current.relayout();
                    return;
                }
                const map = new kakao.maps.Map(containerRef.current, {
                    center: new kakao.maps.LatLng(37.5665, 126.978),
                    level: FOLLOW_LEVEL,
                    draggable: true,
                });
                mapRef.current = map;

                kakao.maps.event.addListener(map, 'dragstart', () => {
                    if (!selfMoveRef.current && onFollowBreak) onFollowBreak();
                });

                setIsReady(true);
            })
            .catch((error) => {
                if (isActive) setErrorMessage(error.message);
            });

        return () => {
            isActive = false;
        };
        // onFollowBreak 가 매 렌더 새로 만들어져도 지도를 다시 만들면 안 된다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [side]);

    // 경로 폴리라인 (경로가 바뀔 때만)
    useEffect(() => {
        const kakao = window.kakao;
        const map = mapRef.current;
        if (!isReady || !kakao?.maps || !map || path.length < 2) return undefined;

        if (lineRef.current) lineRef.current.setMap(null);

        const toLatLng = (p) => new kakao.maps.LatLng(p.lat, p.lng);
        lineRef.current = new kakao.maps.Polyline({
            path: path.map(toLatLng),
            strokeWeight: 7,
            strokeColor: ROUTE_COLOR,
            strokeOpacity: 0.9,
            zIndex: 2,
        });
        lineRef.current.setMap(map);

        // 첫 진입은 경로 전체를 보여 주고, 첫 위치가 오면 추적으로 넘어간다
        const bounds = new kakao.maps.LatLngBounds();
        path.forEach((p) => bounds.extend(toLatLng(p)));
        if (!bounds.isEmpty()) {
            selfMoveRef.current = true;
            map.setBounds(bounds, 60, 60, 60, 60);
            selfMoveRef.current = false;
        }

        return () => {
            if (lineRef.current) lineRef.current.setMap(null);
        };
    }, [isReady, path]);

    // 현위치 마커 · 카메라 · 회전
    useEffect(() => {
        const kakao = window.kakao;
        const map = mapRef.current;
        if (!isReady || !kakao?.maps || !map || !position) return;

        const here = new kakao.maps.LatLng(position.lat, position.lng);

        if (!markerRef.current) {
            // 과녁형 현위치 표시. 진행방향은 지도를 돌려서 나타내므로 마커 자체는
            // 방향을 갖지 않는다(회전대칭이라 지도가 돌아도 역보정이 필요 없다).
            const el = document.createElement('div');
            el.className = 'relative w-6 h-6';
            el.innerHTML =
                '<span class="absolute inset-0 rounded-full bg-indigo-500/25"></span>' +
                '<span class="absolute inset-[5px] rounded-full bg-indigo-600 ' +
                'border-2 border-white shadow-md"></span>';

            markerRef.current = new kakao.maps.CustomOverlay({
                position: here,
                content: el,
                zIndex: 10,
                yAnchor: 0.5,
                xAnchor: 0.5,
            });
            markerRef.current.setMap(map);
        } else {
            markerRef.current.setPosition(here);
        }

        if (follow) {
            selfMoveRef.current = true;
            // 추적을 시작하는 순간에만 확대한다. 매번 setLevel 하면 주행 중
            // 사용자가 축소해서 앞을 보려 해도 바로 되돌아가 버린다.
            if (!wasFollowingRef.current) {
                map.setLevel(FOLLOW_LEVEL);
                wasFollowingRef.current = true;
                turnRef.current = heading;
            }
            map.setCenter(here);   // 프레임마다 오므로 panTo(애니메이션)는 밀린다
            selfMoveRef.current = false;

            // 진행방향이 화면 위를 향하도록 지도를 반대로 돌린다.
            // 최단 회전으로 이어 붙여야 356°→2° 에서 거꾸로 한 바퀴 돌지 않는다.
            const delta = (((heading - turnRef.current) % 360) + 540) % 360 - 180;
            turnRef.current += delta;
            if (rotateRef.current) {
                rotateRef.current.style.transform =
                    `translate(-50%, -50%) rotate(${-turnRef.current}deg)`;
            }
        } else {
            wasFollowingRef.current = false;
            if (rotateRef.current) {
                rotateRef.current.style.transform = 'translate(-50%, -50%) rotate(0deg)';
            }
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
        <div ref={outerRef} className="w-full h-full overflow-hidden relative bg-gray-200">
            <div
                ref={rotateRef}
                className="absolute left-1/2 top-1/2"
                style={{
                    width: side || '100%',
                    height: side || '100%',
                    transform: 'translate(-50%, -50%)',
                    // 20fps 로 들어오는 방위를 그대로 찍으면 톡톡 튄다
                    transition: 'transform 220ms linear',
                }}
            >
                <div ref={containerRef} className="w-full h-full" />
            </div>
        </div>
    );
}
