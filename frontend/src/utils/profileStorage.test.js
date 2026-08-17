import { hasUsableProfile, isProfileComplete, writeProfile } from './profileStorage';

describe('isProfileComplete', () => {
    it('프로필이 없으면 미완성', () => {
        expect(isProfileComplete(null)).toBe(false);
        expect(isProfileComplete(undefined)).toBe(false);
    });

    it('나이가 비어 있으면 미완성', () => {
        // 이게 실제 사고 지점이었다. 객체는 있어서 null 검사는 통과하는데
        // Number('') → NaN 이 되어 경로 추천 단계에서야 터졌다.
        expect(isProfileComplete({ name: '홍길동', age: '' })).toBe(false);
        expect(isProfileComplete({ name: '홍길동' })).toBe(false);
    });

    it('나이가 0이나 음수면 미완성', () => {
        expect(isProfileComplete({ age: 0 })).toBe(false);
        expect(isProfileComplete({ age: -1 })).toBe(false);
    });

    it('나이가 숫자가 아니면 미완성', () => {
        expect(isProfileComplete({ age: '스물넷' })).toBe(false);
    });

    it('나이가 있으면 완성 — 문자열로 들어와도 된다', () => {
        // 입력창에서 오는 값은 문자열이다
        expect(isProfileComplete({ age: '24' })).toBe(true);
        expect(isProfileComplete({ age: 24 })).toBe(true);
    });

    it('이름은 따지지 않는다 — 모델로 가지 않는 값이다', () => {
        expect(isProfileComplete({ age: 24, name: '' })).toBe(true);
    });
});

describe('hasUsableProfile', () => {
    beforeEach(() => localStorage.clear());

    it('저장된 게 없으면 false', () => {
        expect(hasUsableProfile()).toBe(false);
    });

    it('나이 없는 프로필이 저장돼 있으면 false', () => {
        writeProfile({ name: '홍길동', age: '', gender: 'M' });
        expect(hasUsableProfile()).toBe(false);
    });

    it('쓸 수 있는 프로필이 저장돼 있으면 true', () => {
        writeProfile({ name: '홍길동', age: 24, gender: 'M', carType: 'sedan', carAge: 1 });
        expect(hasUsableProfile()).toBe(true);
    });

    it('깨진 JSON 이 들어 있어도 던지지 않고 false', () => {
        localStorage.setItem('neonaviProfile', '{망가진');
        expect(hasUsableProfile()).toBe(false);
    });
});
