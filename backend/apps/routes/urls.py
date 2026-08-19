from django.urls import path
from . import views

urlpatterns = [
    path('recommend/', views.recommend, name='recommend'),  # 추천 경로 조회
    path('places/', views.places, name='places'),      # 출발지·도착지 검색(자동완성)

    path('explain/', views.explain, name = 'explain'),      # 추가: XAI 전용 엔드포인트
]
