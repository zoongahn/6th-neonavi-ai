"""경로 추천 API.

  POST /api/routes/recommend/
    { profile:{age,gender,car_type,car_age}, passenger, load_kg,
      origin, destination, mode, auto_recommend }
  → { origin, destination, mode, routes:[{route_id,title,reason,score,...}] }

실제 파이프라인은 services.recommend 에 있다. 설계: docs/FE_백엔드_연동_설계.md
"""
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ai.adapters.geocode import search_places

from . import services


@api_view(['POST'])
def recommend(request):
    try:
        result = services.recommend(request.data)
    except services.RecommendError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(result)


@api_view(['GET'])
def places(request):
    """장소 검색 — 출발지·도착지 입력 자동완성용.

    GET /api/routes/places/?q=강남역 → {places:[{name,address,lng,lat}, ...]}
    """
    query = request.query_params.get('q', '')
    if not query.strip():
        return Response({'places': []})
    return Response({'places': search_places(query)})


#######추가#########
# XAI 전용 엔드포인트
####################

@api_view(['POST'])
def explain(request):
    """특정 경로 상세 AI 맞춤 분석.

    POST /api/routes/explain/
      { profile, mode, axes }
    → { recommend_reasons: [{icon, title, desc}, ...] }
    """
    try:
        result = services.explain_route_detail(request.data)
    except services.RecommendError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        
        # LLM 통신 오류 등 예측 못한 예외 처리
        return Response(
            {'detail': f'AI 분석 중 오류가 발생했습니다: {str(exc)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    return Response(result)