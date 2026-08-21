"""WSGI 진입점.

⚠️ **실행 위치에 의존하면 안 된다.** DJANGO_SETTINGS_MODULE 이 'config.settings'
라서 backend/ 가 sys.path 에 있어야 하는데, 로컬에서는 backend/manage.py 를
실행하니 파이썬이 알아서 넣어 준다. 반면 배포(Vercel)는 레포 최상단에서 이
파일을 직접 import 하므로 backend/ 가 경로에 없고,
`ModuleNotFoundError: No module named 'config'` 로 앱 전체가 뜨지 않는다.
그래서 여기서 직접 넣는다.
"""
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

from django.core.wsgi import get_wsgi_application  # noqa: E402  (경로 설정 후 import)

application = get_wsgi_application()
