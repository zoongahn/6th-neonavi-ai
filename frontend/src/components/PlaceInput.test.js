import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import PlaceInput from './PlaceInput';
import { searchPlaces } from '../api/naviApi';

jest.mock('../api/naviApi', () => ({
    searchPlaces: jest.fn(),
}));

const RESULTS = [
    { name: '강남역 2호선', address: '서울 강남구', lng: 127.028, lat: 37.498 },
    { name: '강남역 신분당선', address: '서울 강남구', lng: 127.027, lat: 37.497 },
];

/** 실제 사용처(S2_Home)처럼 부모가 text 를 들고 있는 형태 */
function Harness({ initialText = '' }) {
    const [text, setText] = useState(initialText);
    return (
        <>
            <PlaceInput
                icon="pin"
                placeholder="출발지"
                text={text}
                onTextChange={setText}
                onSelect={() => {}}
            />
            {/* 최근 경로 버튼처럼 부모가 값을 밀어 넣는 경우 */}
            <button type="button" onClick={() => setText('홍대입구역')}>
                최근 경로
            </button>
        </>
    );
}

const flushDebounce = async () => {
    await act(async () => {
        jest.advanceTimersByTime(400);
    });
};

beforeEach(() => {
    jest.useFakeTimers();
    searchPlaces.mockReset();
    searchPlaces.mockResolvedValue(RESULTS);
});

afterEach(() => jest.useRealTimers());

describe('PlaceInput', () => {
    it('사용자가 직접 치면 검색하고 후보를 연다', async () => {
        render(<Harness />);
        fireEvent.change(screen.getByPlaceholderText('출발지'), {
            target: { value: '강남역' },
        });
        await flushDebounce();

        expect(searchPlaces).toHaveBeenCalledWith('강남역');
        expect(screen.getByText('강남역 2호선')).toBeInTheDocument();
    });

    it('부모가 값을 넣으면(최근 경로) 검색하지 않고 드롭다운도 열지 않는다', async () => {
        // 이게 이 테스트의 존재 이유다. 최근 경로를 고르면 출발지·도착지 드롭다운이
        // 뜬금없이 열리던 회귀를 막는다.
        render(<Harness />);
        fireEvent.click(screen.getByText('최근 경로'));
        await flushDebounce();

        expect(searchPlaces).not.toHaveBeenCalled();
        expect(screen.queryByText('강남역 2호선')).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText('출발지')).toHaveValue('홍대입구역');
    });

    it('검색 결과가 열려 있어도 최근 경로를 고르면 닫힌다', async () => {
        render(<Harness />);
        fireEvent.change(screen.getByPlaceholderText('출발지'), {
            target: { value: '강남역' },
        });
        await flushDebounce();
        expect(screen.getByText('강남역 2호선')).toBeInTheDocument();

        fireEvent.click(screen.getByText('최근 경로'));
        await flushDebounce();

        expect(screen.queryByText('강남역 2호선')).not.toBeInTheDocument();
        expect(searchPlaces).toHaveBeenCalledTimes(1);   // 추가 검색 없음
    });

    it('후보를 고르면 그 이름으로 재검색하지 않는다', async () => {
        render(<Harness />);
        fireEvent.change(screen.getByPlaceholderText('출발지'), {
            target: { value: '강남역' },
        });
        await flushDebounce();

        fireEvent.click(screen.getByText('강남역 2호선'));
        await flushDebounce();

        expect(searchPlaces).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('강남역 신분당선')).not.toBeInTheDocument();
    });

    it('두 글자 미만이면 검색하지 않는다', async () => {
        render(<Harness />);
        fireEvent.change(screen.getByPlaceholderText('출발지'), {
            target: { value: '강' },
        });
        await flushDebounce();

        expect(searchPlaces).not.toHaveBeenCalled();
    });
});
