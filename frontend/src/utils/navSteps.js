// 백엔드가 준 주행 안내(steps)를 화면이 쓸 형태로 다듬는다.
//
// steps 한 건: { coord_index, lng, lat, guidance, type, distance, duration }
// - guidance 는 카카오가 준 한국어 안내문. **그대로 보여준다**(우리가 짓지 않는다).
// - distance 는 직전 안내지점부터의 거리라 누적이 아니다 → 여기서 coord_index 로
//   폴리라인상 위치(distAlong)를 만든다.

/*
    화살표는 type 코드가 아니라 **안내문 텍스트**로 고른다.

    실측하면 1=좌회전 2=우회전 3=유턴 으로 보이지만, 이건 경로 하나에서 관찰한
    것일 뿐 공식 코드표로 확인한 게 아니다. 코드표를 추측해 매핑하면 틀려도
    에러가 안 나서 **조용히 반대 방향 화살표**가 뜬다. 텍스트 매칭은 못 맞히면
    기본 화살표로 안전하게 떨어진다. 어차피 우리가 화면에 쓰는 것도 이 텍스트다.

    순서가 의미 있다: '오른쪽에 ... 출구' 처럼 방향어와 진출입어가 같이 나오므로
    구체적인 규칙을 먼저 둔다.

    ⚠️ 시계 방향 표기는 서로 부분문자열이다. **'12시' 안에 '2시'가 들어 있어서**
    그냥 /2시/ 로 두면 직진 안내에 우회전 화살표가 뜬다(실제로 그렇게 짰다가
    테스트에서 잡혔다). 12시를 먼저 보고, 숫자 뒤에 붙은 '1시/2시'는 제외한다.
*/
const ICON_RULES = [
    [/유턴/, '⟲'],
    [/좌회전/, '↰'],
    [/우회전/, '↱'],
    [/출구/, '⤵'],
    [/입구|진입|합류/, '⤴'],
    [/12시|직진/, '↑'],
    [/(?:^|[^0-9])(?:10시|11시)|왼쪽/, '↖'],
    [/(?:^|[^0-9])(?:1시|2시)|오른쪽/, '↗'],
    [/목적지|도착/, '🏁'],
];

export function stepIcon(guidance = '') {
    const hit = ICON_RULES.find(([pattern]) => pattern.test(guidance));
    return hit ? hit[1] : '↑';
}

const START_TYPE = 100;

/**
 * steps + 누적거리 → 화면용 안내 목록.
 * 출발지 안내(type 100)는 거리 0이라 시작하자마자 지나간다 → 뺀다.
 */
export function prepareSteps(steps = [], cum = null) {
    if (!cum || cum.length === 0) return [];
    const last = cum.length - 1;
    return steps
        .filter((step) => step.type !== START_TYPE)
        .map((step) => ({
            ...step,
            distAlong: cum[Math.max(0, Math.min(last, step.coord_index ?? 0))],
            icon: stepIcon(step.guidance),
        }))
        .sort((a, b) => a.distAlong - b.distAlong);
}

/**
 * 지금 보여줄 안내 = **아직 안 지나온 첫 안내**.
 *
 * 스텝 인덱스를 상태로 들고 "30m 안으로 들어오면 ++" 하는 방식도 있지만,
 * 그러면 모드 전환으로 경로가 바뀌거나 모의 주행을 되감을 때 상태가 어긋난다.
 * 위치만 보고 매번 다시 고르면 그런 게 없다(스텝은 경로당 10여 개라 싸다).
 */
export function currentStep(prepared, distAlong) {
    const index = prepared.findIndex((step) => step.distAlong > distAlong + 1);
    if (index === -1) return null;
    return { ...prepared[index], remainM: prepared[index].distAlong - distAlong, index };
}
