import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import TopNavBar from '../components/TopNavBar';

export default function S3() {
    const navigate = useNavigate();
    const [mode, setMode] = useState('Comfort');
    const [autoRecommend, setAutoRecommend] = useState(true);

    return (
        <div className="bg-white min-h-screen relative pb-24">
            <TopNavBar title="경로 옵션 설정" />

            <div className="p-6">
                <div className="space-y-8">
                    <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 mt-4">
                        <div className="flex justify-between items-center mb-4">
                            <span className="font-bold text-gray-800">AI 성향 자동 추천</span>
                            <input type="checkbox" checked={autoRecommend} onChange={() => setAutoRecommend(!autoRecommend)} className="toggle-checkbox w-6 h-6 accent-brand-600" />
                        </div>

                        <p className="text-sm text-gray-500 mb-4">원하시면 모드를 직접 고를 수도 있어요</p>
                        <div className="flex space-x-2">
                            {['Comfort', 'Sports', 'Eco'].map(m => (
                                <button
                                    key={m}
                                    disabled={autoRecommend}
                                    onClick={() => setMode(m)}
                                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition ${autoRecommend ? 'opacity-50 bg-gray-200' : mode === m ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200'}`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* 하단 고정 버튼 */}
            <button
                onClick={() => navigate('/result')}
                className="w-full bg-brand-600 text-white py-4 rounded-xl font-bold text-lg absolute bottom-8 left-0 right-0 mx-6 w-[calc(100%-3rem)]"
            >
                분석하고 경로 추천받기
            </button>

        </div>
    );
}