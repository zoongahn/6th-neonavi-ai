# 로컬 실행 가이드

각자 자기 컴퓨터에서 너네비를 띄우는 방법. 처음 한 번만 하면 된다.

> **먼저 받아야 할 것** (레포에 없음 — 안중현에게 요청)
> **설정 묶음** `neonavi-setup-키포함-DM전용.zip` (17MB)
> — API 키 2개 + 학습된 모델 + 도로·신호 전처리 캐시가 모두 들어 있다.
>
> ⚠️ 키가 들어 있으니 **개인 메시지로만** 주고받을 것. 공개 드라이브·단톡방에 올리지 말 것.
> (키는 공개 저장소에 올릴 수 없어 레포에 넣지 않았다)

> 아래 명령은 **macOS/Linux** 와 **Windows** 를 나눠 적었다. 자기 환경 것만 따라가면 된다.
> Windows 는 **PowerShell** 기준이다(명령 프롬프트 아님).

---

## 0. 준비물
- Python 3.11 이상 · Node.js 18 이상 · Git
- Windows: Python 설치 시 **"Add Python to PATH"** 체크할 것

## 1. 레포 받기
```bash
git clone git@github.com:gdg-hongik-univ-program/6th-neonavi-ai.git
cd 6th-neonavi-ai
git checkout feat/ai-fe-integration
```

## 2. 설정 묶음 풀기
받은 zip을 **레포 최상단**(`6th-neonavi-ai` 폴더)에서 푼다.
레포와 같은 폴더 구조라 키 파일과 데이터가 알아서 제자리로 들어간다.

- macOS/Linux: `unzip neonavi-setup-키포함-DM전용.zip`
- Windows: 파일 탐색기에서 zip 우클릭 → **"압축 풀기"** → 대상 폴더를 **레포 최상단**으로 지정

확인 — 아래 4개가 있어야 한다:
```
.env                                          (카카오 REST 키)
frontend/.env                                 (카카오 JavaScript 키)
ai/data/model_a.pt                            (학습된 모델)
ai/data/public/derived/                       (도로·신호 캐시)
```

> **Windows 주의**: 탐색기에서 `.env` 같은 점(.)으로 시작하는 파일이 안 보일 수 있다.
> 보기 탭 → **"숨긴 항목"** 체크하면 보인다.
>
> zip 없이 직접 만들 경우엔 `.env.example` 두 개를 복사해 키를 채우면 된다.
> (메모장으로 저장하면 `.env.txt` 가 되기 쉬우니, 파일 형식을 **"모든 파일"** 로 바꿀 것)

## 3. 파이썬 환경 만들기

**macOS / Linux**
```bash
python3 -m venv .venv
.venv/bin/pip install -r ai/requirements.txt
.venv/bin/pip install -r backend/requirements.txt
```

**Windows (PowerShell)**
```powershell
python -m venv .venv
.venv\Scripts\pip install -r ai\requirements.txt
.venv\Scripts\pip install -r backend\requirements.txt
```

> 추천 모델(PyTorch)과 지도 데이터 처리 라이브러리를 받느라 **10분 정도, 약 1GB** 걸린다.

## 4. 데이터베이스 준비 (처음 한 번)

**macOS / Linux**
```bash
cd backend
../.venv/bin/python manage.py migrate
cd ..
```

**Windows (PowerShell)**
```powershell
cd backend
..\.venv\Scripts\python manage.py migrate
cd ..
```

## 5. 프론트엔드 패키지 설치
```bash
cd frontend
npm install
cd ..
```

---

## 실행 (터미널 2개)

**터미널 1 — 백엔드**

macOS / Linux
```bash
cd backend
../.venv/bin/python manage.py runserver
```
Windows (PowerShell)
```powershell
cd backend
..\.venv\Scripts\python manage.py runserver
```

**터미널 2 — 프론트엔드** (공통)
```bash
cd frontend
npm start
```

브라우저에서 **http://localhost:3000** 접속.

> 반드시 `localhost:3000`으로 접속할 것. 다른 주소(IP 등)는 카카오 지도 키에 등록되어 있지 않아 지도가 뜨지 않는다.

---

## 확인 순서
1. 기본 정보 입력 → "다음으로"
2. 출발지·도착지 입력 → 검색 목록에서 선택
3. "경로 찾기" → "분석하고 경로 추천받기"
4. 지도에 경로가 그려지고 추천 카드가 뜨면 성공

첫 추천은 **20~30초** 걸릴 수 있다(도로·신호 데이터를 처음 메모리에 올리는 시간). 이후로는 빨라진다.

---

## 자주 겪는 문제

| 증상 | 원인 / 해결 |
|---|---|
| 지도가 회색이고 "지도를 표시할 수 없습니다" | `frontend/.env` 가 있는지 확인 → **있는데도 안 되면 `npm start` 재시작** (.env는 시작할 때만 읽음) |
| "경로를 불러오지 못했습니다" | 백엔드가 떠 있는지 확인 (터미널 1) |
| "추천 모델을 불러오지 못했습니다" | 2단계 압축 해제 확인 (`ai/data/model_a.pt` 있는지) |
| `KAKAO_REST_API_KEY 없음` | 레포 최상단에 `.env` 가 있는지 확인. Windows 면 파일명이 `.env.txt` 가 아닌지도 확인 |
| 압축을 풀었는데 파일이 안 보임 | 푼 위치가 레포 최상단이 맞는지 확인. Windows 는 탐색기 "숨긴 항목" 체크 |
| 추천이 계속 로딩 중 | 첫 요청은 20~30초 정상. 그 이상이면 터미널 1의 에러 확인 |
| (Windows) `python` 을 찾을 수 없음 | Python 재설치 시 "Add Python to PATH" 체크, 또는 `py -3 -m venv .venv` 로 시도 |
| (Windows) `npm start` 후 화면이 안 뜸 | 방화벽 팝업이 떴는지 확인 후 허용 |

## 참고
- 경사(언덕) 데이터는 없어도 동작한다. 외부 API로 대신 가져오며 하루 요청 한도가 있다. 정밀하게 쓰려면 DEM 파일(278MB)을 따로 요청할 것.
- 설계 문서는 노션 "너네비 AI 설계문서" 참고.
