import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandMark from '../components/BrandMark';

import TopNavBar from '../components/TopNavBar';
import PlaceInput from '../components/PlaceInput';

const TRIP_STORAGE_KEY = 'neonaviTrip';
const RECENT_TRIP_KEY = 'neonaviRecentTrip';
const SAVED_LOCATIONS_KEY = 'neonaviSavedLocations';

/**
 * 최근 검색 경로 불러오기
 */
const getRecentTrip = () => {
    try {
        const savedTrip = localStorage.getItem(RECENT_TRIP_KEY);

        if (!savedTrip) {
            return null;
        }

        return JSON.parse(savedTrip);
    } catch (error) {
        console.error(
            '최근 경로를 불러오지 못했습니다.',
            error
        );

        return null;
    }
};

/**
 * 마이페이지에서 저장한 집 / 회사 불러오기
 */
const getSavedLocations = () => {
    try {
        const saved = localStorage.getItem(
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

const Header = () => {
    const navigate = useNavigate();

    return (
        <div className="header mt-2">
            <div className="logo-section">
                <BrandMark size={36} />

                <h1 className="logo-text">
                    너네비
                </h1>
            </div>

            <button
                type="button"
                className="mypage-btn"
                onClick={() => navigate('/mypage')}
            >
                <span className="user-icon">
                    👤
                </span>

                <span>
                    마이페이지
                </span>
            </button>
        </div>
    );
};

export default function S2_Home() {
    const navigate = useNavigate();

    const [departure, setDeparture] = useState('');
    const [destination, setDestination] = useState('');

    // 검색 목록에서 선택한 실제 장소
    const [departurePlace, setDeparturePlace] =
        useState(null);

    const [destinationPlace, setDestinationPlace] =
        useState(null);

    // 동승자 / 짐
    const [passenger, setPassenger] =
        useState('혼자');

    const [loadKg, setLoadKg] =
        useState(0);

    const [errorMessage, setErrorMessage] =
        useState('');

    // 최근 검색 경로
    const [recentTrip, setRecentTrip] =
        useState(getRecentTrip);

    // 저장된 집 / 회사
    const [savedLocationData] =
        useState(getSavedLocations);

    /**
     * 경로 찾기
     */
    const handleFindRoute = () => {
        const trimmedDeparture = departure.trim();
        const trimmedDestination = destination.trim();

        if (!trimmedDeparture || !trimmedDestination) {
            setErrorMessage(
                '출발지와 도착지를 모두 입력해주세요.'
            );

            return;
        }

        const tripData = {
            departure: trimmedDeparture,
            destination: trimmedDestination,

            departurePlace,
            destinationPlace,

            passenger,
            loadKg
        };

        try {
            // 현재 검색 경로
            sessionStorage.setItem(
                TRIP_STORAGE_KEY,
                JSON.stringify(tripData)
            );

            // 최근 검색 경로 저장
            const recentTripData = {
                departure: trimmedDeparture,
                destination: trimmedDestination,

                departurePlace,
                destinationPlace
            };

            localStorage.setItem(
                RECENT_TRIP_KEY,
                JSON.stringify(recentTripData)
            );

            setRecentTrip(recentTripData);
        } catch (error) {
            console.error(
                '경로 정보를 저장하지 못했습니다.',
                error
            );
        }

        setErrorMessage('');

        navigate('/option', {
            state: tripData
        });
    };

    /**
     * 집 / 회사 / 최근 경로 버튼
     */
    const handleSavedLocation = (location) => {

        // 최근 검색 경로
        if (location.type === 'recent') {
            setDeparture(location.departure);
            setDestination(location.destination);

            setDeparturePlace(
                location.departurePlace || null
            );

            setDestinationPlace(
                location.destinationPlace || null
            );

            setErrorMessage('');

            return;
        }

        // 출발지로 사용할 저장 장소
        if (location.type === 'departure') {
            setDeparture(location.value);

            setDeparturePlace(
                location.place || null
            );

            setErrorMessage('');

            return;
        }

        // 도착지로 사용할 저장 장소
        if (location.type === 'destination') {
            setDestination(location.value);

            setDestinationPlace(
                location.place || null
            );

            setErrorMessage('');
        }
    };

    /**
     * 홈에 표시할 버튼
     *
     * 집 / 회사는 마이페이지에서 설정한 경우에만 표시
     */
    const savedLocations = [

        ...(savedLocationData.home
            ? [
                  {
                      id: 'home',
                      label: '🏠 집',
                      value:
                          savedLocationData.home.name,
                      place:
                          savedLocationData.home,
                      type: 'destination'
                  }
              ]
            : []),

        ...(savedLocationData.company
            ? [
                  {
                      id: 'company',
                      label: '🏢 회사',
                      value:
                          savedLocationData.company.name,
                      place:
                          savedLocationData.company,
                      type: 'destination'
                  }
              ]
            : []),

        ...(recentTrip?.departure &&
        recentTrip?.destination
            ? [
                  {
                      id: 'recent',

                      label:
                          `최근: ${recentTrip.departure}` +
                          ` → ${recentTrip.destination}`,

                      departure:
                          recentTrip.departure,

                      destination:
                          recentTrip.destination,

                      departurePlace:
                          recentTrip.departurePlace,

                      destinationPlace:
                          recentTrip.destinationPlace,

                      type: 'recent'
                  }
              ]
            : [])
    ];

    return (
        <>
            <TopNavBar backTo="/" />

            <div
                className="page-content"
                style={{
                    paddingBottom: '80px'
                }}
            >
                <Header />

                <div className="title-subtitle-section">
                    <h2 className="main-title">
                        오늘 어디로 가세요?
                    </h2>

                    <p className="main-subtitle">
                        출발지와 도착지를 입력하면,
                        <br />
                        너에게 꼭 맞는 길을 찾아드려요.
                    </p>
                </div>

                {/* 출발지 */}
                <div className="mb-3">
                    <PlaceInput
                        icon="📍"
                        placeholder="출발지"
                        text={departure}
                        onTextChange={(value) => {
                            setDeparture(value);

                            // 직접 글자를 수정했다면
                            // 기존 좌표 선택값 제거
                            if (
                                value !==
                                departurePlace?.name
                            ) {
                                setDeparturePlace(null);
                            }

                            setErrorMessage('');
                        }}
                        onSelect={(place) => {
                            setDeparturePlace(place);
                            setErrorMessage('');
                        }}
                    />
                </div>

                {/* 도착지 */}
                <div className="mb-3">
                    <PlaceInput
                        icon="🏁"
                        placeholder="도착지"
                        text={destination}
                        onTextChange={(value) => {
                            setDestination(value);

                            if (
                                value !==
                                destinationPlace?.name
                            ) {
                                setDestinationPlace(null);
                            }

                            setErrorMessage('');
                        }}
                        onSelect={(place) => {
                            setDestinationPlace(place);
                            setErrorMessage('');
                        }}
                    />
                </div>

                {/* 저장 장소 / 최근 경로 */}
                {savedLocations.length > 0 && (
                    <div className="saved-locations-row">
                        {savedLocations.map(
                            (location) => (
                                <button
                                    key={
                                        location.id
                                    }
                                    type="button"
                                    className="location-tag"
                                    onClick={() =>
                                        handleSavedLocation(
                                            location
                                        )
                                    }
                                >
                                    {location.label}
                                </button>
                            )
                        )}
                    </div>
                )}

                {/* 동승자 선택 */}
                <div className="mt-8 mb-4 px-1">
                    <label className="block text-sm font-bold text-gray-700 mb-3">
                        누구와 함께 가시나요?
                    </label>

                    <div className="flex gap-2">
                        {[
                            '혼자',
                            '가족',
                            '노약자',
                            '친구'
                        ].map((item) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() =>
                                    setPassenger(item)
                                }
                                className={`
                                    flex-1
                                    py-3
                                    rounded-xl
                                    text-sm
                                    font-bold
                                    transition
                                    ${
                                        passenger ===
                                        item
                                            ? 'bg-brand-600 text-white shadow-md'
                                            : 'border border-gray-200 text-gray-600 bg-white'
                                    }
                                `}
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 짐 정도 */}
                <div className="mt-6 mb-4 px-1">
                    <label className="block text-sm font-bold text-gray-700 mb-3">
                        짐은 얼마나 싣나요?

                        <span className="text-brand-600 ml-2">
                            {loadKg} kg
                        </span>
                    </label>

                    <div className="flex gap-2">
                        {[
                            {
                                label: '거의 없음',
                                value: 0
                            },
                            {
                                label: '보통',
                                value: 30
                            },
                            {
                                label: '많음',
                                value: 70
                            }
                        ].map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                onClick={() =>
                                    setLoadKg(
                                        item.value
                                    )
                                }
                                className={`
                                    flex-1
                                    py-3
                                    rounded-xl
                                    text-sm
                                    font-bold
                                    transition
                                    ${
                                        loadKg ===
                                        item.value
                                            ? 'bg-brand-600 text-white shadow-md'
                                            : 'border border-gray-200 text-gray-600 bg-white'
                                    }
                                `}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 오류 메시지 */}
                {errorMessage && (
                    <p className="mt-3 px-1 text-sm font-semibold text-red-500">
                        {errorMessage}
                    </p>
                )}

                {/* 경로 찾기 */}
                <button
                    type="button"
                    className="pathfind-button mt-4"
                    onClick={handleFindRoute}
                >
                    경로 찾기
                </button>
            </div>

            <div className="device-footer">
                <div className="footer-panel">
                    너네비: 경로 입력
                </div>
            </div>
        </>
    );
}