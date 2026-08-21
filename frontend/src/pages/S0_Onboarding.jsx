import React from 'react';
import { useNavigate } from 'react-router-dom';

import BrandMark from '../components/BrandMark';
import { hasUsableProfile } from '../utils/profileStorage';

export default function S0() {
    const navigate = useNavigate();

    /*
        프로필이 없으면 경로 추천이 아예 안 된다. 그런데 예전에는 그 사실을
        출발지·도착지·옵션을 다 채우고 **경로 탐색 결과 화면에 와서야** 알 수 있었다
        (buildRecommendRequest 가 거기서 throw 한다). 입력을 다 버리게 되므로
        시작 지점에서 갈라 준다.
    */
    const isReady = hasUsableProfile();

    const handleStart = () =>
        navigate(isReady ? '/home' : '/profile', {
            state: isReady ? undefined : { fromOnboarding: true },
        });

    return (
        <div className="bg-gray-50 min-h-screen flex flex-col relative font-sans pb-32">

            {/* 메인 콘텐츠 영역: 화면 중앙 정렬 */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 mt-16">

                {/* 앱 로고 */}
                <BrandMark
                    size={96}
                    className="mb-10 rounded-[2rem] shadow-[0_10px_25px_rgba(79,70,229,0.3)]"
                />

                {/* 메인 타이틀  */}
                <h1 className="text-gray-900 text-[32px] font-extrabold text-center leading-[1.35] mb-5 tracking-tight">
                    너만을 위한<br />맞춤 내비, <span className="text-[#5C5CFF]">너네비</span>
                </h1>

                {/* 서브 설명 텍스트  */}
                <p className="text-gray-500 text-center text-[16px] font-medium leading-relaxed">
                    운전자의 성향과 동승자를 분석하여<br />
                    가장 편안하고 안전한 길을 찾아드려요.
                </p>

            </div>

            {/* 하단 고정 '시작하기' 버튼 */}
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-5 py-6 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent z-[9999]">
                {!isReady && (
                    <p className="text-center text-[13px] text-gray-500 font-medium mb-3">
                        성향을 추론하려면 기본 정보가 먼저 필요해요
                    </p>
                )}

                <button
                    onClick={handleStart}
                    className="w-full bg-[#5C5CFF] text-white py-4 rounded-2xl font-bold text-[17px] shadow-[0_8px_20px_rgba(92,92,255,0.3)] hover:bg-indigo-600 active:scale-95 transition-transform"
                >
                    {isReady ? '시작하기' : '기본 정보 입력하고 시작하기'}
                </button>
            </div>

        </div>
    );
}