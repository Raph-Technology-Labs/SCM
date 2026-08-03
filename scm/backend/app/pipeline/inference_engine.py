"""
Shared YOLO inference per mode.

InferenceEngine.get(mode, mode_cfg) is the single place a mode's weights get
loaded — cached at the class level so N sessions of the same mode reuse one
loaded model instead of each PipelineSession loading its own copy (and
loading again on every session start, the way gcm's InferenceEngine did).
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Union

import numpy as np

from app.config import settings
from app.pipeline.config import CountingConfig, DefectDetectionConfig, MeasurementConfig

ModeConfig = Union[CountingConfig, DefectDetectionConfig, MeasurementConfig]

MODELS_DIR = Path(settings.MODELS_DIR)


@dataclass
class Detection:
    class_id: int
    class_name: str
    confidence: float
    bbox: list[float]  # [x1, y1, x2, y2]
    width_px: float
    height_px: float

    @property
    def cx(self) -> float:
        return (self.bbox[0] + self.bbox[2]) / 2

    @property
    def cy(self) -> float:
        return (self.bbox[1] + self.bbox[3]) / 2


class InferenceEngine:
    _cache: dict[str, "InferenceEngine"] = {}
    _cache_lock = threading.Lock()

    def __init__(self, model_path: Path, device: str, class_map: dict[int, str]):
        self.model_path = model_path
        self.device = device
        self.class_map = class_map
        self._model = None

    @classmethod
    def get(cls, mode: str, mode_cfg: ModeConfig) -> "InferenceEngine":
        model_path = MODELS_DIR / mode_cfg.model_path
        key = f"{mode}:{model_path}"
        with cls._cache_lock:
            engine = cls._cache.get(key)
            if engine is None:
                engine = cls(model_path, mode_cfg.device, mode_cfg.class_map)
                cls._cache[key] = engine
        engine._ensure_loaded()
        return engine

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model file not found: {self.model_path}")
        from ultralytics import YOLO

        self._model = YOLO(str(self.model_path))

    def infer(self, frame: np.ndarray) -> list[Detection]:
        if self._model is None:
            raise RuntimeError("InferenceEngine model not loaded")

        detections: list[Detection] = []
        for result in self._model(frame, device=self.device, verbose=False):
            for box in result.boxes:
                class_id = int(box.cls[0])
                class_name = self.class_map.get(class_id, self._model.names[class_id])
                w, h = box.xywh[0][2].item(), box.xywh[0][3].item()
                detections.append(
                    Detection(
                        class_id=class_id,
                        class_name=class_name,
                        confidence=float(box.conf[0]),
                        bbox=[float(v) for v in box.xyxy[0].tolist()],
                        width_px=round(float(w), 4),
                        height_px=round(float(h), 4),
                    )
                )
        return detections
