from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Union


class HardwareConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class UltrasonicPins:
    trigger: int
    echo: int


@dataclass(frozen=True)
class LedPins:
    r: int
    y: int
    g: int


@dataclass(frozen=True)
class SpotPins:
    id: str
    label: str
    led: LedPins
    ultrasonic_left: UltrasonicPins
    ultrasonic_right: UltrasonicPins


@dataclass(frozen=True)
class BuzzerPins:
    pin: int


@dataclass(frozen=True)
class Roi:
    x: int
    y: int
    w: int
    h: int


@dataclass(frozen=True)
class CameraConfig:
    name: str
    device: Union[int, str]
    resolution_w: int
    resolution_h: int
    roi_by_spot: Dict[str, Roi]


@dataclass(frozen=True)
class LogicConfig:
    poll_dt_seconds: float
    median_samples: int
    median_sample_dt_seconds: float
    misalign_max_cm: float
    approach_any_lt_m: float
    leave_any_gt_m: float
    parked_stable_seconds: float


@dataclass(frozen=True)
class HardwareConfig:
    version: int
    gpio_numbering: str
    gpio_active_high: bool
    buzzer: BuzzerPins
    spots: Dict[str, SpotPins]
    cameras: Dict[str, CameraConfig]
    logic: LogicConfig


_CONFIG_CACHE: Optional[HardwareConfig] = None


def _default_config_path() -> Path:
    # backend/api/hardware_config.py -> parents[0]=api, parents[1]=backend
    return Path(__file__).resolve().parents[1] / "hardware_config.json"


def _expect_int(value: Any, path: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise HardwareConfigError(f"{path} 必須是整數 (BCM GPIO pin)，但拿到: {value!r}")
    return value


def _expect_float(value: Any, path: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise HardwareConfigError(f"{path} 必須是數字，但拿到: {value!r}")
    return float(value)


def _expect_str(value: Any, path: str) -> str:
    if not isinstance(value, str):
        raise HardwareConfigError(f"{path} 必須是字串，但拿到: {value!r}")
    return value


def _platform_key() -> str:
    # sys.platform: win32 / linux / darwin
    if sys.platform.startswith("win"):
        return "windows"
    if sys.platform.startswith("linux"):
        return "linux"
    if sys.platform == "darwin":
        return "macos"
    return sys.platform


def _expect_device(value: Any, path: str) -> Union[int, str]:
    """
    OpenCV 的 VideoCapture 支援：
    - int: camera index (0/1/2...)
    - str: device path，例如 /dev/video0 或 /dev/v4l/by-id/xxx
    - dict: 依平台選擇，例如 {"windows": 0, "linux": "/dev/v4l/by-id/...", "default": 0}
    """
    if isinstance(value, bool):
        raise HardwareConfigError(f"{path} 不可為布林值，請填 int 或 str: {value!r}")
    if isinstance(value, int):
        return value
    if isinstance(value, dict):
        key = _platform_key()
        chosen = None
        # 先找精準平台鍵，再 fallback default
        if key in value:
            chosen = value.get(key)
        elif "default" in value:
            chosen = value.get("default")
        else:
            # 若 dict 只有一個 key，也允許（避免太嚴格）
            if len(value.keys()) == 1:
                chosen = next(iter(value.values()))
        return _expect_device(chosen, f"{path}.{key if isinstance(value, dict) else 'value'}")
    if isinstance(value, str) and value.strip():
        return value.strip()
    raise HardwareConfigError(f"{path} 必須是 int 或非空字串，但拿到: {value!r}")


def _load_raw_config(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise HardwareConfigError(f"找不到硬體設定檔: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        raise HardwareConfigError(f"硬體設定檔讀取/解析失敗: {path} ({e})")


def get_config_path() -> Path:
    return Path(os.environ.get("HARDWARE_CONFIG_PATH", str(_default_config_path()))).resolve()


def read_raw_hardware_config() -> Dict[str, Any]:
    """
    讀取「原始」硬體設定 JSON（給後台編輯用）。
    注意：這跟 load_hardware_config 回傳的「解析後物件」不同，原始內容會保留 device 的 dict 形式。
    """
    path = get_config_path()
    return _load_raw_config(path)


def validate_raw_hardware_config(raw: Any) -> HardwareConfig:
    """
    驗證 raw JSON（dict）是否符合預期結構；回傳解析後的 HardwareConfig。
    """
    if not isinstance(raw, dict):
        raise HardwareConfigError("設定檔內容必須是 JSON 物件 (object)")
    # 直接走既有 parser；用暫時 cache 不污染全域
    # 這裡複用 load_hardware_config 解析流程的邏輯：把 raw 代入同一套解析
    # 為了避免重複寫 parser，下面把 load_hardware_config 的流程抽成內部函式。
    return _parse_raw_config(raw)


def save_raw_hardware_config(raw: Any) -> HardwareConfig:
    """
    驗證並寫回硬體設定檔（原子寫入），成功後會清掉 cache。
    """
    cfg = validate_raw_hardware_config(raw)
    path = get_config_path()
    tmp_path = path.with_suffix(path.suffix + ".tmp")

    try:
        tmp_path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp_path, path)  # atomic on POSIX; Windows also replaces target
    except Exception as e:
        raise HardwareConfigError(f"寫入硬體設定檔失敗: {path} ({e})")
    finally:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass

    # reset cache
    global _CONFIG_CACHE
    _CONFIG_CACHE = None
    return cfg


def _parse_raw_config(raw: Dict[str, Any]) -> HardwareConfig:
    """
    內部：將 raw dict 解析成 HardwareConfig（load_hardware_config 與 validate 共用）
    """
    version = _expect_int(raw.get("version"), "version")

    gpio = raw.get("gpio", {})
    gpio_numbering = _expect_str(gpio.get("numbering", "BCM"), "gpio.numbering")
    gpio_active_high = bool(gpio.get("active_high", True))

    shared = raw.get("shared", {})
    buzzer_raw = shared.get("buzzer", {})
    buzzer = BuzzerPins(pin=_expect_int(buzzer_raw.get("pin"), "shared.buzzer.pin"))

    spots_raw = raw.get("spots", {})
    if not isinstance(spots_raw, dict) or not spots_raw:
        raise HardwareConfigError("spots 必須是物件且至少包含一個車位")

    spots: Dict[str, SpotPins] = {}
    for spot_id, s in spots_raw.items():
        sid = _expect_str(spot_id, f"spots.<id>")
        if not isinstance(s, dict):
            raise HardwareConfigError(f"spots.{sid} 必須是物件")

        label = _expect_str(s.get("label", f"A-{sid}"), f"spots.{sid}.label")

        led_raw = s.get("led", {})
        led = LedPins(
            r=_expect_int(led_raw.get("r"), f"spots.{sid}.led.r"),
            y=_expect_int(led_raw.get("y"), f"spots.{sid}.led.y"),
            g=_expect_int(led_raw.get("g"), f"spots.{sid}.led.g"),
        )

        us_raw = s.get("ultrasonic", {})
        # 新格式：left/right（兩顆都在後方，左右各一）
        # 向下相容：舊格式 front/rear
        left_raw = us_raw.get("left") or us_raw.get("front", {})
        right_raw = us_raw.get("right") or us_raw.get("rear", {})

        us_left = UltrasonicPins(
            trigger=_expect_int(left_raw.get("trigger"), f"spots.{sid}.ultrasonic.left.trigger"),
            echo=_expect_int(left_raw.get("echo"), f"spots.{sid}.ultrasonic.left.echo"),
        )
        us_right = UltrasonicPins(
            trigger=_expect_int(right_raw.get("trigger"), f"spots.{sid}.ultrasonic.right.trigger"),
            echo=_expect_int(right_raw.get("echo"), f"spots.{sid}.ultrasonic.right.echo"),
        )

        spots[sid] = SpotPins(
            id=sid,
            label=label,
            led=led,
            ultrasonic_left=us_left,
            ultrasonic_right=us_right,
        )

    cameras_raw = raw.get("cameras", {})
    if not isinstance(cameras_raw, dict):
        raise HardwareConfigError("cameras 必須是物件")
    cameras: Dict[str, CameraConfig] = {}
    for cam_name, c in cameras_raw.items():
        name = _expect_str(cam_name, "cameras.<name>")
        if not isinstance(c, dict):
            raise HardwareConfigError(f"cameras.{name} 必須是物件")

        device = _expect_device(c.get("device"), f"cameras.{name}.device")
        res = c.get("resolution", {})
        rw = _expect_int(res.get("width"), f"cameras.{name}.resolution.width")
        rh = _expect_int(res.get("height"), f"cameras.{name}.resolution.height")

        roi_by_spot_raw = c.get("roi_by_spot", {})
        if not isinstance(roi_by_spot_raw, dict):
            raise HardwareConfigError(f"cameras.{name}.roi_by_spot 必須是物件")
        roi_by_spot: Dict[str, Roi] = {}
        for sid, roi in roi_by_spot_raw.items():
            if not isinstance(roi, dict):
                raise HardwareConfigError(f"cameras.{name}.roi_by_spot.{sid} 必須是物件")
            roi_by_spot[_expect_str(sid, f"cameras.{name}.roi_by_spot.<spot>")] = Roi(
                x=_expect_int(roi.get("x"), f"cameras.{name}.roi_by_spot.{sid}.x"),
                y=_expect_int(roi.get("y"), f"cameras.{name}.roi_by_spot.{sid}.y"),
                w=_expect_int(roi.get("w"), f"cameras.{name}.roi_by_spot.{sid}.w"),
                h=_expect_int(roi.get("h"), f"cameras.{name}.roi_by_spot.{sid}.h"),
            )

        cameras[name] = CameraConfig(
            name=name,
            device=device,
            resolution_w=rw,
            resolution_h=rh,
            roi_by_spot=roi_by_spot,
        )

    logic_raw = raw.get("logic", {})
    stabilize = logic_raw.get("stabilize", {})
    thresholds = logic_raw.get("thresholds", {})
    # 車態判斷門檻：優先用公分（新欄位），向下相容舊的 misalign_max_percent
    misalign_cm = thresholds.get("misalign_max_cm", None)
    if misalign_cm is None:
        # 舊欄位：percent（用 3cm 作為預設的等價值）
        # percent 的語意與 cm 不完全等價，這裡僅作 fallback，避免舊設定直接壞掉
        _ = thresholds.get("misalign_max_percent", 0.05)
        misalign_cm = 3.0
    logic = LogicConfig(
        poll_dt_seconds=_expect_float(logic_raw.get("poll_dt_seconds", 0.1), "logic.poll_dt_seconds"),
        median_samples=_expect_int(stabilize.get("median_samples", 5), "logic.stabilize.median_samples"),
        median_sample_dt_seconds=_expect_float(
            stabilize.get("median_sample_dt_seconds", 0.02),
            "logic.stabilize.median_sample_dt_seconds",
        ),
        misalign_max_cm=_expect_float(misalign_cm, "logic.thresholds.misalign_max_cm"),
        approach_any_lt_m=_expect_float(
            thresholds.get("approach_any_lt_m", 0.03),
            "logic.thresholds.approach_any_lt_m",
        ),
        leave_any_gt_m=_expect_float(
            thresholds.get("leave_any_gt_m", 0.05),
            "logic.thresholds.leave_any_gt_m",
        ),
        parked_stable_seconds=_expect_float(
            thresholds.get("parked_stable_seconds", 2.0),
            "logic.thresholds.parked_stable_seconds",
        ),
    )

    return HardwareConfig(
        version=version,
        gpio_numbering=gpio_numbering,
        gpio_active_high=gpio_active_high,
        buzzer=buzzer,
        spots=spots,
        cameras=cameras,
        logic=logic,
    )


def load_hardware_config(*, reload: bool = False) -> HardwareConfig:
    """
    讀取後端硬體設定檔 (腳位/ROI/門檻)。
    - 預設路徑: backend/hardware_config.json
    - 可用環境變數覆蓋: HARDWARE_CONFIG_PATH
    """
    global _CONFIG_CACHE
    if _CONFIG_CACHE is not None and not reload:
        return _CONFIG_CACHE

    cfg_path = get_config_path()
    raw = _load_raw_config(cfg_path)
    cfg = _parse_raw_config(raw)

    _CONFIG_CACHE = cfg
    return cfg


def as_public_dict(cfg: HardwareConfig) -> Dict[str, Any]:
    """
    給 API 用的輸出（避免直接把 dataclass 物件丟給 Response）。
    """
    return {
        "version": cfg.version,
        "gpio": {"numbering": cfg.gpio_numbering, "active_high": cfg.gpio_active_high},
        "shared": {"buzzer": {"pin": cfg.buzzer.pin}},
        "spots": {
            sid: {
                "label": s.label,
                "led": {"r": s.led.r, "y": s.led.y, "g": s.led.g},
                "ultrasonic": {
                    "left": {"trigger": s.ultrasonic_left.trigger, "echo": s.ultrasonic_left.echo},
                    "right": {"trigger": s.ultrasonic_right.trigger, "echo": s.ultrasonic_right.echo},
                },
            }
            for sid, s in cfg.spots.items()
        },
        "cameras": {
            name: {
                "device": cam.device,
                "resolution": {"width": cam.resolution_w, "height": cam.resolution_h},
                "roi_by_spot": {
                    sid: {"x": roi.x, "y": roi.y, "w": roi.w, "h": roi.h} for sid, roi in cam.roi_by_spot.items()
                },
            }
            for name, cam in cfg.cameras.items()
        },
        "logic": {
            "poll_dt_seconds": cfg.logic.poll_dt_seconds,
            "stabilize": {
                "median_samples": cfg.logic.median_samples,
                "median_sample_dt_seconds": cfg.logic.median_sample_dt_seconds,
            },
            "thresholds": {
                "misalign_max_cm": cfg.logic.misalign_max_cm,
                "approach_any_lt_m": cfg.logic.approach_any_lt_m,
                "leave_any_gt_m": cfg.logic.leave_any_gt_m,
                "parked_stable_seconds": cfg.logic.parked_stable_seconds,
            },
        },
    }


