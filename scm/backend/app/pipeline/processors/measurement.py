"""
Converts detections into real-world mm values using calibration_factor from
the part's own config (part.measurement_parameters), instead of hardcoding
calibration factors in Python.

Detected class names are client-specific (each client trains their own YOLO
model on their own parts), so this processor does not hardcode any mapping
from a class name to a measurement family — it uses the detection's own
bbox width/height (already computed generically by InferenceEngine for any
class) and matches detections to the part's configured measurement
instances positionally: the Nth detection in a capture fills the Nth
configured instance, in instance-key order (e.g. "length1", "length2",
"od1", ...). This is the one place that convention lives, so it's easy to
revisit once a client-specific correspondence is defined.
"""

from __future__ import annotations

import numpy as np

from app.models.db import Part
from app.pipeline.config import MeasurementConfig
from app.pipeline.inference_engine import Detection
from app.pipeline.processors.base import ModeProcessor


class MeasurementProcessor(ModeProcessor):
    def initialize(self, part: Part, mode_cfg: MeasurementConfig) -> None:
        self.part = part
        self.cfg = mode_cfg
        self._instances = sorted((part.measurement_parameters or {}).items())

    def process(self, frame: np.ndarray, detections: list[Detection]) -> dict:
        results: dict[str, dict] = {}

        for (instance_key, entry), det in zip(self._instances, detections):
            px_value = max(det.width_px, det.height_px)
            results[instance_key] = self._to_result(px_value, entry or {})

        return results

    @staticmethod
    def _to_result(px_value: float, entry: dict) -> dict:
        calibration_factor = entry.get("calibration_factor") or 1.0
        value_mm = round(px_value * calibration_factor, 4)
        min_value = entry.get("min_value")
        max_value = entry.get("max_value")
        ok = True
        if min_value is not None:
            ok = ok and value_mm >= min_value
        if max_value is not None:
            ok = ok and value_mm <= max_value
        return {"value_mm": value_mm, "min_value": min_value, "max_value": max_value, "ok": ok}
