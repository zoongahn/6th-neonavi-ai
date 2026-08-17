"""주행 기록·피드백 — 층3(실사용) 검증 데이터.

층1은 규칙 학습 여부만, 층2 설문은 가상 상황에서의 선호만 증명한다.
'실제로 그 경로를 골라서 달렸고 만족했는가'는 여기 쌓이는 데이터만이 답한다.

핵심은 **추천한 경로와 사용자가 고른 경로를 함께 남기는 것**이다.
둘이 같으면 추천 수용, 다르면 거절 — 이 비율이 층3의 1차 지표다.
"""
from django.db import models

from apps.users.models import DriverProfile


class TripRecord(models.Model):
    """한 번의 여정: 추천 결과 + 사용자의 실제 선택."""

    MODE = [('comfort', '편안함'), ('sports', '스포티'), ('eco', '경제성')]

    # ── 누가 ──
    profile = models.ForeignKey(DriverProfile, on_delete=models.SET_NULL,
                                null=True, blank=True, related_name='trips')
    passenger = models.CharField(max_length=20, blank=True)      # 여정별 입력
    load_kg = models.PositiveIntegerField(null=True, blank=True)  # 여정별 입력

    # ── 어디서 어디로 ──
    origin_name = models.CharField(max_length=200)
    destination_name = models.CharField(max_length=200)
    origin_lng = models.FloatField(null=True, blank=True)
    origin_lat = models.FloatField(null=True, blank=True)
    destination_lng = models.FloatField(null=True, blank=True)
    destination_lat = models.FloatField(null=True, blank=True)

    # ── 어떤 조건으로 ──
    mode = models.CharField(max_length=10, choices=MODE, blank=True)
    auto_recommend = models.BooleanField(default=True)
    # 모델이 실제로 추론한 성향 축. mode 는 화면이 표시한 라벨이라
    # auto_recommend=True 면 랭킹 근거와 다를 수 있어 따로 남긴다.
    preference_axis = models.CharField(max_length=10, blank=True)

    # ── 추천 vs 선택 (층3 핵심) ──
    candidate_count = models.PositiveIntegerField(default=0)
    recommended_route_id = models.CharField(max_length=40, blank=True)  # 모델의 1순위
    selected_route_id = models.CharField(max_length=40, blank=True)     # 사용자가 고른 것

    # ── 선택한 경로의 실제 값 (S7a 표시용) ──
    distance_km = models.FloatField(null=True, blank=True)
    duration_min = models.FloatField(null=True, blank=True)
    toll = models.PositiveIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def accepted(self) -> bool | None:
        """추천 1순위를 그대로 골랐는가. 둘 중 하나라도 비면 판단 불가(None)."""
        if not self.recommended_route_id or not self.selected_route_id:
            return None
        return self.recommended_route_id == self.selected_route_id

    def __str__(self):
        return f'TripRecord({self.origin_name}→{self.destination_name}, {self.mode})'


class TripFeedback(models.Model):
    """주행 후 만족도. 기록 1건당 1개."""

    trip = models.OneToOneField(TripRecord, on_delete=models.CASCADE,
                                related_name='feedback')
    rating = models.PositiveSmallIntegerField()   # 1~5 (S6 별점)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'TripFeedback({self.trip_id}, {self.rating}점)'
