import React, { useState, useEffect } from 'react';

import Button from './Button';
export default function DepartureTimeModal({ isOpen, onClose, onConfirm, initialTime }) {
    // initialTime이 'now'이면 현재 시간, 아니면 설정된 시간을 파싱
    const getInitialDateTime = () => {
        if (!initialTime || initialTime === 'now') {
            const now = new Date();
            // input type="datetime-local"에 맞는 YYYY-MM-DDThh:mm 형식으로 변환
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            return now.toISOString().slice(0, 16);
        }
        return initialTime;
    };

    const [isCustomTime, setIsCustomTime] = useState(initialTime !== 'now');
    const [selectedDateTime, setSelectedDateTime] = useState(getInitialDateTime());

    // 모달이 열릴 때마다 상태 초기화
    useEffect(() => {
        if (isOpen) {
            setIsCustomTime(initialTime !== 'now');
            setSelectedDateTime(getInitialDateTime());
        }
        // getInitialDateTime 은 initialTime 만 참조한다(매 렌더 새로 만들어질 뿐).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialTime]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm(isCustomTime ? selectedDateTime : 'now');
        onClose();
    };

    const handleNowDepart = () => {
        onConfirm('now');
        onClose();
    };

    return (
        // inset-0 이면 데스크톱에서 바텀시트가 화면 전체 폭으로 퍼진다.
        // 세로는 전체, 가로는 앱 프레임(max-w-lg)에 맞춰 가운데 정렬.
        <div className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-[100] flex flex-col justify-end">
            {/* 어두운 배경 (클릭 시 닫힘) */}
            <div
                className="absolute inset-0 bg-black/40 transition-opacity"
                onClick={onClose}
            ></div>

            {/* 바텀 시트 컨텐츠 */}
            <div className="relative bg-white w-full rounded-t-3xl pt-2 pb-6 px-4 shadow-2xl animate-slide-up">
                {/* 상단 손잡이 (UI 디테일) */}
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4"></div>

                {/* 헤더 */}
                <div className="flex justify-between items-center mb-6 px-2">
                    <h2 className="text-xl font-bold text-gray-900">출발 시각 설정</h2>
                    <button onClick={onClose} className="p-2 -mr-2 text-gray-500 hover:bg-gray-100 rounded-full">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 토글 및 설명 영역 */}
                <div className="flex items-start justify-between mb-8 px-2">
                    <div className="pr-4">
                        <p className="font-bold text-gray-900 mb-1">출발 시각 설정</p>
                        <p className="text-sm text-gray-500 leading-snug">
                            {/* 자가용 내비게이션에 맞춘 텍스트 변경 */}
                            출발 시각을 기준으로 예상 교통 상황을 반영한 경로로 안내합니다.
                        </p>
                    </div>

                    {/* Tailwind 커스텀 토글 스위치 */}
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={isCustomTime}
                            onChange={(e) => setIsCustomTime(e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                    </label>
                </div>

                {/* 시간 선택기 (토글이 켜졌을 때만 활성화) */}
                <div className={`mb-8 px-2 transition-opacity ${isCustomTime ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    {/* iOS 휠 피커를 완벽 구현하려면 외부 라이브러리가 필요하므로, 가장 깔끔한 native datetime-local 사용 */}
                    <input
                        type="datetime-local"
                        value={selectedDateTime}
                        onChange={(e) => setSelectedDateTime(e.target.value)}
                        className="w-full text-center text-xl font-bold bg-gray-50 border border-gray-200 rounded-2xl py-4 px-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                    />
                </div>

                {/* 하단 버튼 그룹 */}
                <div className="flex gap-2 px-2">
                    <button
                        onClick={handleNowDepart}
                        className="flex-none w-1/3 py-4 rounded-xl font-bold text-base bg-gray-400 text-white active:bg-gray-500 transition-colors"
                    >
                        지금 출발
                    </button>
                    <Button
                        onClick={handleConfirm}
                        fullWidth={false} className="flex-1"
                    >
                        확인
                    </Button>
                </div>
            </div>

            <style>{`
                @keyframes slide-up {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
                .animate-slide-up {
                    animation: slide-up 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
            `}</style>
        </div>
    );
}