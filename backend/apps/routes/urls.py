from django.urls import path
from . import views

urlpatterns = [
    path('recommend/', views.recommend),
    path('places/', views.places),      # 출발지·도착지 검색(자동완성)

    path('explain/', views.explain),      # 추가: XAI 전용 엔드포인트
]
