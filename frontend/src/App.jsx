import React from 'react';
import './styles/App.css';
import './styles/page.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import S0 from './pages/S0_Onboarding'; // 온보딩
import S1 from './pages/S1_Profile'; // 회원, 프로필
import S2 from './pages/S2_Home'; // 메인 홈
import S3 from './pages/S3_RouteOption'; // 경로 옵션 설정
import S4 from './pages/S4_RouteResult'; // 경로 탐색 결과
import S5 from './pages/S5_Navigation'; // 주행 안내
import S6 from './pages/S6_Feedback'; // 주행 종료 후 피드백
import S7 from './pages/S7_MyPage'; // 마이페이지
import S7a from './pages/S7a_history'; // 주행 기록 및 피드백 내역
import RouteDetail from './pages/RouteDetail';
import FeedbackSaying from './pages/FeedbackSaying';




export default function App() {
  return (
    <div className="min-h-screen bg-gray-200 flex justify-center items-center">
      <div className="w-full max-w-lg h-screen bg-white relative shadow-2xl overflow-y-auto overflow-x-hidden">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<S0 />} />
            <Route path="/profile" element={<S1 />} />
            <Route path="/home" element={<S2 />} />
            <Route path="/option" element={<S3 />} />
            <Route path="/result" element={<S4 />} />
            <Route path="/navi" element={<S5 />} />
            <Route path="/feedback" element={<S6 />} />
            <Route path="/mypage" element={<S7 />} />
            <Route path="/S7a_history" element={<S7a />} />
            <Route path="/detail" element={<RouteDetail />} />
            <Route path="/saying" element={<FeedbackSaying />} />
          </Routes>
        </BrowserRouter>
      </div>
    </div>
  );
}