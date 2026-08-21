import React from 'react';

/*
    너네비 마크 — 'neonavi' 의 N 을 도로로 그린 것.
    반투명한 노면 위에 중앙선이 얹힌 두 층 구조라서 길처럼 읽힌다.

    같은 그림이 파비콘·앱아이콘으로도 나가므로 원본은 frontend/src/assets/brand/*.svg 에 있다.
    여기서 인라인으로 다시 그리는 이유:
      - 색·크기를 props 로 바꿔야 한다(어두운 배경, 지도 마커, 단색 인쇄)
      - <img> 로 부르면 요청이 한 번 더 나가고 첫 페인트에 로고만 늦게 뜬다
*/

const ROAD = [
    'M 140 384 L 140 156',
    'M 140 156 L 372 368',
    'M 372 368 L 372 156',
];
const CENTER_LINE = 'M 140 372 L 140 162 L 372 362 L 372 162';

export default function BrandMark({
    size = 40,
    plate = '#4F46E5',   // 'none' 이면 판 없이 마크만 (어두운 배경·단색용)
    fg = '#FFFFFF',
    rounded = true,
    className = '',
    title = '너네비',
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 512 512"
            className={className}
            role="img"
            aria-label={title}
        >
            {plate !== 'none' && (
                <rect
                    width="512"
                    height="512"
                    rx={rounded ? 114.5 : 0}
                    ry={rounded ? 114.5 : 0}
                    fill={plate}
                />
            )}

            {/* 노면 */}
            {ROAD.map((d) => (
                <path
                    key={d}
                    d={d}
                    fill="none"
                    stroke={fg}
                    strokeWidth="74"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.42"
                />
            ))}

            {/* 중앙선 */}
            <path
                d={CENTER_LINE}
                fill="none"
                stroke={fg}
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="30 34"
            />
        </svg>
    );
}
