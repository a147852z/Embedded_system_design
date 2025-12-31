"""
Raspberry Pi 兩車位停車指示系統                 # 系統用途：兩車位停車引導
------------------------------------------------------------ # 分隔線（純說明用）
每車位：2 個超音波 + 紅/黃/綠 LED               # 每個車位的硬體 구성
共用：1 個蜂鳴器、1 個相機（拍照做車牌辨識）     # 兩車位共用同一顆蜂鳴器與相機

流程：                                         # 使用者規劃的流程
1) 預設亮綠燈                                  # 空位/待停狀態：綠燈
2) 車子歪（兩超音波距離差 > 3cm） => 黃燈 + 慢速蜂鳴 # 偵測歪斜：黃燈+慢蜂鳴
3) 車子停好（任一超音波距離 < 3cm） => 拍照 + 車牌辨識 # 偵測停好：拍照+辨識
   - 不符合 => 紅燈 + 警報蜂鳴                   # 車牌不在白名單：紅燈+警報
   - 符合 => 綠燈亮 5 秒後熄滅                   # 車牌符合：綠燈5秒後關燈
4) 偵測車離開（任一超音波距離 > 5cm） => 綠燈亮 3 秒 # 車離開：綠燈3秒
"""                                            # 多行說明字串結束

import time                                   # 匯入時間模組（sleep、time、strftime）
import threading                              # 匯入執行緒模組（蜂鳴器背景執行）
from dataclasses import dataclass             # 匯入 dataclass（用來存硬體物件）
from enum import Enum, auto                   # 匯入 Enum/auto（定義狀態列舉）

# GPIO / Sensor                                # 註解：下面匯入 GPIOZero 的元件
from gpiozero import DistanceSensor, LED, Buzzer  # 超音波距離、LED、蜂鳴器控制

# Camera (Bookworm/新版建議用 Picamera2)        # 註解：Bookworm 常用 Picamera2
try:                                          # 嘗試匯入 Picamera2（有裝才會成功）
    from picamera2 import Picamera2           # 匯入 Picamera2 相機控制
    HAS_CAMERA = True                         # 若成功，設定有相機支援
except Exception:                             # 若匯入失敗（沒裝/環境不支援）
    HAS_CAMERA = False                        # 設定沒有相機支援（程式仍可跑）


# =========================                   # 分隔線：使用者設定區
# 使用者設定區（必改）                        # 這區通常要依硬體腳位/需求調整
# =========================

# 超音波判斷門檻（公尺）                      # 門檻以公尺為單位（0.03m=3cm）
MISALIGN_DIFF_M = 0.03                        # 歪斜判斷：兩顆超音波距離差 > 3cm
PARKED_ANY_LT_M = 0.03                        # 停好觸發：任一顆距離 < 3cm
LEAVE_ANY_GT_M  = 0.05                        # 離開判斷：任一顆距離 > 5cm

# 輪詢時間（秒）—越小越即時，但 CPU 會高一點  # 主迴圈每次更新的間隔
POLL_DT = 0.10                                # 每 0.10 秒更新一次（10 Hz）

# 超音波距離讀值穩定化：取幾次的中位數        # 為了降低雜訊/跳動
MEDIAN_SAMPLES = 5                            # 每次讀 5 筆距離
MEDIAN_SAMPLE_DT = 0.02                       # 每筆間隔 0.02 秒

# 拍照存檔位置                                # 拍照存到這個資料夾（需可寫入）
CAPTURE_DIR = "/home/pi/parking_captures"     # Linux 路徑：/home/pi/...

# 共用蜂鳴器 GPIO (BCM)                       # 蜂鳴器控制腳位（BCM 編號）
BUZZER_PIN = 18                               # 例如 GPIO18（可 PWM/一般也可）

# 車位腳位設定（BCM）                          # 兩個車位的全部腳位在此定義
# 注意：DistanceSensor(echo=, trigger=)        # gpiozero DistanceSensor 要給 echo/trigger
SPOT_PINS = [                                 # 用 list 裝兩個 dict（兩車位）
    {   # 車位 1                               # 第一個 dict 代表車位 1
        "us1_trigger": 23, "us1_echo": 24,    # 車位1 超音波1：trigger=23 echo=24
        "us2_trigger": 27, "us2_echo": 22,    # 車位1 超音波2：trigger=27 echo=22
        "led_r": 5, "led_y": 6, "led_g": 13,  # 車位1 紅/黃/綠 LED 腳位
    },                                         # 車位 1 設定結束
    {   # 車位 2                               # 第二個 dict 代表車位 2
        "us1_trigger": 17, "us1_echo": 4,     # 車位2 超音波1：trigger=17 echo=4
        "us2_trigger": 19, "us2_echo": 26,    # 車位2 超音波2：trigger=19 echo=26
        "led_r": 16, "led_y": 20, "led_g": 21,# 車位2 紅/黃/綠 LED 腳位
    },                                         # 車位 2 設定結束
]                                             # SPOT_PINS list 結束


# =========================                   # 分隔線：狀態定義
# 狀態定義                                    # 定義蜂鳴器模式與車位狀態
# =========================
class BeepMode(Enum):                         # 蜂鳴器模式（列舉）
    OFF = auto()                              # 關閉蜂鳴
    SLOW = auto()                             # 慢速蜂鳴（歪斜提示）
    ALARM = auto()                            # 警報蜂鳴（不合格提示）

class SpotState(Enum):                        # 車位狀態（列舉）
    IDLE_GREEN = auto()                       # 1) 預設綠燈
    MISALIGNED_YELLOW = auto()                # 2) 歪斜黃燈 + 慢蜂鳴
    PARKED_CHECKING = auto()                  # 3) 觸發拍照辨識中（短暫）
    REJECT_RED = auto()                       # 3) 不符合：紅燈 + 警報蜂鳴
    ACCEPT_GREEN_5S_OFF = auto()              # 3) 符合：綠燈5秒後熄滅
    LEAVE_GREEN_3S = auto()                   # 4) 離開：綠燈3秒


# =========================                   # 分隔線：蜂鳴器背景控制
# 蜂鳴器背景控制                              # 用 Thread 讓蜂鳴器獨立節奏，不堵塞主迴圈
# =========================
class BeeperThread(threading.Thread):         # 定義一個背景執行緒控制蜂鳴器
    def __init__(self, buzzer: Buzzer):       # 建構子：傳入 gpiozero 的 Buzzer 物件
        super().__init__(daemon=True)         # 初始化 Thread；daemon=True 表示主程式結束它也結束
        self.buzzer = buzzer                  # 保存蜂鳴器物件以便控制 on/off
        self.mode = BeepMode.OFF              # 初始模式：關閉
        self._lock = threading.Lock()         # 鎖：避免 mode 同時被多執行緒讀寫衝突
        self._stop = False                    # 停止旗標：True 時執行緒結束

    def set_mode(self, mode: BeepMode):       # 外部呼叫：設定蜂鳴器模式
        with self._lock:                      # 進入鎖保護區
            self.mode = mode                  # 更新目前模式

    def stop(self):                           # 外部呼叫：請求停止執行緒
        self._stop = True                     # 設定停止旗標（run 迴圈會退出）

    def run(self):                            # Thread 入口：背景一直跑這個函式
        while not self._stop:                 # 只要沒被要求停止，就持續循環
            with self._lock:                  # 用鎖讀取 mode，確保一致性
                mode = self.mode              # 讀出當前模式到區域變數

            if mode == BeepMode.OFF:          # 若模式是 OFF
                self.buzzer.off()             # 關掉蜂鳴器
                time.sleep(0.05)              # 小睡一下避免 CPU 空轉太高

            elif mode == BeepMode.SLOW:       # 若模式是慢速蜂鳴
                # 慢速蜂鳴：0.2s on / 0.8s off # 節奏說明
                self.buzzer.on()              # 蜂鳴器打開
                time.sleep(0.2)               # 持續 0.2 秒
                self.buzzer.off()             # 蜂鳴器關閉
                time.sleep(0.8)               # 靜音 0.8 秒

            elif mode == BeepMode.ALARM:      # 若模式是警報蜂鳴
                # 警報蜂鳴：快速 0.15 on / 0.15 off # 節奏說明
                self.buzzer.on()              # 蜂鳴器打開
                time.sleep(0.15)              # 持續 0.15 秒
                self.buzzer.off()             # 蜂鳴器關閉
                time.sleep(0.15)              # 靜音 0.15 秒


# =========================                   # 分隔線：車位物件
# 車位物件                                    # 把每個車位的硬體（2超音波+3LED）打包
# =========================
@dataclass                                    # dataclass：自動生成 __init__ 等，方便存放資料
class SpotHW:                                  # SpotHW：代表一個車位的硬體集合
    us1: DistanceSensor                        # 超音波感測器1
    us2: DistanceSensor                        # 超音波感測器2
    led_r: LED                                 # 紅色 LED
    led_y: LED                                 # 黃色 LED
    led_g: LED                                 # 綠色 LED

def set_led(hw: SpotHW, r=False, y=False, g=False):  # 設定指定車位的 R/Y/G 燈狀態
    hw.led_r.value = 1 if r else 0             # 若 r=True 就亮紅燈，否則關
    hw.led_y.value = 1 if y else 0             # 若 y=True 就亮黃燈，否則關
    hw.led_g.value = 1 if g else 0             # 若 g=True 就亮綠燈，否則關


# =========================                   # 分隔線：讀距離（中位數濾波）
# 讀距離：中位數濾波                          # 用多次讀值取中位數，降低雜訊抖動
# =========================
def median(lst):                               # 計算 list 的中位數（自訂，不用 numpy）
    s = sorted(lst)                            # 將輸入 list 排序
    n = len(s)                                 # list 長度
    return s[n//2] if n % 2 == 1 else 0.5*(s[n//2-1] + s[n//2])  # 奇數取中間，偶數取中間兩個平均

def read_distance_m(sensor: DistanceSensor) -> float:  # 讀取超音波距離（公尺），做中位數濾波
    vals = []                                  # 存放多次量測值
    for _ in range(MEDIAN_SAMPLES):            # 重複讀取 MEDIAN_SAMPLES 次
        d = float(sensor.distance)             # 讀取距離（gpiozero 的 distance 以「公尺」概念表示）
        # gpiozero 的 DistanceSensor.distance 以「公尺」表示（依 max_distance 設定） # 補充說明
        # 但在 gpiozero 內部 distance 就是 meters（只要你給 max_distance 是 meters） # 補充說明
        vals.append(d)                         # 加入量測值
        time.sleep(MEDIAN_SAMPLE_DT)           # 每次讀值間隔一下，避免瞬間雜訊
    return median(vals)                        # 回傳中位數作為穩定距離


# =========================                   # 分隔線：相機與車牌辨識
# 相機 + 車牌辨識（你要把這段換成真的）        # 目前提供「可跑骨架」，辨識部分需你接模型/服務
# =========================
class CameraLPR:                               # 相機+車牌辨識類別
    def __init__(self):                        # 建構子：初始化相機
        self.picam2 = None                     # 預設相機物件為 None
        if HAS_CAMERA:                         # 若環境支援 Picamera2
            self.picam2 = Picamera2()          # 建立 Picamera2 物件
            # 這個設定足夠做拍照辨識（可依需要調更高解析） # 註解：解析度可改
            config = self.picam2.create_still_configuration(main={"size": (1280, 720)})  # 設定拍照解析度
            self.picam2.configure(config)      # 套用設定
            self.picam2.start()                # 啟動相機
            time.sleep(1.0)                    # 等待相機穩定（避免第一張黑屏）

    def capture(self, filepath: str) -> bool:  # 拍照並存檔，成功回 True
        if not HAS_CAMERA or self.picam2 is None:  # 若沒相機支援或未初始化
            return False                       # 回傳失敗
        self.picam2.capture_file(filepath)     # 拍照存到指定檔案路徑
        return True                            # 回傳成功

    def recognize_plate(self, filepath: str) -> str:  # 車牌辨識：輸入圖片路徑，輸出車牌字串
        """
        TODO: 這裡請換成你真正的車牌辨識            # 說明：這段要改成真正辨識
        - OpenALPR (alpr)                        # 方案1：OpenALPR
        - Plate Recognizer API                   # 方案2：雲端 API
        - easyocr + opencv 自己做字元辨識          # 方案3：離線 OCR
        """
        # 目前先回傳 UNKNOWN，讓流程可以跑起來     # 暫時假裝辨識不到
        return "UNKNOWN"                        # 回傳未知車牌


# =========================                   # 分隔線：主控制器
# 主控制器