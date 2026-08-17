from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/users/', include('apps.users.urls')),
    path('api/routes/', include('apps.routes.urls')),
    path('api/trips/', include('apps.trips.urls')),
]
