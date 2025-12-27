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
    import time
    llm_start_time = time.time()
    
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
    llm_url = "http://192.168.50.105:5000/generate"
    print(f"[後端] 發送請求到 LLM 服務: {llm_url}，時間: {datetime.now().isoformat()}")
    try:
        request_start = time.time()
        resp = requests.post(llm_url, json=payload, timeout=30)
        request_time = (time.time() - request_start) * 1000
        print(f"[後端] LLM 服務響應，耗時: {request_time:.2f}ms，狀態: {resp.status_code}")
        
        parse_start = time.time()
        response = resp.json().get("response", "{}")
        plate_number_data = parse_plate_response(response)
        parse_time = (time.time() - parse_start) * 1000
        print(f"[後端] LLM 響應解析，耗時: {parse_time:.2f}ms")
        
        total_llm_time = (time.time() - llm_start_time) * 1000
        print(f"[後端] LLM 總處理時間: {total_llm_time:.2f}ms，結果: {plate_number_data['plate_number']}")
        return plate_number_data["plate_number"]
    except Exception as e:
        total_llm_time = (time.time() - llm_start_time) * 1000
        print(f"[後端] LLM 連線失敗，耗時: {total_llm_time:.2f}ms，錯誤: {e}")
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
        import time
        request_start_time = time.time()
        print(f"[後端] 收到車牌識別請求，時間: {datetime.now().isoformat()}")
        
        data = request.data
        image = data.get('image')
        # api_key = os.environ.get('GEMINI_API_KEY')
        if not image:
            return Response({'detail': 'image is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            parse_start_time = time.time()
            base64_str = request.data.get('image').split('base64,')[-1]
            parse_time = (time.time() - parse_start_time) * 1000
            print(f"[後端] 圖片解析完成，耗時: {parse_time:.2f}ms")
            
            llm_start_time = time.time()
            print(f"[後端] 開始調用 LLM 服務...")
            response = post_to_llm(base64_str)
            llm_time = (time.time() - llm_start_time) * 1000
            print(f"[後端] LLM 服務響應完成，耗時: {llm_time:.2f}ms，結果: {response}")
            
            total_time = (time.time() - request_start_time) * 1000
            print(f"[後端] 總處理時間: {total_time:.2f}ms")
        except Exception as e:
            total_time = (time.time() - request_start_time) * 1000
            print(f"[後端] 處理失敗，耗時: {total_time:.2f}ms，錯誤: {e}")
            return Response({'plate_number': 'UNKNOWN'})

        return Response({'plate_number': response})


import cv2
import base64
import threading

# 全局相機管理器：保持相機連接打開，避免每次重新初始化
_camera_lock = threading.Lock()
_camera_instance = None
_camera_last_used = None

def get_camera():
    """
    獲取相機實例（單例模式）
    保持相機連接打開，避免重複初始化造成的延遲
    """
    import time
    global _camera_instance, _camera_last_used
    
    with _camera_lock:
        # 如果相機未初始化或已關閉，則重新打開
        if _camera_instance is None or not _camera_instance.isOpened():
            print("[後端] 初始化相機連接...")
            init_start = time.time()
            _camera_instance = cv2.VideoCapture(0)
            init_time = (time.time() - init_start) * 1000
            
            if not _camera_instance.isOpened():
                print(f"[後端] ❌ 無法開啟相機，耗時: {init_time:.2f}ms")
                _camera_instance = None
                return None
            
            print(f"[後端] ✅ 相機初始化完成，耗時: {init_time:.2f}ms")
            _camera_last_used = time.time()
        else:
            # 相機已打開，直接使用
            _camera_last_used = time.time()
        
        return _camera_instance

def release_camera():
    """
    釋放相機資源（可選，用於清理）
    """
    global _camera_instance
    with _camera_lock:
        if _camera_instance is not None:
            _camera_instance.release()
            _camera_instance = None
            print("[後端] 相機已釋放")

class CameraSnapshotAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    """
    GET /api/camera/snapshot/
    功能：擷取後端攝影機的即時畫面並回傳 Base64 字串
    優化：使用全局相機實例，避免每次重新初始化
    """
    def get(self, request):
        import time
        request_start_time = time.time()
        print(f"[後端] 收到相機快照請求，時間: {datetime.now().isoformat()}")
        
        # 獲取相機實例（如果已打開則直接使用，否則初始化）
        camera_start_time = time.time()
        cap = get_camera()
        camera_time = (time.time() - camera_start_time) * 1000
        
        if cap is None:
            return Response({"error": "Cannot open camera"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        if camera_time > 10:  # 如果超過10ms，說明重新初始化了
            print(f"[後端] 相機獲取，耗時: {camera_time:.2f}ms (重新初始化)")
        else:
            print(f"[後端] 相機獲取，耗時: {camera_time:.2f}ms (使用現有連接)")
        
        # 讀取畫面（可能需要丟棄幾幀以確保畫面是最新的）
        read_start_time = time.time()
        # 丟棄一幀以確保畫面是最新的
        cap.read()
        ret, frame = cap.read()
        read_time = (time.time() - read_start_time) * 1000
        print(f"[後端] 讀取畫面，耗時: {read_time:.2f}ms")
        
        if not ret:
            print("[後端] ⚠️ 讀取畫面失敗，嘗試重新初始化相機...")
            release_camera()
            cap = get_camera()
            if cap is None:
                return Response({"error": "Failed to capture image"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            ret, frame = cap.read()
            if not ret:
                return Response({"error": "Failed to capture image"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 將圖片編碼為 JPEG
        encode_start_time = time.time()
        _, buffer = cv2.imencode('.jpg', frame)
        encode_time = (time.time() - encode_start_time) * 1000
        print(f"[後端] 圖片編碼，耗時: {encode_time:.2f}ms")
        
        # 轉為 Base64 字串
        base64_start_time = time.time()
        jpg_as_text = base64.b64encode(buffer).decode('utf-8')
        base64_time = (time.time() - base64_start_time) * 1000
        print(f"[後端] Base64 轉換，耗時: {base64_time:.2f}ms")
        
        # 加上 Data URI Scheme 前綴
        base64_image = f"data:image/jpeg;base64,{jpg_as_text}"
        
        total_time = (time.time() - request_start_time) * 1000
        print(f"[後端] 相機快照總處理時間: {total_time:.2f}ms")
        
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