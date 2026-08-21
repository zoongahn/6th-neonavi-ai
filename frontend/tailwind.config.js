/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Tailwind preflight 가 html 에 이걸 깔아 준다 → 앱 전체 기본 글꼴
        sans: ['Wanted Sans', 'Wanted Sans Ext', 'system-ui', '-apple-system',
               'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {

        brand: '#5B5BD6',
      },
    },
  },
  plugins: [],
}
