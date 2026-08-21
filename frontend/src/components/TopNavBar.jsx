import React from 'react';
import { useNavigate } from 'react-router-dom';

import Icon from './Icon';

export default function TopNavBar({
    title,
    hideBack = false,
    backTo = null,
    // 목록처럼 긴 화면은 스크롤해도 상단바가 붙어 있어야 한다(S7a 가 그랬다)
    sticky = false
}) {
    const navigate = useNavigate();

    const handleBack = () => {
        // 이동할 주소가 지정된 경우에는 해당 주소로 이동
        if (backTo) {
            navigate(backTo, { replace: true });
            return;
        }

        // 주소가 지정되지 않은 페이지는 일반적인 이전 페이지로 이동
        navigate(-1);
    };

    return (
        <div className={`w-full py-4 px-5 bg-white flex items-center z-50 border-b border-gray-100 ${
            sticky ? 'sticky top-0' : 'relative'
        }`}>
            {hideBack ? (
                <div className="w-8" />
            ) : (
                <button
                    type="button"
                    onClick={handleBack}
                    className="text-gray-700 hover:text-gray-900 transition-colors -ml-1"
                    style={{
                        WebkitTapHighlightColor: 'transparent'
                    }}
                    aria-label="뒤로가기"
                >
                    <Icon name="chevron-left" size={24} />
                </button>
            )}

            {title && (
                <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-bold text-gray-800">
                    {title}
                </h1>
            )}
        </div>
    );
}