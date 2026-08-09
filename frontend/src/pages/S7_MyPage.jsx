import {
    useEffect,
    useState
} from 'react';

import {
    useLocation,
    useNavigate
} from 'react-router-dom';

import TopNavBar from '../components/TopNavBar';
import PlaceInput from '../components/PlaceInput';

import {
    readProfile
} from '../utils/profileStorage';


const SAVED_LOCATIONS_KEY =
    'neonaviSavedLocations';


const CAR_TYPE_LABELS = {
    sedan: '세단',
    suv: 'SUV',
    compact: '경차',
    truck: '트럭'
};


/**
 * 저장된 집 / 회사 정보를 불러옵니다.
 */
const getSavedLocations = () => {
    try {
        const saved =
            localStorage.getItem(
                SAVED_LOCATIONS_KEY
            );

        if (!saved) {
            return {
                home: null,
                company: null
            };
        }

        return JSON.parse(saved);
    } catch (error) {
        console.error(
            '저장된 집/회사 정보를 불러오지 못했습니다.',
            error
        );

        return {
            home: null,
            company: null
        };
    }
};


export default function S7() {
    const navigate = useNavigate();
    const location = useLocation();


    /**
     * 실제 저장된 프로필
     */
    const [profile, setProfile] =
        useState(() => readProfile());


    /**
     * 집 / 회사
     */
    const [
        savedLocations,
        setSavedLocations
    ] = useState(getSavedLocations);


    const [homeText, setHomeText] =
        useState(
            savedLocations.home?.name || ''
        );

    const [homePlace, setHomePlace] =
        useState(
            savedLocations.home || null
        );


    const [
        companyText,
        setCompanyText
    ] = useState(
        savedLocations.company?.name || ''
    );

    const [
        companyPlace,
        setCompanyPlace
    ] = useState(
        savedLocations.company || null
    );


    const [message, setMessage] =
        useState('');


    /**
     * 마이페이지로 돌아올 때마다
     * 최신 프로필 다시 읽기
     *
     * 프로필 수정 → 저장 → 뒤로 돌아왔을 때
     * 바로 화면에 반영되도록 함
     */
    useEffect(() => {
        setProfile(
            readProfile()
        );
    }, [location.key]);


    /**
     * 프로필 표시값
     */
    const profileName =
        profile?.name?.trim() ||
        '사용자';

    const profileAge =
        profile?.age || '-';

    const genderLabel =
        profile?.gender === 'F'
            ? '여성'
            : profile?.gender === 'M'
                ? '남성'
                : '-';

    const carTypeLabel =
        CAR_TYPE_LABELS[
            profile?.carType
        ] || '-';


    /**
     * 집 / 회사 저장
     */
    const saveLocation = (type) => {
        const isHome =
            type === 'home';

        const place =
            isHome
                ? homePlace
                : companyPlace;

        const text =
            isHome
                ? homeText
                : companyText;

        const label =
            isHome
                ? '집'
                : '회사';


        if (!text.trim()) {
            setMessage(
                `${label}을 검색해서 장소를 선택해주세요.`
            );

            return;
        }


        if (!place) {
            setMessage(
                `${label}은 검색 결과에서 장소를 선택한 후 저장해주세요.`
            );

            return;
        }


        const newLocations = {
            ...savedLocations,
            [type]: place
        };


        try {
            localStorage.setItem(
                SAVED_LOCATIONS_KEY,
                JSON.stringify(
                    newLocations
                )
            );

            setSavedLocations(
                newLocations
            );

            setMessage(
                `${label}이 저장되었습니다.`
            );
        } catch (error) {
            console.error(
                `${label} 정보를 저장하지 못했습니다.`,
                error
            );

            setMessage(
                `${label} 저장 중 오류가 발생했습니다.`
            );
        }
    };


    /**
     * 집 / 회사 설정 해제
     */
    const removeLocation = (type) => {
        const isHome =
            type === 'home';

        const label =
            isHome
                ? '집'
                : '회사';


        const newLocations = {
            ...savedLocations,
            [type]: null
        };


        try {
            localStorage.setItem(
                SAVED_LOCATIONS_KEY,
                JSON.stringify(
                    newLocations
                )
            );

            setSavedLocations(
                newLocations
            );


            if (isHome) {
                setHomeText('');
                setHomePlace(null);
            } else {
                setCompanyText('');
                setCompanyPlace(null);
            }


            setMessage(
                `${label} 설정이 해제되었습니다.`
            );
        } catch (error) {
            console.error(
                `${label} 정보를 삭제하지 못했습니다.`,
                error
            );
        }
    };


    return (
        <div className="bg-gray-50 min-h-screen pb-10">
            <TopNavBar title="마이페이지" />

            <div className="p-6">

                {/* 프로필 요약 카드 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 flex items-center gap-4">
                    <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-2xl">
                        😎
                    </div>

                    <div>
                        <h3 className="font-bold text-lg text-gray-800">
                            {profileName} 님
                        </h3>

                        {profile ? (
                            <p className="text-sm text-gray-500">
                                {profileAge}세
                                {' · '}
                                {genderLabel}
                                {' · '}
                                {carTypeLabel} 오너
                            </p>
                        ) : (
                            <p className="text-sm text-gray-500">
                                프로필을 설정해 주세요.
                            </p>
                        )}
                    </div>
                </div>


                {/* 집 / 회사 설정 */}
                <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">

                    <div className="mb-6">
                        <h3 className="font-bold text-lg text-gray-800">
                            자주 가는 장소
                        </h3>

                        <p className="text-sm text-gray-500 mt-1">
                            선택사항입니다. 설정하면 홈에서 집·회사 버튼을 사용할 수 있어요.
                        </p>
                    </div>


                    {/* 집 */}
                    <div className="mb-7">
                        <div className="flex items-center justify-between mb-2">
                            <label className="font-bold text-gray-700">
                                🏠 집
                            </label>

                            {savedLocations.home && (
                                <span className="text-xs font-bold text-indigo-600">
                                    설정됨
                                </span>
                            )}
                        </div>

                        <PlaceInput
                            icon="🏠"
                            placeholder="집 주소 또는 장소 검색"
                            text={homeText}
                            onTextChange={(value) => {
                                setHomeText(
                                    value
                                );

                                if (
                                    value !==
                                    savedLocations
                                        .home
                                        ?.name
                                ) {
                                    setHomePlace(
                                        null
                                    );
                                }

                                setMessage('');
                            }}
                            onSelect={(place) => {
                                setHomePlace(
                                    place
                                );

                                setMessage('');
                            }}
                        />

                        {savedLocations.home
                            ?.address && (
                            <p className="mt-2 px-1 text-xs text-gray-400">
                                저장된 주소:{' '}
                                {
                                    savedLocations
                                        .home
                                        .address
                                }
                            </p>
                        )}

                        <div className="flex gap-2 mt-3">
                            <button
                                type="button"
                                onClick={() =>
                                    saveLocation(
                                        'home'
                                    )
                                }
                                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition"
                            >
                                집 저장
                            </button>

                            {savedLocations.home && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        removeLocation(
                                            'home'
                                        )
                                    }
                                    className="px-4 py-3 rounded-xl border border-gray-200 text-gray-500 font-bold bg-white hover:bg-gray-50 transition"
                                >
                                    해제
                                </button>
                            )}
                        </div>
                    </div>


                    {/* 회사 */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="font-bold text-gray-700">
                                🏢 회사
                            </label>

                            {savedLocations.company && (
                                <span className="text-xs font-bold text-indigo-600">
                                    설정됨
                                </span>
                            )}
                        </div>

                        <PlaceInput
                            icon="🏢"
                            placeholder="회사 주소 또는 장소 검색"
                            text={companyText}
                            onTextChange={(value) => {
                                setCompanyText(
                                    value
                                );

                                if (
                                    value !==
                                    savedLocations
                                        .company
                                        ?.name
                                ) {
                                    setCompanyPlace(
                                        null
                                    );
                                }

                                setMessage('');
                            }}
                            onSelect={(place) => {
                                setCompanyPlace(
                                    place
                                );

                                setMessage('');
                            }}
                        />

                        {savedLocations.company
                            ?.address && (
                            <p className="mt-2 px-1 text-xs text-gray-400">
                                저장된 주소:{' '}
                                {
                                    savedLocations
                                        .company
                                        .address
                                }
                            </p>
                        )}

                        <div className="flex gap-2 mt-3">
                            <button
                                type="button"
                                onClick={() =>
                                    saveLocation(
                                        'company'
                                    )
                                }
                                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition"
                            >
                                회사 저장
                            </button>

                            {savedLocations.company && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        removeLocation(
                                            'company'
                                        )
                                    }
                                    className="px-4 py-3 rounded-xl border border-gray-200 text-gray-500 font-bold bg-white hover:bg-gray-50 transition"
                                >
                                    해제
                                </button>
                            )}
                        </div>
                    </div>


                    {message && (
                        <p className="mt-4 text-sm font-semibold text-indigo-600">
                            {message}
                        </p>
                    )}
                </div>


                {/* 메뉴 */}
                <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">

                    <div
                        className="p-5 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                        onClick={() =>
                            navigate(
                                '/profile',
                                {
                                    state: {
                                        fromMyPage:
                                            true
                                    }
                                }
                            )
                        }
                    >
                        <span className="font-bold text-gray-700">
                            프로필 수정
                        </span>

                        <span className="text-gray-400">
                            →
                        </span>
                    </div>


                    <div
                        className="p-5 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                        onClick={() =>
                            navigate(
                                '/S7a_history'
                            )
                        }
                    >
                        <span className="font-bold text-gray-700">
                            주행 기록 및 피드백 내역
                        </span>

                        <span className="text-gray-400">
                            →
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}