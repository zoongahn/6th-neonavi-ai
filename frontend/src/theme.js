/*
    지도 SDK(카카오·TMAP)와 인라인 SVG 는 tailwind 클래스를 못 받고 색 문자열만 받는다.
    그렇다고 파일마다 '#4f46e5' 를 적으면 브랜드 색이 또 흩어진다.
    값은 tailwind.config.js 의 brand 램프와 같아야 한다.
*/
export const BRAND = {
    500: '#6366F1',
    600: '#4F46E5',
    700: '#4338CA',
};

export const INK_900 = '#111827';
