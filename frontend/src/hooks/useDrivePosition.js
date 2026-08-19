import { useEffect, useRef, useState } from 'react';

import { bearing, cumulative, pointAtDistance } from '../utils/geo';

/*
    주행 중 "지금 위치"를 내놓는다. 구현이 둘인데 **같은 값을 뱉는다**.
    화면은 어느 쪽인지 몰라도 되고, 보간·부드러움 처리도 한 군데서 끝난다.

      gps  실제 GPS (navigator.geolocation.watchPosition)
      sim  경로 폴리라인 위를 일정 속도로 달리는 모의 주행

    ⚠️ sim 은 개발 편의 기능이 아니라 **데모의 본선**이다.
       발표는 실내에서 하고 경로는 강남→판교다. 실제로 달릴 수가 없다.
       게다가 폰으로 보려고 http://192.168.x.x 로 접속하면 브라우저가
       Geolocation 을 아예 막는다(보안 오리진은 https 와 localhost 뿐).
       그래서 gps 가 실패하면 조용히 멈추는 대신 sim 으로 내려간다.
*/

const GPS_OPTIONS = {
    enableHighAccuracy: true,   // 주행용은 필수. 대신 배터리를 더 쓴다
    maximumAge: 1000,
    timeout: 10000,
};

const GPS_ERROR_TEXT = {
    1: '위치 권한이 거부되어 모의 주행으로 전환했습니다.',
    2: '위치를 확인할 수 없어 모의 주행으로 전환했습니다.',
    3: '위치 확인이 지연되어 모의 주행으로 전환했습니다.',
};

export default function useDrivePosition({
    source = 'gps',
    path = [],
    speedKmh = 60,
    active = true,
}) {
    const [position, setPosition] = useState(null);
    const [heading, setHeading] = useState(0);
    const [actualSpeedKmh, setActualSpeedKmh] = useState(0);
    const [effectiveSource, setEffectiveSource] = useState(source);
    const [notice, setNotice] = useState('');

    // 누적거리는 경로가 바뀔 때만 다시 만든다(경로당 수백 점)
    const cumRef = useRef(null);
    const pathRef = useRef(path);
    if (pathRef.current !== path) {
        pathRef.current = path;
        cumRef.current = path.length > 1 ? cumulative(path) : null;
    }
    if (cumRef.current === null && path.length > 1) {
        cumRef.current = cumulative(path);
    }

    // 요청한 소스가 바뀌면 폴백 상태를 초기화한다
    useEffect(() => {
        setEffectiveSource(source);
        setNotice('');
    }, [source]);

    // ── 실제 GPS ────────────────────────────────────────────────
    useEffect(() => {
        if (!active || effectiveSource !== 'gps') return undefined;

        if (!navigator.geolocation || !window.isSecureContext) {
            setEffectiveSource('sim');
            setNotice('보안 연결(HTTPS)이 아니라 모의 주행으로 전환했습니다.');
            return undefined;
        }

        let lastPoint = null;
        const watchId = navigator.geolocation.watchPosition(
            ({ coords }) => {
                const next = { lng: coords.longitude, lat: coords.latitude };
                setPosition(next);
                setActualSpeedKmh(
                    Number.isFinite(coords.speed) && coords.speed >= 0
                        ? coords.speed * 3.6
                        : 0
                );
                // heading 은 정지 상태에서 null 로 온다 → 직전 점과의 방위로 대체
                if (Number.isFinite(coords.heading)) setHeading(coords.heading);
                else if (lastPoint) setHeading(bearing(lastPoint, next));
                lastPoint = next;
            },
            (error) => {
                setEffectiveSource('sim');
                setNotice(GPS_ERROR_TEXT[error.code] || '위치를 받을 수 없어 모의 주행으로 전환했습니다.');
            },
            GPS_OPTIONS
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [active, effectiveSource]);

    // ── 모의 주행 ──────────────────────────────────────────────
    // 프레임마다 전진시키므로 원시 GPS(1~수 초 간격)보다 오히려 부드럽다.
    const distanceRef = useRef(0);
    useEffect(() => {
        if (!active || effectiveSource !== 'sim') return undefined;
        const cum = cumRef.current;
        const drivePath = pathRef.current;
        if (!cum || drivePath.length < 2) return undefined;

        let frameId = 0;
        let lastTime = performance.now();
        let lastCommit = 0;
        const total = cum[cum.length - 1];

        const tick = (now) => {
            const dt = Math.min((now - lastTime) / 1000, 0.5);   // 탭 복귀 시 순간이동 방지
            lastTime = now;
            distanceRef.current = Math.min(total, distanceRef.current + (speedKmh / 3.6) * dt);

            // 위치는 프레임마다 누적하되 화면 갱신은 ~20fps 로 줄인다.
            // 60fps 로 setState 하면 지도·안내카드까지 초당 60번 다시 그린다.
            // 마커에 CSS transition 을 걸어 뒀으니 눈에는 그대로 부드럽다.
            const done = distanceRef.current >= total;
            if (now - lastCommit >= 50 || done) {
                lastCommit = now;
                const at = pointAtDistance(drivePath, cum, distanceRef.current);
                setPosition({ lng: at.lng, lat: at.lat });
                setHeading(at.heading);
                setActualSpeedKmh(speedKmh);
            }

            if (!done) frameId = requestAnimationFrame(tick);
        };

        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [active, effectiveSource, speedKmh]);

    // 경로가 바뀌면(모드 전환 재탐색) 출발점부터 다시
    useEffect(() => {
        distanceRef.current = 0;
    }, [path]);

    return { position, heading, speedKmh: actualSpeedKmh, effectiveSource, notice };
}
