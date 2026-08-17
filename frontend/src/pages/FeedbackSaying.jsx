import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// 컴포넌트 밖에 둔다. 안에 두면 렌더마다 새 배열이 만들어져 useEffect 의존성
// 경고가 나고, CI 빌드(경고를 에러로 취급)가 통째로 실패한다.
// 밖으로 빼면 eslint-disable 로 덮을 필요 자체가 없어진다.
const QUOTES = [
    "모든 길은 로마로 통한다. 당신의 목적지도 그렇습니다.",
    "천 리 길도 한 걸음부터, 안전한 주행의 시작입니다.",
    "인생은 속도가 아니라 방향입니다.",
    "가장 안전한 길이 가장 빠른 길입니다.",
    "길이 없으면 길을 찾고, 찾아도 없으면 길을 닦아 나가라.",
    "좋은 동반자와 함께라면 길이 멀지 않습니다."
];

export default function FeedbackSaying() {
    const navigate = useNavigate();
    const location = useLocation();

    const [quote, setQuote] = useState('');

    useEffect(() => {
        setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);

        const timer = setTimeout(() => {
            navigate('/home', {
                replace: true,
                state: location.state
            });
        }, 2000);

        return () => clearTimeout(timer);
    }, [navigate, location.state]);

    return (
        // 가로는 앱 프레임(max-w-lg)까지만. inset-0 이면 데스크톱에서 브라우저
        // 화면 전체가 남보라색으로 덮여 폰 화면 흉내가 깨진다.
        <div className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-[999] flex flex-col items-center justify-center bg-indigo-600 text-white px-6 text-center animate-fade-in">

            <div className="text-6xl mb-8 animate-bounce">
                🚘
            </div>

            <div className="bg-indigo-700/50 p-8 rounded-3xl backdrop-blur-sm max-w-sm w-full shadow-lg border border-indigo-500/30">

                <p className="text-xl font-bold leading-relaxed mb-4 break-keep">
                    "{quote}"
                </p>

                <p className="text-sm text-indigo-200 font-medium tracking-widest">
                    - NeoNavi -
                </p>

            </div>

            <style>{`
                @keyframes fade-in {
                    from {
                        opacity: 0;
                    }

                    to {
                        opacity: 1;
                    }
                }

                .animate-fade-in {
                    animation: fade-in 0.3s ease-out;
                }
            `}</style>

        </div>
    );
}
