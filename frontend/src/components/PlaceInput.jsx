import React, { useEffect, useRef, useState } from 'react';

import { searchPlaces } from '../api/naviApi';

/**
 * 장소 입력 + 검색 결과 선택
 *
 * 사용자 직접 입력:
 * → 장소 검색 실행
 *
 * 최근 기록 / 집 / 회사 / 저장값 등 프로그램으로 text가 변경된 경우:
 * → 장소 검색 실행하지 않음
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

    /*
     * 이번 text 변경이
     * 사용자가 직접 키보드로 입력해서 발생한 것인지 구분
     */
    const shouldSearchRef = useRef(false);

    useEffect(() => {
        /*
         * 사용자의 직접 입력이 아닌 경우
         *
         * 예:
         * - 최근 경로 클릭
         * - 집 버튼 클릭
         * - 회사 버튼 클릭
         * - 마이페이지 진입 시 저장된 주소 표시
         *
         * 이 경우 자동완성 검색을 하지 않는다.
         */
        if (!shouldSearchRef.current) {
            setPlaces([]);
            setIsOpen(false);
            return undefined;
        }

        // 이번 사용자 입력에 대한 검색만 허용하고 초기화
        shouldSearchRef.current = false;

        const query = (text || '').trim();

        // 2글자 미만이면 검색하지 않음
        if (query.length < 2) {
            setPlaces([]);
            setIsOpen(false);
            return undefined;
        }

        let isActive = true;

        // 입력이 멈춘 뒤 300ms 후 검색
        const timer = setTimeout(async () => {
            try {
                const results = await searchPlaces(query);

                if (!isActive) return;

                setPlaces(results || []);
                setIsOpen(
                    Array.isArray(results) &&
                    results.length > 0
                );
            } catch (error) {
                if (!isActive) return;

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

    /*
     * 검색 결과에서 장소 선택
     */
    const handleSelect = (place) => {
        // 장소 선택으로 text가 바뀌는 것은
        // 새로운 검색으로 취급하지 않는다.
        shouldSearchRef.current = false;

        onTextChange(place.name);
        onSelect(place);

        setIsOpen(false);
        setPlaces([]);
    };

    return (
        <div className="relative">
            <div className="flex items-center bg-white border border-gray-200 setPlaces([]);
    };

    return (
        <div className="relative">
            <div className="flex items-center bg-white border border-gray-200 rounded-2xl px-4 py-3">

                <span className="mr-3">
                    {icon}
                </span>

                <input
                    type="text"
                    value={text}
                    placeholder={placeholder}

                    /*
                     * 여기서 발생하는 변경만
                     * "사용자가 직접 입력한 것"으로 처리
                     */
                    onChange={(event) => {
                        shouldSearchRef.current = true;

                        onTextChange(
                            event.target.value
                        );

                        // 직접 글자를 수정했으므로
                        // 기존 선택 장소 확정값 해제
                        onSelect(null);
                    }}

                    /*
                     * 단순히 입력칸을 클릭했다고 해서
                     * 이전 검색 결과를 다시 펼치지 않는다.
                     *
                     * 검색 결과는 사용자가 직접 입력했을 때만 표시
                     */
                    onFocus={() => {
                        // 의도적으로 아무 작업도 하지 않음
                    }}

                    className="flex-1 outline-none text-gray-900 font-medium bg-transparent"
                />

            </div>

            {isOpen && places.length > 0 && (
                <ul className="absolute z-40 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-60 overflow-y-auto">

                    {places.map((place) => (
                        <li
                            key={`${place.name}-${place.lng}-${place.lat}`}
                        >
                            <button
                                type="button"
                                onClick={() =>
                                    handleSelect(place)
                                }
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