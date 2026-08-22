// 폴리라인 위에서 "지금 어디쯤인가"를 계산하는 최소 도구.
//
// @turf/* 를 쓰면 되지만 우리가 필요한 건 아래 셋뿐이라 직접 둔다
// (거리 · 선상 투영 · 선상 한 점) — 의존성·번들을 늘릴 값어치가 없다.
//
// 좌표는 전부 {lng, lat}. 거리 단위는 m.
// 서울~판교 규모(수십 km)에서는 위경도를 국소 평면으로 근사해도 오차가 무시할 수준이라,
// 투영 계산은 등거리원통 근사로 한다(하버사인은 점 간 거리에만 쓴다).

const EARTH_RADIUS_M = 6371000;
const DEG = Math.PI / 180;

export function haversine(a, b) {
    const lat1 = a.lat * DEG;
    const lat2 = b.lat * DEG;
    const dLat = lat2 - lat1;
    const dLng = (b.lng - a.lng) * DEG;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 각 정점까지의 누적거리(m). 길이는 path 와 같고 [0] 은 0. */
export function cumulative(path) {
    const out = new Float64Array(path.length);
    for (let i = 1; i < path.length; i += 1) {
        out[i] = out[i - 1] + haversine(path[i - 1], path[i]);
    }
    return out;
}

/** 정북 기준 방위각(도, 0~360). 지도 회전·마커 방향에 쓴다. */
export function bearing(a, b) {
    const lat1 = a.lat * DEG;
    const lat2 = b.lat * DEG;
    const dLng = (b.lng - a.lng) * DEG;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** 위경도를 기준 위도에서의 국소 미터 평면으로. */
function toMeters(point, refLat) {
    const k = Math.cos(refLat * DEG);
    return { x: point.lng * DEG * EARTH_RADIUS_M * k, y: point.lat * DEG * EARTH_RADIUS_M };
}

/**
 * 현위치를 경로선 위로 붙인다(맵매칭 lite).
 *
 * ⚠️ 전 구간을 훑으면 경로가 자기 자신에게 가까워지는 곳(지하차도·나들목·유턴)에서
 * 한참 뒤/앞 구간에 붙어버린다. 그래서 직전 위치(fromIndex) 주변만 본다.
 * 그 창에서 너무 멀면(=이탈 의심) 그때만 전 구간을 훑는다.
 *
 * ⚠️ **'가장 가까움'은 '가장 이름'이 아니다.** 도심 경로는 초반에 블록을 한 바퀴
 * 도는 일이 흔하다(중앙분리대로 좌회전 불가, 단지에서 큰길로 나가기 등).
 * 그러면 경로선이 출발지 근처를 두 번 지나가는데, 두 번째 통과 지점이 진짜
 * 출발점보다 몇 m 가깝기만 해도 거기 붙어 **"블록 도는 구간을 이미 달렸다"**가
 * 된다(실측: 출발점 45m·재통과 1.8m → distAlong 372m). 그래서 아직 출발 전이면
 * earliestWithin 을 줘서 **붙을 수 있는 가장 이른 지점**을 쓰게 한다.
 *
 * @param {number} opts.earliestWithin 이 거리(m) 안이면 뒤쪽 후보가 더 가까워도
 *        먼저 만나는 구간에 붙인다. 0 이면 종전대로 최근접.
 * @returns {{index:number, distAlong:number, offsetM:number, lng:number,
 *           lat:number, heading:number}}
 *          index=붙은 구간의 시작 정점, distAlong=출발점부터의 선상 거리,
 *          offsetM=경로에서 벗어난 직선거리, heading=그 지점의 경로 진행방위
 */
export function snapToPath(path, cum, point, fromIndex = 0, window = 60,
                           { earliestWithin = 0 } = {}) {
    if (path.length < 2) {
        return {
            index: 0, distAlong: 0, offsetM: 0,
            lng: point.lng, lat: point.lat, heading: 0,
        };
    }

    const search = (lo, hi) => {
        let best = null;
        for (let i = lo; i < hi; i += 1) {
            const hit = projectOnSegment(path[i], path[i + 1], point);
            if (!best || hit.offsetM < best.offsetM) {
                best = { ...hit, index: i, distAlong: cum[i] + hit.alongM };
            }
        }
        return best;
    };

    // 출발 전: 붙을 수 있는 **가장 이른** 구간을 쓴다. 진행거리는 0에서 시작해야
    // 하므로, 뒤쪽 후보가 더 가깝다는 이유로 앞구간을 건너뛰면 안 된다.
    if (earliestWithin > 0) {
        for (let i = 0; i < path.length - 1; i += 1) {
            const hit = projectOnSegment(path[i], path[i + 1], point);
            if (hit.offsetM <= earliestWithin) {
                return {
                    ...hit,
                    index: i,
                    distAlong: cum[i] + hit.alongM,
                    heading: bearing(path[i], path[i + 1]),
                };
            }
        }
        // 어느 구간에도 못 붙으면(=많이 떨어져 있음) 아래 최근접으로 넘어간다.
        // 그 경우 화면은 '출발 대기'라 진행거리를 어차피 0 으로 둔다.
    }

    const lo = Math.max(0, fromIndex - 5);
    const hi = Math.min(path.length - 1, fromIndex + window);
    let best = search(lo, hi);

    // 창 안에서 100m 넘게 벗어났으면 창을 잘못 잡았을 수 있다 → 전역 재탐색
    if (!best || best.offsetM > 100) {
        const global = search(0, path.length - 1);
        if (global && (!best || global.offsetM < best.offsetM)) best = global;
    }
    /*
        붙인 지점에서의 **경로 진행방향**. 화면의 현위치 화살표는 이걸 써야 한다.
        GPS 의 coords.heading 은 정지 상태에서 null 이고(첫 측위엔 직전 점도 없다),
        그 대체값으로 직전 점과의 방위를 쓰면 서 있을 때 신호 흔들림만큼
        화살표가 제멋대로 돈다. 마커는 어차피 경로 위에 붙여 그리므로
        방향도 경로를 따르는 것이 맞다(실제 내비도 신호대기 중 도로를 가리킨다).
    */
    best.heading = bearing(path[best.index], path[best.index + 1]);
    return best;
}

/** 선분 a→b 에 점 p 를 투영. alongM = a 로부터의 거리, offsetM = 수직 이탈거리. */
function projectOnSegment(a, b, p) {
    const refLat = a.lat;
    const A = toMeters(a, refLat);
    const B = toMeters(b, refLat);
    const P = toMeters(p, refLat);

    const vx = B.x - A.x;
    const vy = B.y - A.y;
    const len2 = vx * vx + vy * vy;

    // 길이 0 선분(중복 정점)은 나눗셈이 터진다
    let t = len2 === 0 ? 0 : ((P.x - A.x) * vx + (P.y - A.y) * vy) / len2;
    t = Math.max(0, Math.min(1, t));

    const cx = A.x + vx * t;
    const cy = A.y + vy * t;
    const alongM = Math.hypot(cx - A.x, cy - A.y);
    const offsetM = Math.hypot(P.x - cx, P.y - cy);

    return {
        alongM,
        offsetM,
        lng: a.lng + (b.lng - a.lng) * t,
        lat: a.lat + (b.lat - a.lat) * t,
    };
}

/**
 * 출발점에서 선상 거리 dist 만큼 간 지점. 모의 주행이 이걸로 전진한다.
 * @returns {{lng:number, lat:number, index:number, heading:number}}
 */
export function pointAtDistance(path, cum, dist) {
    const last = path.length - 1;
    if (path.length === 0) return { lng: 0, lat: 0, index: 0, heading: 0 };
    if (dist <= 0) {
        return { ...path[0], index: 0, heading: path.length > 1 ? bearing(path[0], path[1]) : 0 };
    }
    const total = cum[last];
    if (dist >= total) {
        return {
            ...path[last],
            index: last,
            heading: path.length > 1 ? bearing(path[last - 1], path[last]) : 0,
        };
    }

    // 누적거리는 단조증가 → 이분탐색
    let lo = 0;
    let hi = last;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= dist) lo = mid;
        else hi = mid;
    }

    const segLen = cum[lo + 1] - cum[lo];
    const t = segLen === 0 ? 0 : (dist - cum[lo]) / segLen;
    return {
        lng: path[lo].lng + (path[lo + 1].lng - path[lo].lng) * t,
        lat: path[lo].lat + (path[lo + 1].lat - path[lo].lat) * t,
        index: lo,
        heading: bearing(path[lo], path[lo + 1]),
    };
}

/** 소요시간(분) → "45분" / "4시간 34분" / "2시간". 장거리(부산행 274분)에서
    "274분"은 아무도 머리로 환산하지 않는다. */
export function formatDuration(minutes) {
    if (!Number.isFinite(minutes) || minutes < 0) return '—';
    const m = Math.max(1, Math.round(minutes));
    if (m < 60) return `${m}분`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest > 0 ? `${h}시간 ${rest}분` : `${h}시간`;
}

/** 남은거리(m) → "1.2km" / "300m" */
export function formatDistance(meters) {
    if (!Number.isFinite(meters) || meters < 0) return '—';
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
    return `${Math.round(meters / 10) * 10}m`;
}
