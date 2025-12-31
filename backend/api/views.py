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
from .hardware_config import load_hardware_config, as_public_dict, HardwareConfigError, save_raw_hardware_config, read_raw_hardware_config
from .hardware_status import check_hardware_status
from .hardware_flow import start_flow_for_spot, get_flow_state

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
    llm_url = "https://unspiritualising-spasmodically-tabetha.ngrok-free.dev/generate"
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
        # 啟動 1/2 號車位 (A-1/A-2) 的硬體流程：
        # 綠燈引導 → 超音波車態 → ROI 拍照驗證
        if spot.id in ("A-1", "A-2"):
            try:
                start_flow_for_spot(spot.id, plate)
            except Exception as e:
                # 不影響 API 回覆，但會在後台看到流程 ERROR
                print(f"[後端] 啟動硬體流程失敗: {e}")
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
import os

# 全局相機管理器：支援多顆相機 (入口/出口)，避免每次重新初始化
_camera_lock = threading.Lock()
_camera_instances = {}
_camera_last_used = {}


def _cam_key(device) -> str:
    # device 可能是 int (0/1) 或 str (/dev/video0, /dev/v4l/by-id/...)
    return str(device)


def get_camera(device):
    """
    獲取相機實例（按 device 分組的單例）
    - device: int 或 str（見 hardware_config.json 的 cameras.<name>.device）
    """
    import time
    key = _cam_key(device)

    with _camera_lock:
        cap = _camera_instances.get(key)
        if cap is None or not cap.isOpened():
            print(f"[後端] 初始化相機連接... device={device!r}")
            init_start = time.time()
            # Windows 上建議用 DirectShow，避免部分相機在 CAP_ANY 下打不開
            if os.name == "nt" and isinstance(device, int):
                cap = cv2.VideoCapture(device, cv2.CAP_DSHOW)
            else:
                cap = cv2.VideoCapture(device)
            init_time = (time.time() - init_start) * 1000

            if not cap.isOpened():
                print(f"[後端] ❌ 無法開啟相機 device={device!r}，耗時: {init_time:.2f}ms")
                _camera_instances.pop(key, None)
                return None

            _camera_instances[key] = cap
            print(f"[後端] ✅ 相機初始化完成 device={device!r}，耗時: {init_time:.2f}ms")

        _camera_last_used[key] = time.time()
        return _camera_instances[key]


def release_camera(device=None):
    """
    釋放相機資源
    - device=None：釋放全部
    - device!=None：釋放指定 device
    """
    with _camera_lock:
        if device is None:
            for key, cap in list(_camera_instances.items()):
                try:
                    cap.release()
                except Exception:
                    pass
                _camera_instances.pop(key, None)
                _camera_last_used.pop(key, None)
            print("[後端] 已釋放所有相機")
            return

        key = _cam_key(device)
        cap = _camera_instances.get(key)
        if cap is not None:
            try:
                cap.release()
            finally:
                _camera_instances.pop(key, None)
                _camera_last_used.pop(key, None)
            print(f"[後端] 相機已釋放 device={device!r}")

class CameraSnapshotAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    """
    GET /api/camera/snapshot/
    功能：擷取後端攝影機的即時畫面並回傳 Base64 字串
    優化：使用全局相機實例，避免每次重新初始化

    Query:
    - camera: entrance | parking （預設 entrance）
    """
    def get(self, request):
        import time
        request_start_time = time.time()
        print(f"[後端] 收到相機快照請求，時間: {datetime.now().isoformat()}")

        # 從硬體設定檔決定要用哪顆相機（入口/出口）
        camera_name = (request.query_params.get("camera") or "entrance").strip()
        # backward-compat: 舊的 exit 視為停車場內相機
        if camera_name == "exit":
            camera_name = "parking"
        try:
            hw = load_hardware_config()
            cam_cfg = hw.cameras.get(camera_name)
            if cam_cfg is None:
                return Response({"error": f"Unknown camera name: {camera_name}"}, status=status.HTTP_400_BAD_REQUEST)
            device = cam_cfg.device
        except HardwareConfigError as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 獲取相機實例（如果已打開則直接使用，否則初始化）
        camera_start_time = time.time()
        cap = get_camera(device)
        camera_time = (time.time() - camera_start_time) * 1000
        
        if cap is None:
            return Response({"error": "Cannot open camera"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        if camera_time > 10:  # 如果超過10ms，說明重新初始化了
            print(f"[後端] 相機獲取 camera={camera_name} device={device!r}，耗時: {camera_time:.2f}ms (重新初始化)")
        else:
            print(f"[後端] 相機獲取 camera={camera_name} device={device!r}，耗時: {camera_time:.2f}ms (使用現有連接)")
        
        # 讀取畫面（可能需要丟棄幾幀以確保畫面是最新的）
        read_start_time = time.time()
        # 丟棄一幀以確保畫面是最新的
        cap.read()
        ret, frame = cap.read()
        read_time = (time.time() - read_start_time) * 1000
        print(f"[後端] 讀取畫面，耗時: {read_time:.2f}ms")
        
        if not ret:
            print("[後端] ⚠️ 讀取畫面失敗，嘗試重新初始化相機...")
            release_camera(device)
            cap = get_camera(device)
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


class HardwareConfigAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    """
    GET /api/hardware/config/
    功能：回傳目前後端讀取到的硬體設定檔（腳位 / ROI / 門檻）
    用途：部署到樹莓派後，快速確認設定是否載入成功
    """
    def get(self, request):
        try:
            # 後台編輯需要看到「原始 JSON」，才能保留 device 的平台設定 dict
            raw = read_raw_hardware_config()
            return Response(raw)
        except HardwareConfigError as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def put(self, request):
        """
        PUT /api/hardware/config/
        Body: 直接傳 JSON 設定物件（會寫回 hardware_config.json）
        """
        try:
            raw = request.data
            save_raw_hardware_config(raw)
            return Response({"message": "ok", "raw": raw})
        except HardwareConfigError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class HardwareStatusAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    """
    GET /api/hardware/status/
    功能：回傳硬體自我檢測結果（給後台顯示）

    Query:
    - active=true/false
      - false(預設)：被動檢測（不閃燈/不鳴叫；超音波不讀值，只嘗試初始化）
      - true：主動檢測（會短暫閃燈/鳴叫，並嘗試讀超音波一次）
    """
    def get(self, request):
        active_raw = (request.query_params.get("active") or "").strip().lower()
        active = active_raw in ("1", "true", "yes", "y", "on")
        data = check_hardware_status(active=active)
        return Response(data)


class HardwareFlowStateAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    """
    GET /api/hardware/flow/
    功能：回傳目前硬體流程狀態（目前先實作 A-1 單一流程）
    """
    def get(self, request):
        return Response({"state": get_flow_state()})