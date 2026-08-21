"""주소·장소명 → 좌표 (카카오 로컬 API).

FE는 출발지·도착지를 자유 텍스트로 받으므로, 추천 전에 좌표로 바꿔야 한다.
키워드 검색(장소명: "강남역", "판교 카카오") → 실패 시 주소 검색 순으로 시도한다.

설계: docs/FE_백엔드_연동_설계.md
"""
from __future__ import annotations

import requests

from .kakao import SESSION, _headers   # .env 로딩 + Authorization·연결 재사용

KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json"


class GeocodeError(Exception):
    """좌표를 찾지 못했을 때."""


def _first_doc(url: str, query: str, timeout: int = 5) -> dict | None:
    try:
        resp = SESSION.get(url, headers=_headers(),
                           params={"query": query, "size": 1}, timeout=timeout)
    except requests.RequestException:
        return None
    if resp.status_code != 200:
        return None
    docs = resp.json().get("documents", [])
    return docs[0] if docs else None


def search_places(query: str, size: int = 8) -> list[dict]:
    """장소 검색 결과 목록 → [{name, address, lng, lat}, ...].

    사용자가 "강남역"처럼 모호하게 입력했을 때 후보를 보여주고 고르게 하기 위한 용도.
    (geocode 는 첫 결과를 자동 선택하지만, 이 함수는 선택지를 그대로 돌려준다)
    """
    q = (query or "").strip()
    if not q:
        return []
    try:
        resp = SESSION.get(KEYWORD_URL, headers=_headers(),
                           params={"query": q, "size": max(1, min(size, 15))}, timeout=5)
    except requests.RequestException:
        return []
    if resp.status_code != 200:
        return []

    places = []
    for doc in resp.json().get("documents", []):
        try:
            lng, lat = float(doc["x"]), float(doc["y"])
        except (KeyError, TypeError, ValueError):
            continue
        places.append({
            "name": doc.get("place_name") or doc.get("address_name", q),
            "address": doc.get("road_address_name") or doc.get("address_name", ""),
            "lng": lng,
            "lat": lat,
        })
    return places


def geocode(query: str) -> tuple[tuple[float, float], str]:
    """장소명/주소 → ((lng, lat), 해석된 이름).

    해석된 이름을 함께 돌려줘, 사용자가 의도한 곳이 맞는지 FE에서 확인할 수 있게 한다.
    """
    q = (query or "").strip()
    if not q:
        raise GeocodeError("검색어가 비어 있습니다.")

    for url, name_keys in ((KEYWORD_URL, ("place_name", "address_name")),
                           (ADDRESS_URL, ("address_name",))):
        doc = _first_doc(url, q)
        if not doc:
            continue
        try:
            lng, lat = float(doc["x"]), float(doc["y"])
        except (KeyError, TypeError, ValueError):
            continue
        resolved = next((doc[k] for k in name_keys if doc.get(k)), q)
        return (lng, lat), resolved

    raise GeocodeError(f"'{q}' 의 좌표를 찾지 못했습니다.")


def to_coords(value) -> tuple[tuple[float, float], str]:
    """FE 입력 정규화: 문자열이면 지오코딩, {lng,lat}/[lng,lat] 이면 그대로."""
    if isinstance(value, dict):
        try:
            return (float(value["lng"]), float(value["lat"])), value.get("name", "")
        except (KeyError, TypeError, ValueError):
            raise GeocodeError("좌표 객체는 {lng, lat} 형식이어야 합니다.")
    if isinstance(value, (list, tuple)) and len(value) == 2:
        return (float(value[0]), float(value[1])), ""
    return geocode(value)
