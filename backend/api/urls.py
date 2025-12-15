from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ParkingSpotViewSet, LogEntryViewSet, RecognizePlateAPIView

router = DefaultRouter()
router.register(r'spots', ParkingSpotViewSet, basename='spot')
router.register(r'logs', LogEntryViewSet, basename='log')

urlpatterns = [
    path('', include(router.urls)),
    path('recognize/', RecognizePlateAPIView.as_view(), name='recognize-plate'),
]
