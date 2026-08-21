"""ASGI 진입점. 경로 처리 이유는 wsgi.py 주석 참고."""
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

from django.core.asgi import get_asgi_application  # noqa: E402  (경로 설정 후 import)

application = get_asgi_application()
