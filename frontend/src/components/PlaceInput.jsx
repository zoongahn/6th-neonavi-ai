import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

import { searchPlaces } from '../api/naviApi';

/**
 * 장소 입력 + 검색 결과 선택.
 *
 * "강남역"처럼 모호하게 입력하면 후보(강남역 2호선 / 신분당선 / 사거리…)를 보여주고
 * 사용자가 직접 고르게 한다. 고른 장소의 좌표를 함께 전달해 지점을 확정한다.
 *
 * - 사용자가 **직접 친** 경우에만 검색한다.
 * - 최근 경로·집·회사 버튼, 마이페이지 저장값 초기 표시처럼 부모가 값을 넣어 준
 *   경우엔 후보를 띄우지 않는다.
 * - 검색 결과에서 고른 뒤에도 그 이름으로 다시 검색하지 않는다.
 *
 * @param {string} icon         입력칸 앞 아이콘 이름 (Icon.jsx 키)
 * @param {string} placeholder
 * @param {string} text         입력창에 보이는 글자(부모가 최근 경로 등으로 바꿀 수 있다)
 * @param {func}   onTextChange 글자가 바뀔 때
 * @param {func}   onSelect     후보를 골랐을 때 ({name, address, lng, lat})
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
        사용자가 **직접 친** 마지막 글자.

        검색 effect 는 `text` 가 바뀌면 도는데, `text` 는 부모가 프로그램으로도
        바꾼다(최근 경로·집·회사 버튼, 마이페이지 저장값 초기 표시). 그걸 구분하지
        못해서 최근 경로를 고르면 출발지·도착지 드롭다운이 뜬금없이 열렸다.
        지금 보이는 글자가 사용자가 친 그 글자일 때만 검색한다.
    */
    const typedTextRef = useRef(null);

    // 입력이 멈추면(300ms) 검색한다.
    useEffect(() => {
        if (text !== typedTextRef.current) {
            // 부모가 넣어 준 값(최근 경로 선택, 후보 선택 후 확정 등) → 검색하지 않는다
            setPlaces([]);
            setIsOpen(false);
            return undefined;
        }

        const query = (text || '').trim();
        if (query.length < 2) {
            setPlaces([]);
            setIsOpen(false);
            return undefined;
        }

        let isActive = true;
        const timer = setTimeout(async () => {
            try {
                const results = await searchPlaces(query);
                if (!isActive) return;

                // 검색이 실패하거나 형식이 다르면 목록을 비운다(렌더에서 터지지 않게)
                const list = Array.isArray(results) ? results : [];
                setPlaces(list);
                setIsOpen(list.length > 0);
            } catch (error) {
                if (!isActive) return;
                console.error('장소 검색에 실패했습니다.', error);
                setPlaces([]);
                setIsOpen(false);
            }
        }, 300);

        return () => {
            isActive = false;
            clearTimeout(timer);
        };
    }, [text]);

    /** 사용자가 직접 글자를 친 경우 */
    const handleInputChange = (event) => {
        const value = event.target.value;

        typedTextRef.current = value;   // 이 글자에 대해서만 검색을 허용한다
        onTextChange(value);
        onSelect(null);                 // 글자를 고치면 확정 해제

        // 전부 지웠으면 남아 있던 후보도 바로 닫는다
        if (!value.trim()) {
            setPlaces([]);
            setIsOpen(false);
        }
    };

    const handleSelect = (place) => {
        // 선택으로 바뀐 글자는 '사용자가 친 글자'가 아니므로 재검색되지 않는다
        onTextChange(place.name);
        onSelect(place);
        setPlaces([]);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <div className="flex items-center bg-white border border-gray-200 rounded-2xl px-4 py-3">
                <span className="mr-3 text-gray-400 flex-none">
                    <Icon name={icon} size={20} />
                </span>
                <input
                    type="text"
                    value={text}
                    placeholder={placeholder}
                    onChange={handleInputChange}
                    onFocus={() => setIsOpen(places.length > 0)}
                    className="flex-1 outline-none text-gray-900 font-medium bg-transparent"
                />
            </div>

            {isOpen && (
                <ul className="absolute z-40 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-60 overflow-y-auto">
                    {places.map((place) => (
                        <li key={`${place.name}-${place.lng}-${place.lat}`}>
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
