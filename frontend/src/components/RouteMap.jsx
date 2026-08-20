import React, { useEffect, useRef, useState } from 'react';

import { loadKakaoMap } from '../utils/kakaoMap';
import { cumulative, haversine, pointAtDistance } from '../utils/geo';

const SELECTED_COLOR = '#4f46e5';   // 선택된 경로 (indigo-600)
const OTHER_COLOR = '#9ca3af';      // 나머지 경로 (gray-400)

// 진행방향 화살표를 선 안쪽에 옅게 깐다(네이버지도 방식).
// 간격은 **화면 픽셀 기준**으로 잡는다 — 미터로 고정하면 축소했을 때
// 화살표가 뭉개지고 확대하면 몇 개 안 남는다.
const ARROW_GAP_PX = 28;
const ARROW_MAX = 110;               // 오버레이가 많아지면 팬·줌이 눈에 띄게 무거워진다
const ARROW_EDGE_M = 40;            // 출발·도착 핀과 겹치지 않게 양 끝은 비운다

/** 지도의 현재 축척(m/px). level 산식 대신 실제 bounds 로 잰다. */
function metersPerPixel(kakao, map, container) {
    const width = container?.clientWidth || 0;
    if (!width) return 0;
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const spanM = haversine(
        { lng: sw.getLng(), lat: sw.getLat() },
        { lng: ne.getLng(), lat: sw.getLat() }
    );
    return spanM / width;
}

function arrowOverlay(kakao, position, heading) {
    const el = document.createElement('div');
    el.style.cssText = 'width:10px;height:10px;pointer-events:none;' +
        `transform:rotate(${heading}deg)`;
    // 위쪽(북)을 향하는 쐐기. pointAtDistance 의 heading 이 정북 기준이라
    // 그대로 회전시키면 진행방향을 가리킨다.
    el.innerHTML =
        '<svg viewBox="0 0 24 24" width="10" height="10">' +
        '<path d="M5 15 L12 8 L19 15" fill="none" stroke="#ffffff" ' +
        'stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" ' +
        'opacity="0.9"/></svg>';
    return new kakao.maps.CustomOverlay({
        position,
        content: el,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 11,          // 선(10) 위, 출발·도착 핀(20) 아래
        clickable: false,    // 경로 선 클릭을 가로채면 안 된다
    });
}

/**
 * 출발/도착 핀. 기본 카카오 마커는 둘이 똑같은 그림이라 어느 쪽이 출발인지
 * 알 수 없었다. 모양(핀)은 그대로 두고 **색으로만** 구분한다 — 글자를 넣으면
 * 축소했을 때 두 배지가 서로 겹쳐 지도를 가린다.
 */
function endpointOverlay(kakao, position, kind) {
    const color = kind === 'start' ? '#111827' : '#4f46e5';   // 출발=먹, 도착=인디고
    const el = document.createElement('div');
    el.style.cssText = 'width:26px;height:36px;pointer-events:none';
    el.innerHTML =
        '<svg viewBox="0 0 26 36" width="26" height="36">' +
        `<path d="M13 35.5C13 35.5 24.5 21.5 24.5 13A11.5 11.5 0 1 0 1.5 13` +
        `C1.5 21.5 13 35.5 13 35.5Z" fill="${color}" stroke="#ffffff" ` +
        'stroke-width="2" stroke-linejoin="round"/>' +
        '<circle cx="13" cy="13" r="4.4" fill="#ffffff"/>' +
        '</svg>';
    return new kakao.maps.CustomOverlay({
        position,
        content: el,
        xAnchor: 0.5,
        yAnchor: 1,          // 핀 끝(뾰족한 아래)이 실제 지점에 닿도록
        zIndex: 20,
        clickable: false,
    });
}

/**
 * 추천 경로들을 지도에 그린다. 선택된 경로는 진하게, 나머지는 흐리게.
 *
 * @param {Array}  routes     [{ routeId, path:[{lng,lat}], ... }]
 * @param {number} selectedId 선택된 경로의 인덱스
 * @param {func}   onSelect   경로 선을 클릭했을 때
 * @param {object} padding    화면을 경로에 맞출 때 비워 둘 여백(px).
 *                            지도 위에 떠 있는 UI(상단 카드·하단 경로목록) 높이를
 *                            넣어 준다. 안 주면 지도는 컨테이너 전체에 맞추는데,
 *                            실제로는 위아래가 가려져 출발·도착점이 UI 뒤로 숨는다.
 */
export default function RouteMap({
    routes = [],
    selectedId = 0,
    onSelect,
    padding = { top: 40, right: 40, bottom: 40, left: 40 },
}) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const polylinesRef = useRef([]);
    const markersRef = useRef([]);
    const arrowsRef = useRef([]);
    const [errorMessage, setErrorMessage] = useState('');
    // 지도는 비동기로 만들어지므로, 준비된 뒤에 경로를 그려야 한다.
    const [isMapReady, setIsMapReady] = useState(false);

    // 지도 생성 (한 번만)
    useEffect(() => {
        let isActive = true;

        loadKakaoMap()
            .then((kakao) => {
                if (!isActive || !containerRef.current || mapRef.current) return;
                mapRef.current = new kakao.maps.Map(containerRef.current, {
                    center: new kakao.maps.LatLng(37.5665, 126.978),  // 임시 중심(서울)
                    level: 7
                });
                setIsMapReady(true);
            })
            .catch((error) => {
                if (isActive) setErrorMessage(error.message);
            });

        return () => {
            isActive = false;
        };
    }, []);

    // 경로가 바뀌면 다시 그리고 화면을 경로에 맞춘다
    useEffect(() => {
        const kakao = window.kakao;
        const map = mapRef.current;
        if (!isMapReady || !kakao?.maps || !map || routes.length === 0) return;

        polylinesRef.current.forEach((line) => line.setMap(null));
        markersRef.current.forEach((marker) => marker.setMap(null));
        polylinesRef.current = [];
        markersRef.current = [];

        const bounds = new kakao.maps.LatLngBounds();

        // 선택된 경로를 마지막에 그려 위로 올린다
        const drawOrder = routes
            .map((route, index) => ({ route, index }))
            .sort((a, b) => (a.index === selectedId ? 1 : b.index === selectedId ? -1 : 0));

        drawOrder.forEach(({ route, index }) => {
            const path = (route.path || []).map((point) => {
                const latLng = new kakao.maps.LatLng(point.lat, point.lng);
                bounds.extend(latLng);
                return latLng;
            });
            if (path.length < 2) return;

            const isSelected = index === selectedId;
            const polyline = new kakao.maps.Polyline({
                path,
                strokeWeight: isSelected ? 7 : 4,
                strokeColor: isSelected ? SELECTED_COLOR : OTHER_COLOR,
                strokeOpacity: isSelected ? 0.95 : 0.5,
                strokeStyle: 'solid',
                zIndex: isSelected ? 10 : 1
            });
            polyline.setMap(map);
            polylinesRef.current.push(polyline);

            if (onSelect) {
                kakao.maps.event.addListener(polyline, 'click', () => onSelect(index));
            }

            // 선택된 경로에만 출발·도착 표시. 기본 마커는 둘이 같은 그림이라
            // 어느 쪽이 출발인지 알 수 없었다.
            if (isSelected) {
                [['start', path[0]], ['end', path[path.length - 1]]].forEach(
                    ([kind, position]) => {
                        const overlay = endpointOverlay(kakao, position, kind);
                        overlay.setMap(map);
                        markersRef.current.push(overlay);
                    }
                );
            }
        });

        if (!bounds.isEmpty()) {
            map.setBounds(bounds, padding.top, padding.right, padding.bottom, padding.left);
        }
    }, [isMapReady, routes, selectedId, onSelect, padding]);

    /*
        진행방향 화살표 — 선택된 경로 위에만.

        축척이 바뀌면 화면상 간격이 달라지므로 'idle'(팬·줌이 멈춘 뒤)마다
        다시 깐다. 매 프레임 다시 만들면 팬이 끊긴다.
    */
    useEffect(() => {
        const kakao = window.kakao;
        const map = mapRef.current;
        if (!isMapReady || !kakao?.maps || !map) return undefined;

        const selected = routes[selectedId];
        const path = selected?.path || [];

        const clear = () => {
            arrowsRef.current.forEach((a) => a.setMap(null));
            arrowsRef.current = [];
        };

        const draw = () => {
            clear();
            if (path.length < 2) return;

            const mpp = metersPerPixel(kakao, map, containerRef.current);
            if (!mpp) return;

            const cum = cumulative(path);
            const total = cum[cum.length - 1];
            const usable = total - ARROW_EDGE_M * 2;
            if (usable <= 0) return;

            let gap = ARROW_GAP_PX * mpp;
            if (usable / gap > ARROW_MAX) gap = usable / ARROW_MAX;

            for (let d = ARROW_EDGE_M; d <= total - ARROW_EDGE_M; d += gap) {
                const at = pointAtDistance(path, cum, d);
                const overlay = arrowOverlay(
                    kakao,
                    new kakao.maps.LatLng(at.lat, at.lng),
                    at.heading
                );
                overlay.setMap(map);
                arrowsRef.current.push(overlay);
            }
        };

        draw();
        kakao.maps.event.addListener(map, 'idle', draw);
        return () => {
            kakao.maps.event.removeListener(map, 'idle', draw);
            clear();
        };
    }, [isMapReady, routes, selectedId]);

    if (errorMessage) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200 px-6 text-center">
                <span className="text-4xl mb-3">🗺️</span>
                <p className="text-gray-600 font-bold mb-1">지도를 표시할 수 없습니다</p>
                <p className="text-xs text-gray-500">{errorMessage}</p>
            </div>
        );
    }

    return <div ref={containerRef} className="w-full h-full" />;
}
