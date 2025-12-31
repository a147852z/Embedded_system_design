from __future__ import annotations

import base64
import os
import threading
import time
from dataclasses import dataclass, asdict
from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np

from django.utils import timezone

from .hardware_config import HardwareConfigError, load_hardware_config
from .models import ParkingSpot, LogEntry


def _normalize_plate(s: str) -> str:
    s = (s or "").upper()
    out = []
    for ch in s:
        if ch.isalnum():
            out.append(ch)
    return "".join(out)


def _spot_key_from_db_id(db_id: str) -> str:
    """
    將 DB id (A-1) 映射到硬體 config key。
    目前硬體設定檔 spots 是用 "1"/"2"；但 DB 是 "A-1"/"A-2"。
    """
    if not db_id:
        return db_id
    if "-" in db_id:
        tail = db_id.split("-")[-1]
        if tail:
            return tail
    return db_id


def _roi_key_candidates(db_id: str) -> Tuple[str, ...]:
    key = _spot_key_from_db_id(db_id)
    # ROI 可能用 "1" 或 "A-1"
    return (db_id, key)


class BeepMode:
    OFF = "OFF"
    SLOW = "SLOW"
    ALARM = "ALARM"


class BeeperThread(threading.Thread):
    def __init__(self, buzzer: Any):
        super().__init__(daemon=True)
        self._buzzer = buzzer
        self._mode = BeepMode.OFF
        self._lock = threading.Lock()
        self._stop = False

    def set_mode(self, mode: str) -> None:
        with self._lock:
            self._mode = mode

    def stop(self) -> None:
        self._stop = True

    def run(self) -> None:
        while not self._stop:
            with self._lock:
                mode = self._mode

            if mode == BeepMode.OFF:
                try:
                    self._buzzer.off()
                except Exception:
                    pass
                time.sleep(0.05)
            elif mode == BeepMode.SLOW:
                # 車態不正：短聲，每 3 秒一次（約 0.2s on / 2.8s off）
                try:
                    self._buzzer.on()
                except Exception:
                    pass
                time.sleep(0.20)
                try:
                    self._buzzer.off()
                except Exception:
                    pass
                time.sleep(2.80)
            else:
                # ALARM: 0.15 on / 0.15 off
                try:
                    self._buzzer.on()
                except Exception:
                    pass
                time.sleep(0.15)
                try:
                    self._buzzer.off()
                except Exception:
                    pass
                time.sleep(0.15)


@dataclass
class FlowState:
    spot_id: str
    stage: str
    message: str = ""
    expected_plate: str = ""
    detected_plate: str = ""
    last_left_m: Optional[float] = None
    last_right_m: Optional[float] = None
    # 這裡改成存左右差值（單位：公尺），避免改 dataclass 結構破壞太多既有顯示
    misalign_percent: Optional[float] = None
    started_at: str = ""
    updated_at: str = ""
    done: bool = False
    ok: Optional[bool] = None
    error: Optional[str] = None


_FLOW_LOCK = threading.Lock()
_FLOW_THREAD: Optional[threading.Thread] = None
_FLOW_STATE: Optional[FlowState] = None


def get_flow_state() -> Optional[Dict[str, Any]]:
    with _FLOW_LOCK:
        return asdict(_FLOW_STATE) if _FLOW_STATE else None


def _set_state(**kwargs) -> None:
    global _FLOW_STATE
    with _FLOW_LOCK:
        if _FLOW_STATE is None:
            return
        for k, v in kwargs.items():
            setattr(_FLOW_STATE, k, v)
        _FLOW_STATE.updated_at = timezone.now().isoformat()


def _capture_frame(device: Any) -> Optional[np.ndarray]:
    # Windows: prefer DirectShow if index
    if os.name == "nt" and isinstance(device, int):
        cap = cv2.VideoCapture(device, cv2.CAP_DSHOW)
    else:
        cap = cv2.VideoCapture(device)
    try:
        if not cap.isOpened():
            return None
        cap.read()  # drop one frame
        ok, frame = cap.read()
        if not ok:
            return None
        return frame
    finally:
        try:
            cap.release()
        except Exception:
            pass


def _encode_jpg_base64(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", img)
    if not ok:
        return ""
    return base64.b64encode(buf.tobytes()).decode("utf-8")


def _crop_roi(frame: np.ndarray, roi: Dict[str, Any]) -> np.ndarray:
    h, w = frame.shape[:2]
    x = int(max(0, min(w - 1, roi.get("x", 0))))
    y = int(max(0, min(h - 1, roi.get("y", 0))))
    rw = int(max(1, min(w - x, roi.get("w", w - x))))
    rh = int(max(1, min(h - y, roi.get("h", h - y))))
    return frame[y : y + rh, x : x + rw]


def _read_distance(sensor: Any, samples: int, dt: float) -> float:
    vals = []
    for _ in range(max(1, samples)):
        try:
            vals.append(float(sensor.distance))
        except Exception:
            pass
        time.sleep(dt)
    if not vals:
        return 999.0
    vals.sort()
    return vals[len(vals) // 2]


def _misalign_percent(left: float, right: float) -> float:
    denom = max(left, right, 1e-6)
    return abs(left - right) / denom


def _current_spot_for_log() -> str:
    with _FLOW_LOCK:
        return _FLOW_STATE.spot_id if _FLOW_STATE else "?"


def _heartbeat(stage: str, msg: str) -> None:
    """
    每秒輸出用：同時更新 flow state 與 print。
    """
    spot = _current_spot_for_log()
    line = f"[硬體流程][{spot}][{stage}] {msg}"
    print(line)
    _set_state(stage=stage, message=line)


def _run_with_heartbeat(stage: str, title: str, fn):
    """
    執行可能會卡一段時間的動作（例如 LLM 辨識），期間每秒輸出一次狀態。
    """
    done = threading.Event()
    out: Dict[str, Any] = {"value": None, "error": None}

    def _worker():
        try:
            out["value"] = fn()
        except Exception as e:
            out["error"] = e
        finally:
            done.set()

    t = threading.Thread(target=_worker, daemon=True)
    t.start()

    tick = 0
    while not done.is_set():
        tick += 1
        _heartbeat(stage, f"{title}... ({tick}s)")
        done.wait(timeout=1.0)

    if out["error"] is not None:
        raise out["error"]
    return out["value"]


def start_flow_for_spot(spot_db_id: str, expected_plate: str) -> Dict[str, Any]:
    """
    啟動指定車位流程。
    目前蜂鳴器共用，所以同時間只允許一個流程在跑（避免併發互相干擾）。
    """
    global _FLOW_THREAD, _FLOW_STATE
    with _FLOW_LOCK:
        if _FLOW_THREAD is not None and _FLOW_THREAD.is_alive():
            return {"started": False, "reason": "flow already running", "state": asdict(_FLOW_STATE) if _FLOW_STATE else None}

        _FLOW_STATE = FlowState(
            spot_id=spot_db_id,
            stage="STARTING",
            message="啟動流程中",
            expected_plate=_normalize_plate(expected_plate),
            started_at=timezone.now().isoformat(),
            updated_at=timezone.now().isoformat(),
        )

        t = threading.Thread(target=_run_flow, args=(spot_db_id,), daemon=True)
        _FLOW_THREAD = t
        t.start()
        return {"started": True, "state": asdict(_FLOW_STATE)}


def _run_flow(spot_db_id: str) -> None:
    """
    流程：
    1) 綠燈引導
    2) 偵測車進入（任一距離 < approach_any_lt_m）→ 黃燈
    3) 車態判斷：left/right 誤差 <= misalign_max_percent 且穩定 parked_stable_seconds → 進入拍照驗證
       - 不符合：黃燈 + 慢蜂鳴
    4) 停車場相機拍照 → 依 ROI 裁切 → 車牌辨識
       - 不符：紅燈 + 警報蜂鳴 + DB 設 ABNORMAL
       - 相符：全部熄燈 + DB 維持 OCCUPIED
    """
    try:
        hw = load_hardware_config()
        cfg_key = _spot_key_from_db_id(spot_db_id)
        s = hw.spots.get(cfg_key)
        if s is None:
            # fallback: match by label
            for _k, _s in hw.spots.items():
                if _s.label == spot_db_id:
                    s = _s
                    break
        if s is None:
            raise RuntimeError(f"找不到 {spot_db_id} 對應的硬體腳位設定 (spots.{cfg_key})")

        # import gpiozero lazily (Pi only)
        from gpiozero import LED, Buzzer, DistanceSensor  # type: ignore

        led_r = LED(s.led.r, active_high=hw.gpio_active_high)
        led_y = LED(s.led.y, active_high=hw.gpio_active_high)
        led_g = LED(s.led.g, active_high=hw.gpio_active_high)

        buzzer = Buzzer(hw.buzzer.pin, active_high=hw.gpio_active_high)
        beeper = BeeperThread(buzzer)
        beeper.start()

        us_left = DistanceSensor(echo=s.ultrasonic_left.echo, trigger=s.ultrasonic_left.trigger, max_distance=2.0, queue_len=1)
        us_right = DistanceSensor(echo=s.ultrasonic_right.echo, trigger=s.ultrasonic_right.trigger, max_distance=2.0, queue_len=1)

        def set_led(r=False, y=False, g=False):
            led_r.value = 1 if r else 0
            led_y.value = 1 if y else 0
            led_g.value = 1 if g else 0

        # phase 1: green guide
        _set_state(stage="GUIDING_GREEN", message="綠燈引導中")
        set_led(g=True)
        beeper.set_mode(BeepMode.OFF)

        # thresholds
        poll_dt = float(hw.logic.poll_dt_seconds)
        median_samples = int(hw.logic.median_samples)
        median_dt = float(hw.logic.median_sample_dt_seconds)
        approach_lt = float(hw.logic.approach_any_lt_m)
        misalign_max_m = float(hw.logic.misalign_max_cm) / 100.0
        stable_s = float(hw.logic.parked_stable_seconds)

        # phase 2/3: approach + alignment
        entered = False
        stable_start: Optional[float] = None
        last_report_ts = 0.0
        while True:
            dl = _read_distance(us_left, median_samples, median_dt)
            dr = _read_distance(us_right, median_samples, median_dt)
            diff_m = abs(dl - dr)

            # misalign_percent 欄位保留用於 UI 顯示（舊欄位），這裡改放「差值(cm) / 100」等價比例
            _set_state(last_left_m=dl, last_right_m=dr, misalign_percent=diff_m)

            if not entered:
                # 等待車進入：每秒輸出一次距離
                now = time.time()
                if now - last_report_ts >= 1.0:
                    last_report_ts = now
                    _heartbeat(
                        "WAITING_ENTRY",
                        f"等待車進入：left={dl*100:.1f}cm right={dr*100:.1f}cm (任一 < {approach_lt*100:.1f}cm 進入下一階段)",
                    )
                if min(dl, dr) < approach_lt:
                    entered = True
                    _heartbeat("PARKING_YELLOW", "車輛進入 → 切換黃燈，開始車態判斷")
                    set_led(y=True)
                time.sleep(poll_dt)
                continue

            # entered: check alignment
            is_aligned = diff_m <= misalign_max_m
            stable_elapsed = 0.0
            if stable_start is not None:
                stable_elapsed = max(0.0, time.time() - stable_start)

            # 每秒輸出一次車態狀況（直到停妥進入下一階段）
            now = time.time()
            if now - last_report_ts >= 1.0:
                last_report_ts = now
                _heartbeat(
                    "PARKING_YELLOW",
                    f"超音波感測中：left={dl*100:.1f}cm right={dr*100:.1f}cm "
                    f"diff={diff_m*100:.1f}cm (<= {misalign_max_m*100:.1f}cm ? {'YES' if is_aligned else 'NO'}) "
                    f"stable={stable_elapsed:.1f}/{stable_s:.1f}s",
                )

            if not is_aligned:
                # misaligned: yellow + slow beep, reset stability timer
                beeper.set_mode(BeepMode.SLOW)
                stable_start = None
                # message 由每秒輸出負責更新；這裡只確保狀態不前進
            else:
                beeper.set_mode(BeepMode.OFF)
                if stable_start is None:
                    stable_start = time.time()
                elif (time.time() - stable_start) >= stable_s:
                    _heartbeat("VERIFYING", "車態穩定 → 進入拍照驗證")
                    break

            time.sleep(poll_dt)

        # phase 4: capture parking cam + crop ROI + recognize
        cam = hw.cameras.get("parking")
        if cam is None:
            raise RuntimeError("找不到 cameras.parking 設定")

        # ROI lookup: try A-1 then "1" (同時支援 A-2/2)
        roi = None
        for key in _roi_key_candidates(spot_db_id):
            if key in cam.roi_by_spot:
                r = cam.roi_by_spot[key]
                roi = {"x": r.x, "y": r.y, "w": r.w, "h": r.h}
                break
        if roi is None:
            raise RuntimeError(f"找不到 {spot_db_id} 的 ROI（請在後台用停車場相機框選後儲存）")

        # 車牌辨識中：不亮燈（依需求）
        set_led(r=False, y=False, g=False)
        beeper.set_mode(BeepMode.OFF)

        _heartbeat("VERIFYING", f"拍攝停車場相機快照 device={cam.device!r}")
        frame = _capture_frame(cam.device)
        if frame is None:
            raise RuntimeError(f"停車場相機無法拍照 device={cam.device!r}")

        cropped = _crop_roi(frame, roi)
        img_b64 = _encode_jpg_base64(cropped)
        if not img_b64:
            raise RuntimeError("ROI 圖片編碼失敗")

        # call existing LLM helper in views
        from .views import post_to_llm  # local import to avoid heavy deps at import time

        detected = _normalize_plate(
            _run_with_heartbeat(
                "VERIFYING",
                "辨識車牌中",
                lambda: post_to_llm(img_b64),
            )
        )
        _set_state(detected_plate=detected)

        expected = ""
        with _FLOW_LOCK:
            if _FLOW_STATE:
                expected = _FLOW_STATE.expected_plate

        if not expected:
            expected = detected  # fallback: avoid false-negative if expected missing

        if not detected or detected == "UNKNOWN" or detected != expected:
            # mismatch -> red + alarm + abnormal
            _set_state(stage="REJECT_RED", message=f"車牌不符：expected={expected} detected={detected}", done=True, ok=False)
            # 車牌錯誤：亮紅燈 + 蜂鳴器短聲每 3 秒一次（沿用 SLOW 節奏）
            set_led(r=True, y=False, g=False)
            beeper.set_mode(BeepMode.SLOW)

            try:
                spot = ParkingSpot.objects.get(id=spot_db_id)
                spot.status = "ABNORMAL"
                spot.abnormal_reason = f"車牌不符：expected={expected} detected={detected}"
                spot.save(update_fields=["status", "abnormal_reason"])
                LogEntry.objects.create(
                    timestamp=timezone.now(),
                    type="ABNORMAL",
                    message=f"[硬體流程] {spot_db_id} 車牌不符：expected={expected} detected={detected}",
                    spot=spot,
                )
            except Exception:
                pass

            # 保持一段時間讓現場有感（之後可改成直到管理員解除）
            time.sleep(30.0)
            beeper.set_mode(BeepMode.OFF)
        else:
            # 車牌正確：綠燈亮 5 秒後熄燈
            _set_state(stage="ACCEPT_GREEN", message="車牌驗證通過，綠燈亮 5 秒", done=True, ok=True)
            set_led(r=False, y=False, g=True)
            beeper.set_mode(BeepMode.OFF)
            time.sleep(5.0)
            set_led(r=False, y=False, g=False)
            try:
                spot = ParkingSpot.objects.get(id=spot_db_id)
                # 維持 OCCUPIED；清除 abnormal_reason
                if spot.status != "OCCUPIED":
                    spot.status = "OCCUPIED"
                spot.abnormal_reason = None
                spot.save(update_fields=["status", "abnormal_reason"])
                LogEntry.objects.create(
                    timestamp=timezone.now(),
                    type="INFO",
                    message=f"[硬體流程] {spot_db_id} 驗證通過：{expected}",
                    spot=spot,
                )
            except Exception:
                pass

        # cleanup
        try:
            beeper.stop()
        except Exception:
            pass
        try:
            beeper.set_mode(BeepMode.OFF)
        except Exception:
            pass
        try:
            buzzer.off()
        except Exception:
            pass
        try:
            buzzer.close()
        except Exception:
            pass
        try:
            us_left.close()
            us_right.close()
        except Exception:
            pass
        try:
            led_r.close()
            led_y.close()
            led_g.close()
        except Exception:
            pass
    except Exception as e:
        _set_state(stage="ERROR", error=str(e), message="流程失敗", done=True, ok=False)


