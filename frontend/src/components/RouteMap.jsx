import React, { useEffect, useRef, useState } from 'react';

import { loadKakaoMap } from '../utils/kakaoMap';

const SELECTED_COLOR = '#4f46e5';   // 선택된 경로 (indigo-600)
const OTHER_COLOR = '#9ca3af';      // 나머지 경로 (gray-400)

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
                strokeWeight: isSelected ? 6 : 4,
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

            // 선택된 경로에만 출발·도착 표시
            if (isSelected) {
                [path[0], path[path.length - 1]].forEach((position) => {
                    const marker = new kakao.maps.Marker({ position });
                    marker.setMap(map);
                    markersRef.current.push(marker);
                });
            }
        });

        if (!bounds.isEmpty()) {
            map.setBounds(bounds, padding.top, padding.right, padding.bottom, padding.left);
        }
    }, [isMapReady, routes, selectedId, onSelect, padding]);

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
