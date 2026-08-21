import { cumulative, haversine, pointAtDistance, snapToPath, formatDistance } from './geo';

// 서울 위도에서 경도 0.001° ≈ 88m, 위도 0.001° ≈ 111m
const SEOUL_LAT = 37.5;

/** 위도만 북쪽으로 늘어나는 직선 경로 */
const line = (n, step = 0.001) =>
    Array.from({ length: n }, (_, i) => ({ lng: 127, lat: SEOUL_LAT + i * step }));

describe('haversine', () => {
    it('위도 1도는 약 111km', () => {
        const d = haversine({ lng: 127, lat: 37 }, { lng: 127, lat: 38 });
        expect(d).toBeGreaterThan(110000);
        expect(d).toBeLessThan(112000);
    });

    it('같은 점은 0', () => {
        expect(haversine({ lng: 127, lat: 37.5 }, { lng: 127, lat: 37.5 })).toBe(0);
    });
});

describe('cumulative', () => {
    it('단조증가하고 첫 값은 0', () => {
        const cum = cumulative(line(10));
        expect(cum[0]).toBe(0);
        for (let i = 1; i < cum.length; i += 1) {
            expect(cum[i]).toBeGreaterThan(cum[i - 1]);
        }
    });

    it('구간 길이의 합과 전체 길이가 같다', () => {
        const path = line(5);
        const cum = cumulative(path);
        let sum = 0;
        for (let i = 1; i < path.length; i += 1) sum += haversine(path[i - 1], path[i]);
        expect(cum[cum.length - 1]).toBeCloseTo(sum, 6);
    });
});

describe('snapToPath', () => {
    const path = line(20);
    const cum = cumulative(path);

    it('경로 위의 점은 이탈거리 0', () => {
        const hit = snapToPath(path, cum, path[5], 0);
        expect(hit.offsetM).toBeLessThan(0.5);
        expect(hit.distAlong).toBeCloseTo(cum[5], 1);
    });

    /*
        현위치 화살표가 쓰는 값이다. GPS 의 coords.heading 은 정지 상태에서
        null 이라 첫 측위 때 0(=정북)에 머물렀고, 그래서 안내를 켜면 화살표가
        경로 방향과 무관하게 북쪽을 가리켰다.
    */
    it('붙인 지점의 경로 진행방향을 함께 준다', () => {
        const hit = snapToPath(path, cum, path[5], 0);
        expect(hit.heading).toBeCloseTo(0, 0);        // 북쪽으로 뻗은 직선
    });

    it('동쪽으로 뻗은 경로면 진행방향이 90도', () => {
        const east = Array.from({ length: 10 }, (_, i) => ({
            lng: 127 + i * 0.001,
            lat: SEOUL_LAT
        }));
        const ecum = cumulative(east);
        const hit = snapToPath(east, ecum, east[3], 0);
        expect(hit.heading).toBeGreaterThan(88);
        expect(hit.heading).toBeLessThan(92);
    });

    it('정지해서 경로 옆에 있어도 진행방향은 경로를 따른다', () => {
        const off = { lng: 127.0005, lat: path[5].lat };
        const hit = snapToPath(path, cum, off, 0);
        expect(hit.heading).toBeCloseTo(0, 0);
    });

    /*
        도심 경로는 초반에 블록을 한 바퀴 도는 일이 흔하다(중앙분리대로 좌회전
        불가 등). 그러면 경로선이 출발지 근처를 두 번 지나가는데, 두 번째 통과가
        진짜 출발점보다 가까우면 거기 붙어 "그 구간을 이미 달렸다"가 된다.
        실측: 출발점 45m · 재통과 1.8m → distAlong 372m.
    */
    describe('출발지 근처를 두 번 지나는 경로', () => {
        // 동 → 남 → 서 로 한 바퀴 돈 뒤, 출발점 서쪽을 스치며 북상한다
        const loop = [];
        const put = (dx, dy) =>
            loop.push({ lng: 127 + dx * 0.0001, lat: SEOUL_LAT + dy * 0.0001 });
        for (let i = 0; i <= 8; i += 1) put(i, 0);
        for (let i = 1; i <= 8; i += 1) put(8, -i);
        for (let i = 7; i >= -1; i -= 1) put(i, -8);
        for (let i = -7; i <= 20; i += 1) put(-1, i);
        const lcum = cumulative(loop);
        // 출발점보다 재통과 구간에 훨씬 가까운 지점
        const me = { lng: 127 - 0.00008, lat: SEOUL_LAT + 0.0004 };

        it('기본(최근접)은 뒤쪽 통과 지점에 붙는다', () => {
            const hit = snapToPath(loop, lcum, me, 0);
            expect(hit.distAlong).toBeGreaterThan(300);
        });

        it('earliestWithin 을 주면 시작점에 붙는다', () => {
            const hit = snapToPath(loop, lcum, me, 0, 60, { earliestWithin: 150 });
            expect(hit.index).toBe(0);
            expect(hit.distAlong).toBeLessThan(5);
        });

        it('너무 멀면 earliestWithin 이어도 최근접으로 떨어진다', () => {
            const far = { lng: 127.05, lat: SEOUL_LAT };
            const hit = snapToPath(loop, lcum, far, 0, 60, { earliestWithin: 150 });
            expect(hit.offsetM).toBeGreaterThan(150);
        });
    });

    it('옆으로 벗어난 점은 수직거리를 이탈거리로 준다', () => {
        // 경도 +0.001 ≈ 88m 동쪽
        const off = { lng: 127.001, lat: path[5].lat };
        const hit = snapToPath(path, cum, off, 0);
        expect(hit.offsetM).toBeGreaterThan(80);
        expect(hit.offsetM).toBeLessThan(95);
        expect(hit.distAlong).toBeCloseTo(cum[5], 0);   // 진행거리는 그대로
    });

    it('되돌아오는 경로에서 힌트 주변에 붙는다', () => {
        /*
            이게 이 함수를 직접 짠 이유다. 경로가 유턴해서 자기 자신 옆으로
            돌아오면(지하차도·나들목), 전 구간에서 최근접점을 찾으면 한참 뒤
            구간에 붙어 "남은거리가 갑자기 늘어나는" 현상이 생긴다.
        */
        const up = line(10);                                   // 북상
        const down = line(10)
            .reverse()
            .map((p) => ({ lng: p.lng + 0.00005, lat: p.lat })); // 5m 옆으로 남하
        const uturn = [...up, ...down];
        const ucum = cumulative(uturn);

        const target = uturn[15];   // 남하 구간의 한 점
        const hit = snapToPath(uturn, ucum, target, 15);
        expect(hit.index).toBeGreaterThanOrEqual(10);   // 북상 구간에 붙으면 실패
        expect(hit.distAlong).toBeCloseTo(ucum[15], 0);
    });
});

describe('pointAtDistance', () => {
    const path = line(20);
    const cum = cumulative(path);

    it('0이면 출발점, 전체길이면 도착점', () => {
        expect(pointAtDistance(path, cum, 0).lat).toBeCloseTo(path[0].lat, 9);
        const end = pointAtDistance(path, cum, cum[cum.length - 1]);
        expect(end.lat).toBeCloseTo(path[path.length - 1].lat, 9);
    });

    it('범위를 넘겨도 끝점에서 멈춘다', () => {
        const over = pointAtDistance(path, cum, cum[cum.length - 1] * 10);
        expect(over.lat).toBeCloseTo(path[path.length - 1].lat, 9);
    });

    it('snapToPath 와 왕복이 맞는다', () => {
        [100, 500, 1234].forEach((dist) => {
            const at = pointAtDistance(path, cum, dist);
            const back = snapToPath(path, cum, at, at.index);
            expect(back.distAlong).toBeCloseTo(dist, 0);
            expect(back.offsetM).toBeLessThan(0.5);
        });
    });

    it('북상 경로의 방위는 0도(정북) 근처', () => {
        expect(pointAtDistance(path, cum, 500).heading).toBeCloseTo(0, 1);
    });
});

describe('formatDistance', () => {
    it('1km 미만은 10m 단위 m, 이상은 km', () => {
        expect(formatDistance(324)).toBe('320m');
        expect(formatDistance(1240)).toBe('1.2km');
        expect(formatDistance(-1)).toBe('—');
    });
});
