import { currentStep, prepareSteps, stepIcon } from './navSteps';

// 실제 카카오 응답에서 가져온 안내문들 (강남 → 판교)
describe('stepIcon', () => {
    it.each([
        ['강남세브란스 방면으로 우회전', '↱'],
        ['판교테크노밸리 방면으로 좌회전', '↰'],
        ['분당내곡로 내곡동 방면으로 유턴', '⟲'],
        ['12시 방향', '↑'],
        ['오른쪽에 도시고속도로 출구', '⤵'],
        ['분당 판교IC 방면으로 왼쪽에 도시고속도로 입구', '⤴'],
        ['왼쪽 10시 방향', '↖'],
        ['오른쪽 2시 방향', '↗'],
        ['목적지', '🏁'],
    ])('%s → %s', (guidance, icon) => {
        expect(stepIcon(guidance)).toBe(icon);
    });

    it('모르는 안내문은 직진 화살표로 안전하게 떨어진다', () => {
        expect(stepIcon('알 수 없는 안내')).toBe('↑');
        expect(stepIcon('')).toBe('↑');
    });

    it('"오른쪽에 ... 출구"는 방향어보다 출구가 이긴다', () => {
        // 규칙 순서가 뒤집히면 ↗ 가 나온다
        expect(stepIcon('오른쪽에 도시고속도로 출구')).toBe('⤵');
    });

    it('12시(직진)가 2시(우측)로 새지 않는다', () => {
        // '12시' 안에 '2시'가 들어 있다. 이 회귀를 실제로 한 번 냈다.
        expect(stepIcon('12시 방향')).toBe('↑');
        expect(stepIcon('11시 방향')).toBe('↖');
        expect(stepIcon('2시 방향')).toBe('↗');
        expect(stepIcon('1시 방향')).toBe('↗');
    });
});

describe('prepareSteps', () => {
    const cum = Float64Array.from([0, 100, 200, 300, 400]);

    it('coord_index 를 선상 거리로 바꾼다', () => {
        const out = prepareSteps([{ coord_index: 2, guidance: '우회전', type: 2 }], cum);
        expect(out[0].distAlong).toBe(200);
    });

    it('출발지 안내(type 100)는 뺀다', () => {
        const out = prepareSteps(
            [
                { coord_index: 0, guidance: '출발지', type: 100 },
                { coord_index: 2, guidance: '우회전', type: 2 },
            ],
            cum
        );
        expect(out).toHaveLength(1);
        expect(out[0].guidance).toBe('우회전');
    });

    it('범위를 벗어난 coord_index 는 끝으로 잘린다', () => {
        const out = prepareSteps([{ coord_index: 999, guidance: '목적지', type: 101 }], cum);
        expect(out[0].distAlong).toBe(400);
    });

    it('경로가 없으면 빈 배열', () => {
        expect(prepareSteps([{ coord_index: 0 }], null)).toEqual([]);
    });
});

describe('currentStep', () => {
    const cum = Float64Array.from([0, 100, 200, 300, 400]);
    const steps = prepareSteps(
        [
            { coord_index: 1, guidance: '우회전', type: 2 },
            { coord_index: 3, guidance: '좌회전', type: 1 },
            { coord_index: 4, guidance: '목적지', type: 101 },
        ],
        cum
    );

    it('아직 안 지나온 첫 안내를 고른다', () => {
        expect(currentStep(steps, 0).guidance).toBe('우회전');
        expect(currentStep(steps, 150).guidance).toBe('좌회전');
        expect(currentStep(steps, 350).guidance).toBe('목적지');
    });

    it('남은거리를 같이 준다', () => {
        expect(currentStep(steps, 40).remainM).toBe(60);
    });

    it('되감아도 상태가 꼬이지 않는다(위치만 보고 매번 다시 고른다)', () => {
        currentStep(steps, 350);
        expect(currentStep(steps, 0).guidance).toBe('우회전');
    });

    it('다 지나오면 null', () => {
        expect(currentStep(steps, 400)).toBeNull();
    });
});
