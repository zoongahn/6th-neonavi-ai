"""주행 기록·피드백 직렬화.

S7a(주행 기록 목록)가 요구하는 표시 항목: 출발지·도착지·주행거리·모드·비용·시간·별점.
`rating` 은 역참조라 읽기 전용으로 얹는다.
"""
from rest_framework import serializers

from .models import TripFeedback, TripRecord


class TripFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripFeedback
        fields = ['id', 'rating', 'comment', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_rating(self, value):
        if not (1 <= value <= 5):
            raise serializers.ValidationError('별점은 1~5 사이여야 합니다.')
        return value


class TripRecordSerializer(serializers.ModelSerializer):
    rating = serializers.IntegerField(source='feedback.rating', read_only=True, default=None)
    accepted = serializers.BooleanField(read_only=True)

    class Meta:
        model = TripRecord
        fields = [
            'id', 'profile', 'passenger', 'load_kg',
            'origin_name', 'destination_name',
            'origin_lng', 'origin_lat', 'destination_lng', 'destination_lat',
            'mode', 'auto_recommend', 'preference_axis',
            'candidate_count', 'recommended_route_id', 'selected_route_id', 'accepted',
            'distance_km', 'duration_min', 'toll',
            'rating', 'created_at',
        ]
        read_only_fields = ['id', 'accepted', 'rating', 'created_at']

    def validate(self, attrs):
        if not attrs.get('origin_name') or not attrs.get('destination_name'):
            raise serializers.ValidationError('출발지·도착지 이름이 필요합니다.')
        return attrs
