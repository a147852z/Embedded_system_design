import os
from datetime import datetime
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import ParkingSpot, LogEntry
from .serializers import ParkingSpotSerializer, LogEntrySerializer
import requests
import json
import re

def parse_plate_response(ai_response_text):
    try:
        # 1. 使用 Regex 搜尋字串中第一個被 {} 包住的內容 (支援換行)
        match = re.search(r'\{.*\}', ai_response_text, re.DOTALL)
        
        if match:
            json_str = match.group()
            # 2. 解析 JSON
            data = json.loads(json_str)
            return data
        else:
            print("❌ 找不到 JSON 格式")
            return {"plate_number": "UNKNOWN"}

    except json.JSONDecodeError:
        print("❌ JSON 格式錯誤 (可能是引號問題)")
        return {"plate_number": "UNKNOWN"}
    
def post_to_llm(image_base64: str) -> str:
    prompt = """Role: You are an Automated License Plate Recognition (ALPR) system.
Task: Analyze the provided image and extract the vehicle license plate number.

Strict Output Rules:
1. Output ONLY a valid JSON object.
2. Format: {"plate_number": "YOUR_RESULT_HERE"}
3. Convert all characters to UPPERCASE.
4. Remove all spaces, dashes ('-'), and special characters. Return only alphanumeric characters (A-Z, 0-9).
5. If the plate is unclear, too small, or not visible, return: {"plate_number": "UNKNOWN"}
6. DO NOT provide any explanations, markdown formatting (like ```json), or conversational text. Just the raw JSON string.
"""

    payload = {
        "key": "text+image",
        "text_query": prompt,
        "image_base64": image_base64,
    }
    # print(f"LLM 辨識中 ({getattr(mp,'name',mp)})...")
    llm_url = "http://192.168.50.105:5000/generate"
    try:
        resp = requests.post(llm_url, json=payload, timeout=30)  
        response = resp.json().get("response", "{}")
        plate_number_data = parse_plate_response(response)
        print(plate_number_data["plate_number"])
        return plate_number_data["plate_number"]
    except Exception as e:
        print(f"LLM 連線失敗: {e}")
        return "UNKNOWN"


class ParkingSpotViewSet(viewsets.ModelViewSet):
    authentication_classes = []
    permission_classes = []
    queryset = ParkingSpot.objects.all().order_by('id')
    serializer_class = ParkingSpotSerializer

    @action(detail=True, methods=['post'])
    def occupy(self, request, pk=None):
        spot = self.get_object()
        plate = request.data.get('plate_number')
        if not plate:
            return Response({'detail': 'plate_number required'}, status=status.HTTP_400_BAD_REQUEST)
        print(123)
        spot.status = 'OCCUPIED'
        spot.plate_number = plate
        spot.parked_time = timezone.now()
        spot.save()
        return Response({'detail': 'occupied'})


class LogEntryViewSet(viewsets.ModelViewSet):
    queryset = LogEntry.objects.all().order_by('-timestamp')
    serializer_class = LogEntrySerializer


class RecognizePlateAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    """
    POST /api/recognize/
    Body: { "image": "data:image/jpeg;base64,..." }
    Returns: { "plate_number": "ABC-1234" }
    """
    def post(self, request, format=None):
        data = request.data
        image = data.get('image')
        print("TEST")
        # api_key = os.environ.get('GEMINI_API_KEY')
        if not image:
            return Response({'detail': 'image is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            base64_str = request.data.get('image').split('base64,')[-1]
            response = post_to_llm(base64_str)
        except Exception as e:
            print(e)
            return Response({'plate_number': 'UNKNOWN'})

        return Response({'plate_number': response})


import cv2
import base64

class CameraSnapshotAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    """
    GET /api/camera/snapshot/
    功能：擷取後端攝影機的即時畫面並回傳 Base64 字串
    """
    def get(self, request):
        # 0 是預設攝影機，若有多個攝影機可改為 1, 2...
        cap = cv2.VideoCapture(0)
        
        if not cap.isOpened():
            return Response({"error": "Cannot open camera"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        ret, frame = cap.read()
        cap.release()
        
        if not ret:
            return Response({"error": "Failed to capture image"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 將圖片編碼為 JPEG
        _, buffer = cv2.imencode('.jpg', frame)
        
        # 轉為 Base64 字串
        jpg_as_text = base64.b64encode(buffer).decode('utf-8')
        
        # 加上 Data URI Scheme 前綴
        base64_image = f"data:image/jpeg;base64,{jpg_as_text}"
        
        return Response({"image": base64_image})


class ResetSystemAPIView(APIView):
    """
    POST /api/reset/
    功能：一鍵重置系統，清空所有車位並刪除紀錄
    """
    def post(self, request):
        # 1. 重置所有車位狀態為 AVAILABLE (空位)
        ParkingSpot.objects.all().update(
            status='AVAILABLE',
            plate_number=None,
            parked_time=None,
            abnormal_reason=None
        )

        # 2. 清空所有 Log 紀錄
        LogEntry.objects.all().delete()

        return Response({"message": "System reset successfully"})