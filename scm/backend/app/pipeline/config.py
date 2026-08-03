"""
Loader for backend/app/config/machine_config.yaml.

Pydantic models mirroring the YAML shape: one CameraConfig shared by all
three modes, plus a per-mode config block (Counting / Defect Detection /
Measurement) carrying its own model_path/device/class_map/simulator.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "machine_config.yaml"

MODE_TO_YAML_KEY = {
    "Counting": "counting",
    "Defect Detection": "defect_detection",
    "Measurement": "measurement",
}


class SystemConfig(BaseModel):
    name: str = "MV Web"
    debug: bool = False


class RoiConfig(BaseModel):
    x: int
    y: int
    w: int
    h: int


class GuideRoiConfig(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int


class ResolutionConfig(BaseModel):
    w: int
    h: int


class CameraConfig(BaseModel):
    type: str = "lucid"
    serial: str = ""
    ip: str = ""
    resolution: ResolutionConfig
    fps: int = 30
    exposure_us: float = 10000.0
    gain: float = 1.0
    pixel_format: str = "BGR8"
    roi: Optional[RoiConfig] = None


class DisplayConfig(BaseModel):
    show_bboxes: bool = True
    show_count: bool = False


class TrackingConfig(BaseModel):
    counting_line_y: int
    max_missed: int = 5
    min_movement: int = 5
    count_threshold: int = 20
    count_threshold_last: int = 5


class VideoSimulatorConfig(BaseModel):
    enabled: bool = False
    video_path: str = ""
    loop: bool = True


class ImageSimulatorConfig(BaseModel):
    enabled: bool = False
    images_dir: str = ""


class CountingConfig(BaseModel):
    guide_roi: Optional[GuideRoiConfig] = None
    model_path: str
    device: str = "cpu"
    class_map: dict[int, str] = {}
    camera: CameraConfig
    tracking: TrackingConfig
    display: DisplayConfig = DisplayConfig()
    simulator: VideoSimulatorConfig = VideoSimulatorConfig()


class DefectDetectionConfig(BaseModel):
    guide_roi: Optional[GuideRoiConfig] = None
    model_path: str
    device: str = "cpu"
    class_map: dict[int, str] = {}
    camera: CameraConfig
    default_confidence_threshold: float = 0.75
    display: DisplayConfig = DisplayConfig()
    simulator: VideoSimulatorConfig = VideoSimulatorConfig()


class MeasurementConfig(BaseModel):
    guide_roi: Optional[GuideRoiConfig] = None
    model_path: str
    device: str = "cpu"
    class_map: dict[int, str] = {}
    camera: CameraConfig
    units: str = "mm"
    display: DisplayConfig = DisplayConfig()
    simulator: ImageSimulatorConfig = ImageSimulatorConfig()


class MachineConfig(BaseModel):
    system: SystemConfig
    counting: CountingConfig
    defect_detection: DefectDetectionConfig
    measurement: MeasurementConfig


@lru_cache(maxsize=1)
def load_machine_config() -> MachineConfig:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    return MachineConfig(**raw)


def get_mode_config(mode: str) -> CountingConfig | DefectDetectionConfig | MeasurementConfig:
    yaml_key = MODE_TO_YAML_KEY.get(mode)
    if yaml_key is None:
        raise ValueError(f"Unknown mode_of_operation: {mode!r}")
    return getattr(load_machine_config(), yaml_key)
