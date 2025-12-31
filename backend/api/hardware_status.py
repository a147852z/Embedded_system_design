from __future__ import annotations

import os
import platform
import time
from typing import Any, Dict, Optional, Tuple

import cv2

from .hardware_config import HardwareConfig, HardwareConfigError, load_hardware_config


def _safe_exception(e: Exception) -> str:
    return f"{type(e).__name__}: {e}"


def _try_open_camera(device: Any) -> Tuple[bool, Optional[str]]:
    """
    盡量非破壞性地確認相機可用：open -> read frame -> release。
    """
    try:
        if os.name == "nt" and isinstance(device, int):
            cap = cv2.VideoCapture(device, cv2.CAP_DSHOW)
        else:
            cap = cv2.VideoCapture(device)
        if not cap.isOpened():
            try:
                cap.release()
            except Exception:
                pass
            return False, "VideoCapture not opened"
        ok, _frame = cap.read()
        cap.release()
        if not ok:
            return False, "Capture read() failed"
        return True, None
    except Exception as e:
        return False, _safe_exception(e)


def _try_gpio_import() -> Tuple[bool, Optional[Any], Optional[str]]:
    try:
        from gpiozero import LED, Buzzer, DistanceSensor  # type: ignore
        return True, (LED, Buzzer, DistanceSensor), None
    except Exception as e:
        return False, None, _safe_exception(e)


def _try_init_led(LED_cls: Any, pin: int, active_high: bool, active_test: bool) -> Tuple[bool, Optional[str]]:
    try:
        led = LED_cls(pin, active_high=active_high)
        if active_test:
            # 閃兩次，讓人肉眼更容易看到
            for _ in range(2):
                led.on()
                time.sleep(0.35)
                led.off()
                time.sleep(0.15)
        led.close()
        return True, None
    except Exception as e:
        return False, _safe_exception(e)


def _try_init_buzzer(Buzzer_cls: Any, pin: int, active_high: bool, active_test: bool) -> Tuple[bool, Optional[str]]:
    try:
        bz = Buzzer_cls(pin, active_high=active_high)
        if active_test:
            bz.on()
            time.sleep(0.35)
            bz.off()
        bz.close()
        return True, None
    except Exception as e:
        return False, _safe_exception(e)


def _try_init_ultrasonic(DistanceSensor_cls: Any, trigger: int, echo: int, active_read: bool) -> Tuple[bool, Optional[str], Optional[float]]:
    """
    注意：沒有「真正插上感測器」時，軟體也可能成功初始化。
    - passive: 只確認能否初始化（通常檢查到 pin factory/權限問題）
    - active: 讀一次 distance（可能會 timeout / no echo）
    """
    sensor = None
    try:
        sensor = DistanceSensor_cls(echo=echo, trigger=trigger, max_distance=2.0, queue_len=1)
        if not active_read:
            sensor.close()
            return True, None, None

        # active read：用短時間等待，避免卡死（透過輪詢 value）
        deadline = time.time() + 1.2
        val = None
        while time.time() < deadline:
            try:
                v = float(sensor.distance)
                # distance 有時會回 0.0；這裡只回傳讀到的數值
                val = v
                break
            except Exception:
                time.sleep(0.05)
        sensor.close()
        if val is None:
            return False, "No distance read (timeout / no echo)", None
        return True, None, val
    except Exception as e:
        try:
            if sensor is not None:
                sensor.close()
        except Exception:
            pass
        return False, _safe_exception(e), None


def check_hardware_status(*, active: bool = False) -> Dict[str, Any]:
    """
    回傳硬體狀態（給後台顯示用）。
    active=True 時會短暫閃燈/鳴叫、並嘗試讀超音波一次（部署到 Pi 才建議用）。
    """
    info: Dict[str, Any] = {
        "platform": {
            "os_name": os.name,
            "system": platform.system(),
            "release": platform.release(),
        },
        "active_test": bool(active),
    }

    try:
        hw: HardwareConfig = load_hardware_config()
    except HardwareConfigError as e:
        return {**info, "error": str(e)}

    # Cameras
    cameras: Dict[str, Any] = {}
    for name, cam in hw.cameras.items():
        ok, err = _try_open_camera(cam.device)
        cameras[name] = {
            "device": cam.device,
            "ok": ok,
            "error": err,
        }
    info["cameras"] = cameras

    # GPIO related (only meaningful on Pi/Linux, but still safe to run)
    gpio_available, gpio_classes, gpio_err = _try_gpio_import()
    info["gpio"] = {
        "library_ok": gpio_available,
        "error": gpio_err,
        "note": "在 Windows 通常不會安裝/不支援 gpiozero；在樹莓派需要 root/正確權限與 wiring。",
    }

    if not gpio_available:
        # 不做進一步測試
        info["shared"] = {"buzzer": {"pin": hw.buzzer.pin, "ok": False, "error": "gpio library not available"}}
        info["spots"] = {
            sid: {
                "label": s.label,
                "led": {"r": {"pin": s.led.r, "ok": False}, "y": {"pin": s.led.y, "ok": False}, "g": {"pin": s.led.g, "ok": False}},
                "ultrasonic": {
                    "left": {"trigger": s.ultrasonic_left.trigger, "echo": s.ultrasonic_left.echo, "ok": False},
                    "right": {"trigger": s.ultrasonic_right.trigger, "echo": s.ultrasonic_right.echo, "ok": False},
                },
            }
            for sid, s in hw.spots.items()
        }
        return info

    LED_cls, Buzzer_cls, DistanceSensor_cls = gpio_classes

    # Shared buzzer
    buz_ok, buz_err = _try_init_buzzer(Buzzer_cls, hw.buzzer.pin, active_high=hw.gpio_active_high, active_test=active)
    info["shared"] = {"buzzer": {"pin": hw.buzzer.pin, "ok": buz_ok, "error": buz_err}}

    # Per spot
    spots: Dict[str, Any] = {}
    for sid, s in hw.spots.items():
        led_r_ok, led_r_err = _try_init_led(LED_cls, s.led.r, active_high=hw.gpio_active_high, active_test=active)
        led_y_ok, led_y_err = _try_init_led(LED_cls, s.led.y, active_high=hw.gpio_active_high, active_test=active)
        led_g_ok, led_g_err = _try_init_led(LED_cls, s.led.g, active_high=hw.gpio_active_high, active_test=active)

        us_l_ok, us_l_err, us_l_val = _try_init_ultrasonic(
            DistanceSensor_cls, s.ultrasonic_left.trigger, s.ultrasonic_left.echo, active_read=active
        )
        us_r_ok, us_r_err, us_r_val = _try_init_ultrasonic(
            DistanceSensor_cls, s.ultrasonic_right.trigger, s.ultrasonic_right.echo, active_read=active
        )

        spots[sid] = {
            "label": s.label,
            "led": {
                "r": {"pin": s.led.r, "ok": led_r_ok, "error": led_r_err},
                "y": {"pin": s.led.y, "ok": led_y_ok, "error": led_y_err},
                "g": {"pin": s.led.g, "ok": led_g_ok, "error": led_g_err},
            },
            "ultrasonic": {
                "left": {
                    "trigger": s.ultrasonic_left.trigger,
                    "echo": s.ultrasonic_left.echo,
                    "ok": us_l_ok,
                    "error": us_l_err,
                    "distance_m": us_l_val,
                },
                "right": {
                    "trigger": s.ultrasonic_right.trigger,
                    "echo": s.ultrasonic_right.echo,
                    "ok": us_r_ok,
                    "error": us_r_err,
                    "distance_m": us_r_val,
                },
            },
        }
    info["spots"] = spots
    return info


