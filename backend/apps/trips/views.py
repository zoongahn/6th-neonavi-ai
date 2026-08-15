"""주행 기록·피드백 API.

  GET  /api/trips/                  → 최근 주행 기록 목록 (S7a)
  POST /api/trips/                  → 주행 시작·종료 시 기록 저장 → 201 + id
  POST /api/trips/<id>/feedback/    → 별점 저장 (S6). 이미 있으면 갱신.
  GET  /api/trips/stats/            → 추천 수용률·평균 별점 (층3 1차 지표)

로그인이 없는 단계라 profile 은 요청에 실린 id 로만 연결한다(데모 전제).
설계: docs/실사용데이터_설계.md
"""
from django.db.models import Avg, Count, F, Q
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import TripFeedback, TripRecord
from .serializers import TripFeedbackSerializer, TripRecordSerializer

LIST_LIMIT = 50


@api_view(['GET', 'POST'])
def trips(request):
    if request.method == 'POST':
        serializer = TripRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    qs = TripRecord.objects.select_related('feedback')
    profile_id = request.query_params.get('profile')
    if profile_id:
        qs = qs.filter(profile_id=profile_id)
    return Response({'trips': TripRecordSerializer(qs[:LIST_LIMIT], many=True).data})


@api_view(['POST'])
def feedback(request, trip_id):
    try:
        trip = TripRecord.objects.get(pk=trip_id)
    except (TripRecord.DoesNotExist, ValueError):
        return Response({'detail': '주행 기록을 찾을 수 없습니다.'},
                        status=status.HTTP_404_NOT_FOUND)

    serializer = TripFeedbackSerializer(
        instance=getattr(trip, 'feedback', None), data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(trip=trip)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def stats(request):
    """층3 1차 지표 — 추천 수용률과 평균 만족도.

    수용률은 추천·선택이 모두 기록된 건에서만 센다(둘 중 하나라도 비면 판단 불가).
    """
    judged = TripRecord.objects.exclude(
        Q(recommended_route_id='') | Q(selected_route_id=''))
    total = judged.count()
    accepted = judged.filter(recommended_route_id=F('selected_route_id')).count()

    agg = TripFeedback.objects.aggregate(avg=Avg('rating'), n=Count('id'))
    return Response({
        'trips_total': TripRecord.objects.count(),
        'judged': total,
        'accepted': accepted,
        'acceptance_rate': round(accepted / total, 3) if total else None,
        'feedback_count': agg['n'],
        'rating_avg': round(agg['avg'], 2) if agg['avg'] else None,
    })
