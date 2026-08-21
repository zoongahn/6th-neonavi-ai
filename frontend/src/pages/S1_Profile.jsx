import React, {
    useEffect,
    useState
} from 'react';

import {
    useNavigate,
    useLocation
} from 'react-router-dom';

import {
    saveProfile
} from '../api/naviApi';

import {
    DEFAULT_PROFILE,
    readProfile,
    writeProfile
} from '../utils/profileStorage';


export default function S1() {
    const navigate = useNavigate();
    const location = useLocation();

    const isFromMyPage =
        location.state?.fromMyPage || false;

    // 프로필이 없어서 이 화면으로 보내진 경우(S0 시작하기 / S4 안내 배너)
    const needsProfile =
        location.state?.fromOnboarding ||
        location.state?.profileRequired ||
        false;

    // 동승자·짐은 여정마다 바뀌는 값이라
    // 홈(S2)에서 입력받는다.
    const [profile, setProfile] =
        useState(DEFAULT_PROFILE);

    const [isSaving, setIsSaving] =
        useState(false);

    const [errorMessage, setErrorMessage] =
        useState('');


    /**
     * 저장해 둔 프로필이 있으면 불러오기
     */
    useEffect(() => {
        const saved = readProfile();

        if (saved) {
            setProfile((prev) => ({
                ...prev,
                ...saved
            }));
        }
    }, []);


    /**
     * 프로필 항목 수정
     */
    const updateProfile = (key, value) => {
        setProfile((prev) => ({
            ...prev,
            [key]: value
        }));
    };


    /**
     * 저장 / 다음으로
     */
    const handleBottomButtonClick = async () => {
        if (!profile.name?.trim()) {
            setErrorMessage(
                '이름을 입력해 주세요.'
            );

            return;
        }

        if (!profile.age) {
            setErrorMessage(
                '나이를 입력해 주세요.'
            );

            return;
        }

        setIsSaving(true);
        setErrorMessage('');

        try {
            /*
             * 나이 / 성별 / 차종 / 연식은
             * 기존 방식대로 서버에 저장
             */
            const saved =
                await saveProfile(profile);

            /*
             * 이름을 포함한 전체 화면 프로필은
             * 브라우저에도 저장
             */
            writeProfile({
                ...profile,

                name:
                    profile.name.trim(),

                id:
                    saved.id
            });

            if (isFromMyPage) {
                navigate(-1);
            } else {
                navigate('/home');
            }
        } catch (error) {
            console.error(
                '프로필 저장 실패',
                error
            );

            setErrorMessage(
                '프로필을 저장하지 못했습니다. 서버 상태를 확인해 주세요.'
            );
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <div className="p-6 bg-gray-50 min-h-screen pb-24">
            <h1 className="text-2xl font-bold mb-2 mt-2">
                {isFromMyPage
                    ? '프로필 수정'
                    : '기본 정보를 알려주세요'}
            </h1>

            {/* 어디서 왔는지에 따라 왜 이 화면이 필요한지 알려 준다 */}
            <p className="text-sm text-gray-500 font-medium mb-8 leading-relaxed">
                {isFromMyPage
                    ? '수정하면 다음 경로 추천부터 반영돼요.'
                    : needsProfile
                        ? '이 정보로 운전 성향을 추론해 경로를 고릅니다. 한 번만 입력하면 돼요.'
                        : '나이·성별·차종·연식으로 운전 성향을 추론합니다.'}
            </p>

            <div className="space-y-8">

                {/* 1. 이름 */}
                <div>
                    <label className="block text-base font-extrabold text-gray-900 mb-3">
                        이름
                    </label>

                    <input
                        type="text"
                        placeholder="예: 홍길동"
                        value={
                            profile.name || ''
                        }
                        onChange={(e) =>
                            updateProfile(
                                'name',
                                e.target.value
                            )
                        }
                        className="w-full bg-white border-2 border-gray-200 p-4 rounded-2xl outline-none focus:border-brand-600 focus:ring-0 transition-colors font-bold text-gray-900"
                    />
                </div>


                {/* 2. 나이 */}
                <div>
                    <label className="block text-base font-extrabold text-gray-900 mb-3">
                        나이
                    </label>

                    <input
                        type="number"
                        placeholder="예: 42"
                        value={profile.age}
                        onChange={(e) =>
                            updateProfile(
                                'age',
                                e.target.value
                            )
                        }
                        className="w-full bg-white border-2 border-gray-200 p-4 rounded-2xl outline-none focus:border-brand-600 focus:ring-0 transition-colors font-bold text-gray-900"
                    />
                </div>


                {/* 3. 성별 */}
                <div>
                    <label className="block text-base font-extrabold text-gray-900 mb-3">
                        성별
                    </label>

                    <div className="flex space-x-3">
                        {[
                            {
                                id: 'M',
                                label: '남성'
                            },
                            {
                                id: 'F',
                                label: '여성'
                            }
                        ].map((g) => (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() =>
                                    updateProfile(
                                        'gender',
                                        g.id
                                    )
                                }
                                className={`
                                    flex-1
                                    py-3
                                    rounded-full
                                    font-bold
                                    transition-colors
                                    duration-200
                                    border-2
                                    ${
                                        profile.gender ===
                                        g.id
                                            ? 'bg-brand-600 text-white border-brand-600'
                                            : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'
                                    }
                                `}
                            >
                                {g.label}
                            </button>
                        ))}
                    </div>
                </div>


                {/* 4. 차종 */}
                <div>
                    <label className="block text-base font-extrabold text-gray-900 mb-3">
                        차종
                    </label>

                    <div className="grid grid-cols-4 gap-2">
                        {[
                            {
                                id: 'sedan',
                                label: '세단'
                            },
                            {
                                id: 'suv',
                                label: 'SUV'
                            },
                            {
                                id: 'compact',
                                label: '경차'
                            },
                            {
                                id: 'truck',
                                label: '트럭'
                            }
                        ].map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() =>
                                    updateProfile(
                                        'carType',
                                        c.id
                                    )
                                }
                                className={`
                                    text-sm
                                    py-3
                                    rounded-full
                                    font-bold
                                    transition-colors
                                    duration-200
                                    border-2
                                    ${
                                        profile.carType ===
                                        c.id
                                            ? 'bg-brand-600 text-white border-brand-600'
                                            : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'
                                    }
                                `}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>


                {/* 5. 차량 연식 */}
                <div>
                    <label className="block text-base font-extrabold text-gray-900 mb-3">
                        차량 연식

                        <span className="text-brand-600 ml-2">
                            {profile.carAge} 년
                        </span>
                    </label>

                    <input
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={profile.carAge}
                        onChange={(e) =>
                            updateProfile(
                                'carAge',
                                Number(
                                    e.target.value
                                )
                            )
                        }
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                    />
                </div>
            </div>


            {/*
                하단 버튼.
                ⚠️ `fixed` 는 앱 프레임이 아니라 **뷰포트** 기준이다. App.jsx 가
                `max-w-lg` 로 폰 화면을 흉내내고 있으므로 `left-0 w-full` 로 두면
                데스크톱에서 버튼 바가 프레임 밖으로 넘쳐 나간다.
                가로만 프레임 폭에 맞춰 가운데로 고정한다(S0 와 같은 방식).
            */}
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg p-4 bg-white border-t">
                {errorMessage && (
                    <p className="mb-3 text-sm font-semibold text-red-500">
                        {errorMessage}
                    </p>
                )}

                <button
                    type="button"
                    onClick={
                        handleBottomButtonClick
                    }
                    disabled={isSaving}
                    className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg disabled:bg-gray-400"
                >
                    {isSaving
                        ? '저장 중...'
                        : isFromMyPage
                            ? '저장하기'
                            : '다음으로'}
                </button>
            </div>
        </div>
    );
}