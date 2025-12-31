from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ParkingSpotViewSet, LogEntryViewSet, RecognizePlateAPIView, ResetSystemAPIView, CameraSnapshotAPIView, HardwareConfigAPIView, HardwareStatusAPIView, HardwareFlowStateAPIView

router = DefaultRouter()
router.register(r'spots', ParkingSpotViewSet, basename='spot')
router.register(r'logs', LogEntryViewSet, basename='log')

urlpatterns = [
    path('', include(router.urls)),
    path('recognize/', RecognizePlateAPIView.as_view(), name='recognize-plate'),
    path('reset/', ResetSystemAPIView.as_view(), name='reset-system'),
    path('camera/snapshot/', CameraSnapshotAPIView.as_view(), name='camera-snapshot'),
    path('hardware/config/', HardwareConfigAPIView.as_view(), name='hardware-config'),
    path('hardware/status/', HardwareStatusAPIView.as_view(), name='hardware-status'),
    path('hardware/flow/', HardwareFlowStateAPIView.as_view(), name='hardware-flow'),
]