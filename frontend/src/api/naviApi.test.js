/* API 주소 결정 규칙 — 배포에서 프론트가 백엔드를 못 찾는 건 조용히 나는 실패라
   테스트로 못박는다. */
const load = () => {
    let mod;
    jest.isolateModules(() => { mod = require('./naviApi'); });
    return mod;
};
const setHost = (hostname) => {
    delete window.location;
    window.location = { hostname };
};

describe('API BASE_URL', () => {
    const orig = process.env.REACT_APP_API_BASE_URL;
    afterEach(() => {
        if (orig === undefined) delete process.env.REACT_APP_API_BASE_URL;
        else process.env.REACT_APP_API_BASE_URL = orig;
    });

    it('로컬 개발이면 127.0.0.1:8000 을 부른다', async () => {
        delete process.env.REACT_APP_API_BASE_URL;
        setHost('localhost');
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ places: [] }) }));
        await load().searchPlaces('강남');
        expect(global.fetch.mock.calls[0][0]).toMatch(/^http:\/\/127\.0\.0\.1:8000\//);
    });

    it('배포(그 외 도메인)면 같은 오리진 상대경로를 쓴다', async () => {
        delete process.env.REACT_APP_API_BASE_URL;
        setHost('neonavi.vercel.app');
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ places: [] }) }));
        await load().searchPlaces('강남');
        expect(global.fetch.mock.calls[0][0]).toMatch(/^\/api\/routes\/places\//);
    });

    it('환경변수가 있으면 그것이 이긴다', async () => {
        process.env.REACT_APP_API_BASE_URL = 'https://api.example.com/';
        setHost('localhost');
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ places: [] }) }));
        await load().searchPlaces('강남');
        expect(global.fetch.mock.calls[0][0]).toMatch(/^https:\/\/api\.example\.com\/api\//);
    });
});
