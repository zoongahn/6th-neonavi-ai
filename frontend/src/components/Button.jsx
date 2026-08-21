import React from 'react';

/*
    기본 버튼. 화면마다 따로 쓰다 보니 같은 '기본 동작' 버튼이 8가지로 갈라져
    있었다 — py-3/py-4, rounded-lg/xl/2xl, 그림자 유무, 비활성 색이 제각각.
    누르는 느낌(active)이 아예 없는 것도 있었다.

    variant
      primary   기본 동작 (브랜드색)
      secondary 부수 동작 (테두리만)
      danger    되돌릴 수 없는 동작 (주행 종료 등)
*/

const VARIANTS = {
    primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-700 '
        + 'disabled:bg-gray-300 disabled:shadow-none',
    secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 '
        + 'active:bg-gray-100 disabled:text-gray-400',
    danger: 'bg-danger text-white shadow-sm hover:brightness-95 active:brightness-90 '
        + 'disabled:bg-gray-300 disabled:shadow-none',
};

const SIZES = {
    md: 'py-3 px-4 text-sm rounded-xl',
    lg: 'py-4 px-5 text-lg rounded-xl',
};

export default function Button({
    variant = 'primary',
    size = 'lg',
    fullWidth = true,
    className = '',
    type = 'button',
    children,
    ...rest
}) {
    return (
        <button
            type={type}
            className={[
                'font-bold transition-colors active:scale-[0.98] disabled:active:scale-100',
                'disabled:cursor-not-allowed inline-flex items-center justify-center gap-2',
                VARIANTS[variant] || VARIANTS.primary,
                SIZES[size] || SIZES.lg,
                fullWidth ? 'w-full' : '',
                className,
            ].join(' ')}
            {...rest}
        >
            {children}
        </button>
    );
}
