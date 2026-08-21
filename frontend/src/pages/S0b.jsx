import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';

export default function S0b_LocationPermission() {
    const navigate = useNavigate();

    // 로딩 중임을 알림
    const [isLocating, setIsLocating] = useState(false);

    const handleAllowLocation = () => {
        // 기기가 GPS 기능을 지원하지 않는 경우 예외 처리
        if (!navigator.geolocation) {
            alert("현재 브라우저 및 기기에서는 위치 기능을 지원하지 않습니다.");
            navigate('/profile');
            return;
        }

        setIsLocating(true); // 위치 탐색 시작 (로딩 상태 켜기)

        navigator.geolocation.getCurrentPosition(
            // 위치를 성공적으로 가져왔을 때
            (position) => {
                const { latitude, longitude } = position.coords;

                console.log(`위치 획득 성공! 위도: ${latitude}, 경도: ${longitude}`);

                // 이 데이터를 프론트엔드 어딘가에 보관해야 다음 화면(S2 홈)에서 출발지로 띄워줄 수 있습니다.
                // 지금은 백엔드 연동 전 가장 간단하게 브라우저 저장소(localStorage)에 담아두겠습니다.
                localStorage.setItem('userLat', latitude);
                localStorage.setItem('userLng', longitude);

                setIsLocating(false); // 로딩 끄기
                navigate('/profile');

                // 실패: 권한 거부, 신호 없음 등의 에러가 발생했을 때
                (error) => {
                    setIsLocating(false); // 에러가 나도 로딩은 꺼야 합니다.

                    if (error.code === error.PERMISSION_DENIED) {
                        alert("위치 권한을 거부하셨습니다");
                    } else if (error.code === error.POSITION_UNAVAILABLE) {
                        alert("위치를 찾을 수 없습니다");
                    } else if (error.code === error.TIMEOUT) {
                        alert("로딩 시간 경과");
                    }

                    // 위치를 못 찾으면 일단 다음 단계로 넘기고 나중에 수동 입력
                    navigate('/profile');
                },

                {
                    enableHighAccuracy: true, // 위치를 최대한 정확하게 받기
                    timeout: 10000,           // 10초 동안 못 찾으면 타임아웃 에러 발생
                    maximumAge: 0             // 과거에 캐시된 위치 말고, 무조건 현재 실시간 위치 획득
                }
        );
    };

    return (
        <div className="bg-white min-h-screen flex flex-col justify-between p-6">

            <div className="flex-1 flex flex-col justify-center items-center text-center mt-10">
                <div className="w-24 h-24 bg-brand-50 rounded-full flex items-center justify-center text-5xl mb-6 shadow-sm">
                    <Icon name="pin" size={28} />
                </div>

                <h1 className="text-2xl font-extrabold text-gray-900 mb-4">
                    현재 위치를 확인해 주세요
                </h1>
                <p className="text-gray-500 text-base leading-relaxed mb-10">
                    너네비가 빠르고 정확한 맞춤 경로를<br />
                    안내하기 위해 위치 권한이 필요해요.
                </p>

                <div className="bg-gray-50 rounded-2xl p-5 w-full text-left border border-gray-100">
                    <div className="flex items-start gap-3">
                        <span className="text-brand-600 mt-0.5"><Icon name="axis" size={18} /></span>
                        <div>
                            <h3 className="text-sm font-bold text-gray-800">정확한 출발지 자동 설정</h3>
                            <p className="text-xs text-gray-500 mt-1.5">현재 계신 곳을 출발지로 바로 잡아드려요.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="pb-8 pt-4 w-full">
                {/* 로딩 중 버튼 텍스트를 바꾸고 클릭방지 */}
                <button
                    onClick={handleAllowLocation}
                    disabled={isLocating}
                    className={`w-full font-bold text-lg py-4 rounded-xl shadow-md transition-colors ${isLocating ? 'bg-brand-300 text-white cursor-not-allowed' : 'bg-brand-600 text-white active:bg-brand-700'
                        }`}
                >
                    {isLocating ? '위치 찾는 중... ⏳' : '위치 권한 허용하기'}
                </button>

                <button
                    onClick={() => navigate('/profile')}
                    disabled={isLocating} // 위치 찾는 중 건너뛰기 방지
                    className={`w-full font-semibold text-sm py-4 mt-2 ${isLocating ? 'text-gray-300' : 'text-gray-400'}`}
                >
                    다음에 설정할게요
                </button>
            </div>

        </div>
    );
}