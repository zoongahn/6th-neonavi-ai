/** @type {import('tailwindcss').Config} */

/*
    브랜드 색은 tailwind 의 indigo 램프를 그대로 `brand` 로 부른다.
    값이 같으므로 indigo-600 → brand-600 치환은 화면이 하나도 안 바뀐다.
    이름이 하나 생기는 게 목적이다 — 예전엔 같은 역할에 보라가 4종이었다
    (#4F46E5 50곳 / #625DCE 7 / #5C5CFF 3 / #5B5BD6 정의만 하고 0곳).

    중립색은 tailwind 의 `gray` 를 그대로 쓴다. 213곳이 이미 그걸 쓰고 있어서,
    `ink` 같은 별칭을 새로 만들면 같은 색에 이름이 둘 생긴다 — 지금 없애는
    문제를 그대로 재생산하는 꼴이다.
*/
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontSize: {
        // 기본 스케일에 없는 아주 작은 라벨(칩 안 보조문구 등). 임의값 text-[11px]
        // 대신 이름을 붙여 둔다.
        xxs: ['11px', '15px'],
      },
      fontFamily: {
        // Tailwind preflight 가 html 에 이걸 깔아 준다 → 앱 전체 기본 글꼴
        sans: ['Wanted Sans', 'Wanted Sans Ext', 'system-ui', '-apple-system',
               'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE', 300: '#A5B4FC',
          400: '#818CF8', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA',
          800: '#3730A3', 900: '#312E81',
        },
        /*
            별점 1~5 단계. 회색(gray-500) → 브랜드(brand-600) 직선 보간이다.
            양 끝을 못 박은 이유:
              - 5 점이 브랜드색이어야 '최고 만족 = 우리 색' 이 된다
              - 다섯 단계 전부 흰 글자 대비 4.8:1 이상이라 글자색을 따로 안 나눠도 된다
                (노란색 계열은 4·5 점에서 1.4:1 까지 떨어져 안 읽힌다)
            미선택(0점)은 gray-200 이라 '안 골랐다' 와 '1점' 이 구분된다.
        */
        rating: {
          1: '#6B7280', 2: '#646799', 3: '#5D5CB2', 4: '#5651CC', 5: '#4F46E5',
        },

        // 상태색. 호출부에서 red-500 대신 danger 라고 쓰면 의도가 드러난다
        danger: '#EF4444',
        warn: '#F59E0B',
        success: '#10B981',
      },
    },
  },
  plugins: [],
}
