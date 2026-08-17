import React, { useEffect, useRef, useState } from 'react';

import { searchPlaces } from '../api/naviApi';

/**
 * 장소 입력 + 검색 결과 선택
 *
 * - 사용자가 직접 입력할 때만 장소 검색 실행
 * - 최근 기록 클릭으로 자동 입력될 때는 검색 목록 안 뜸
 * - 집 / 회사 버튼으로 자동 입력될 때는 검색 목록 안 뜸
 * - 마이페이지에 저장된 집 / 회사가 처음 표시될 때도 검색 목록 안 뜸
 * - 검색 결과에서 장소를 선택한 뒤에도 다시 검색하지 않음
 */
export default function PlaceInput({
    icon,
    placeholder,
    text,
    onTextChange,
    onSelect
}) {
    const [places, setPlaces] = useState([]);
    const [isOpen, setIsOpen] = useState(false);

    // 사용자가 직접 키보드로 입력한 경우에만 true
    const shouldSearchRef = useRef(false);

    useEffect(() => {
        /**
         * text가 변경됐더라도 사용자가 직접 입력한 게 아니면
         * 자동완성 검색을 실행하지 않는다.
         *
         * 예:
         * - 최근 경로 클릭
         * - 집 / 회사 버튼 클릭
         * - 마이페이지 처음 진입
         * - 검색 결과에서 장소 선택
         */
        if (!shouldSearchRef.current) {
            setPlaces([]);
            setIsOpen(false);
            return undefined;
        }

        // 이번 입력에 대한 검색을 시작했으므로 다시 false
        shouldSearchRef.current = false;

        const query = (text || '').trim();

        // 두 글자 미만은 검색하지 않음
        if (query.length < 2) {
            setPlaces([]);
            setIsOpen(false);
            return undefined;
        }

        let isActive = true;

        // 300ms 동안 추가 입력이 없으면 검색
        const timer = setTimeout(async () => {
            try {
                const results = await searchPlaces(query);

                if (!isActive) {
                    return;
                }

                const resultList = Array.isArray(results)
                    ? results
                    : [];

                setPlaces(resultList);
                setIsOpen(resultList.length > 0);
            } catch (error) {
                if (!isActive) {
                    return;
                }

                console.error(
                    '장소 검색에 실패했습니다.',
                    error
                );

                setPlaces([]);
                setIsOpen(false);
            }
        }, 300);

        return () => {
            isActive = false;
            clearTimeout(timer);
        };
    }, [text]);

    /**
     * 사용자가 직접 입력창에 글자를 입력한 경우
     */
    const handleInputChange = (event) => {
        const value = event.target.value;

        // 직접 입력이므로 다음 useEffect에서 검색 허용
        shouldSearchRef.current = true;

        onTextChange(value);

        // 글자를 수정했으므로 기존에 선택한 장소 좌표는 해제
        onSelect(null);

        // 전부 지웠다면 기존 결과도 바로 닫기
        if (!value.trim()) {
            setPlaces([]);
            setIsOpen(false);
        }
    };

    /**
     * 검색 결과에서 장소 선택
     */
    const handleSelect = (place) => {
        // 검색 결과 선택으로 text가 변경되는 것은
        // 새 검색으로 취급하지 않는다.
        shouldSearchRef.current = false;

        onTextChange(place.name);
        onSelect(place);

        setPlaces([]);
        setIsOpen(false);
    };

    return (
        <div className="relative">

            {/* 입력창 */}
            <div className="flex items-center bg-white border border-gray-200 rounded-2xl px-4 py-3">

                <span className="mr-3">
                    {icon}
                </span>

                <input
                    type="text"
                    value={text || ''}
                    placeholder={placeholder}
                    onChange={handleInputChange}
                    className="flex-1 outline-none text-gray-900 font-medium bg-transparent"
                />

            </div>

            {/* 장소 자동완성 목록 */}
            {isOpen && places.length > 0 && (
                <ul className="absolute z-40 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-60 overflow-y-auto">

                    {places.map((place) => (
                        <li
                            key={`${place.name}-${place.lng}-${place.lat}`}
                        >
                            <button
                                type="button"
                                onClick={() => handleSelect(place)}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                            >

                                <p className="font-bold text-gray-900 text-sm">
                                    {place.name}
                                </p>

                                {place.address && (
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {place.address}
                                    </p>
                                )}

                            </button>
                        </li>
                    ))}

                </ul>
            )}

        </div>
    );
}