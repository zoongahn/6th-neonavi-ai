"""서빙에 필요한 데이터 내려받기 — 배포 빌드에서 한 번 실행한다.

    python -m ai.fetch_data

**왜 레포에 안 넣나.** 공공데이터 파생본이 27MB 다. git 은 모든 버전을 영구
보관하므로, 재수집할 때마다 히스토리에 27MB 씩 쌓인다. 그래서 GitHub Release
자산으로 두고 필요할 때 받는다(모델 교체를 코드 배포와 분리하는 것과 같은 이유).

받는 것 — 전부 원본에서 만든 파생본이고, 원본(1GB)은 수집 단계에만 쓴다.
  public/derived/links_5186.pkl        노드링크 STRtree (road_type·speed_limit)
  public/derived/signal_nodes_5186.pkl 신호등 노드
  elevation_cache.json                 좌표별 고도 캐시

⚠️ **체크섬을 반드시 본다.** 잘린 파일이 들어와도 pickle 이 그럴듯하게 읽히면
   공간조인이 조용히 틀린 값을 내고, 그건 추천 품질 저하로만 보여서 원인을
   찾기 어렵다. 받은 뒤 sha256 이 다르면 아예 실패시킨다.
"""
import hashlib
import os
import shutil
import sys
import tarfile
import tempfile
import urllib.request

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

# 재수집해 자산을 새로 올리면 이 둘을 같이 바꾼다.
RELEASE_TAG = 'data-v1'
ARCHIVE_SHA256 = 'fd753922b0292f125cbcdf3c8bd7b43e4d3bd652e095fbe405fcd525f1f9dc1c'

_REPO = os.environ.get('NEONAVI_REPO', 'gdg-hongik-univ-program/6th-neonavi-ai')
_ASSET = 'neonavi-data.tar.gz'
URL = os.environ.get(
    'NEONAVI_DATA_URL',
    f'https://github.com/{_REPO}/releases/download/{RELEASE_TAG}/{_ASSET}',
)

# 이 셋이 다 있으면 이미 받은 것으로 본다
EXPECTED = (
    os.path.join('public', 'derived', 'links_5186.pkl'),
    os.path.join('public', 'derived', 'signal_nodes_5186.pkl'),
    'elevation_cache.json',
)


def _present() -> bool:
    return all(os.path.exists(os.path.join(DATA_DIR, p)) for p in EXPECTED)


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def fetch(force: bool = False) -> bool:
    """데이터를 준비한다. 이미 있으면 건너뛴다. 성공하면 True."""
    if _present() and not force:
        print(f'데이터가 이미 있습니다: {DATA_DIR}')
        return True

    print(f'내려받는 중: {URL}')
    tmp_dir = tempfile.mkdtemp()
    archive = os.path.join(tmp_dir, _ASSET)
    try:
        urllib.request.urlretrieve(URL, archive)

        got = _sha256(archive)
        if ARCHIVE_SHA256 and got != ARCHIVE_SHA256:
            raise RuntimeError(
                '체크섬이 다릅니다. 받다 끊겼거나 자산이 바뀌었습니다.\n'
                f'  기대 {ARCHIVE_SHA256}\n  실제 {got}')

        os.makedirs(DATA_DIR, exist_ok=True)
        with tarfile.open(archive) as tar:
            # 압축 파일이 바깥 경로를 가리키면 임의 위치를 덮어쓸 수 있다
            for member in tar.getmembers():
                dest = os.path.realpath(os.path.join(DATA_DIR, member.name))
                if not dest.startswith(os.path.realpath(DATA_DIR) + os.sep):
                    raise RuntimeError(f'압축 파일에 이상한 경로가 있습니다: {member.name}')
            tar.extractall(DATA_DIR)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    if not _present():
        raise RuntimeError('압축을 풀었는데 기대한 파일이 없습니다.')
    print(f'완료: {DATA_DIR}')
    return True


if __name__ == '__main__':
    try:
        fetch(force='--force' in sys.argv)
    except Exception as exc:
        print(f'실패: {exc}', file=sys.stderr)
        sys.exit(1)
