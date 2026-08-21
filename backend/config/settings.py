"""NeoNavi 백엔드 설정.

기본값은 로컬 개발용이고, 배포에서는 환경변수로 덮어쓴다. 환경변수를 하나도
주지 않으면 지금까지와 똑같이 동작한다(팀원 로컬 실행이 안 깨지도록).

배포 시 지정할 것:
  DJANGO_SECRET_KEY   필수. 기본값은 공개된 문자열이라 그대로 쓰면 안 된다.
  DJANGO_DEBUG=0      필수. 켜두면 예외 화면에 코드·설정이 노출된다.
  DJANGO_ALLOWED_HOSTS  배포 도메인 (쉼표 구분)
  CORS_ALLOWED_ORIGINS  프론트 주소 (쉼표 구분). 안 주면 전체 허용으로 남는다.
"""
import os
import sys
from pathlib import Path


def _env_list(name: str) -> list:
    """쉼표로 구분된 환경변수 → 리스트. 빈 값이면 []."""
    raw = os.environ.get(name, '')
    return [v.strip() for v in raw.split(',') if v.strip()]

BASE_DIR = Path(__file__).resolve().parent.parent

# 레포 루트를 path 에 추가 → `import ai.inference` 가능 (ai 를 라이브러리로 사용)
REPO_ROOT = BASE_DIR.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'dev-secret-key-change-me')
DEBUG = os.environ.get('DJANGO_DEBUG', '1') not in ('0', 'false', 'False')
# DEBUG=False 인데 ALLOWED_HOSTS 가 비면 Django 가 모든 요청을 400 으로 막는다.
# 환경변수를 안 준 배포에서 원인 찾기 어려운 실패가 되므로 기본값을 남겨 둔다.
ALLOWED_HOSTS = _env_list('DJANGO_ALLOWED_HOSTS') or ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # 3rd party
    'rest_framework',
    'corsheaders',
    # local apps
    'apps.users',
    'apps.routes',
    'apps.trips',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# 개발 단계: sqlite. 배포 시 PostgreSQL로 전환.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# 프론트 연동. 배포에서는 CORS_ALLOWED_ORIGINS 로 프론트 주소만 허용한다.
# (지정하지 않으면 개발처럼 전체 허용 — 로컬 실행이 안 깨지도록)
CORS_ALLOWED_ORIGINS = _env_list('CORS_ALLOWED_ORIGINS')
CORS_ALLOW_ALL_ORIGINS = not CORS_ALLOWED_ORIGINS
# 배포 도메인에서 오는 POST 는 CSRF 신뢰 목록에도 있어야 한다.
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

LANGUAGE_CODE = 'ko-kr'
TIME_ZONE = 'Asia/Seoul'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
