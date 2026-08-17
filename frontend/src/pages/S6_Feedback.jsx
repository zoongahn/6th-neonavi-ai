import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function S6_Feedback() {
    const navigate = useNavigate();
    const [rating, setRating] = useState(0);

    const getFeedbackConfig = () => {
        if (rating === 0) {
            return { starColor: 'text-gray-300', btnColor: 'bg-gray-200 text-gray-400', btnText: '피드백 보내기' };
        }
        if (rating <= 2) {
            return { starColor: 'text-orange-400', btnColor: 'bg-orange-500 text-white shadow-lg', btnText: `별 ${rating}개 · 아쉬워요` };
        }
        if (rating === 3) {
            return { starColor: 'text-yellow-400', btnColor: 'bg-yellow-400 text-white shadow-lg', btnText: '별 3개 · 무난했어요' };
        }
        return { starColor: 'text-indigo-600', btnColor: 'bg-indigo-600 text-white shadow-lg', btnText: `별 ${rating}개 · 아주 만족해요!` };
    };

    const config = getFeedbackConfig();

    // 💡 어떤 버튼을 누르든 똑같이 명언 페이지로 이동시키는 공통 함수
    const handleFinish = () => {
        navigate('/saying', {
            replace: true
        });
    };

    return (
        <div className="p-6 bg-white min-h-screen flex flex-col justify-center items-center text-center">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-3xl mb-6">
                🏁
            </div>

            <h2 className="text-2xl font-bold mb-2">목적지에 도착했습니다</h2>
            <p className="text-gray-500 mb-10 text-sm">
                방금 주행하신 추천 경로는 어떠셨나요?<br />
                피드백은 다음 맞춤 안내에 반영됩니다.
            </p>

            <div className="flex justify-center gap-3 w-full px-4 mb-16">
                {[1, 2, 3, 4, 5].map((star) => {
                    const isSelected = rating >= star;
                    return (
                        <button
                            key={star}
                            type="button"
                            onClick={() => setRating(star)}
                            className={`text-5xl focus:outline-none transition-colors duration-200 ${isSelected ? config.starColor : 'text-gray-300'
                                }`}
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                            aria-label={`${star}점`}
                        >
                            {isSelected ? '★' : '☆'}
                        </button>
                    );
                })}
            </div>

            {/* 💡 피드백 제출 버튼 */}
            <button
                type="button"
                onClick={handleFinish}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 ${config.btnColor}`}
                disabled={rating === 0}
            >
                {config.btnText}
            </button>

            {/* 💡 다음에 할게요 버튼 */}
            <button
                type="button"
                onClick={handleFinish}
                className="mt-4 text-gray-400 text-sm font-semibold"
            >
                다음에 할게요
            </button>
        </div>
    );
}