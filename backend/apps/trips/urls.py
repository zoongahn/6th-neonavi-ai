from django.urls import path

from . import views

urlpatterns = [
    path('', views.trips),                                 # 목록·저장
    path('stats/', views.stats),                           # 층3 지표
    path('<int:trip_id>/feedback/', views.feedback),       # 별점
]
