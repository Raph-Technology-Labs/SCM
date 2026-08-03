"""
Per-class confidence threshold filtering, ported from mv-desktop's
DefectDetectionPipeline._process_results — but thresholds come from the
part's own config (part.defect_parameters) instead of a hardcoded dict,
falling back to mode_cfg.default_confidence_threshold when a detected class
has no matching entry on the part.
"""

from __future__ import annotations

import numpy as np

from app.models.db import Part
from app.pipeline.config import DefectDetectionConfig
from app.pipeline.inference_engine import Detection
from app.pipeline.processors.base import ModeProcessor


class DefectProcessor(ModeProcessor):
    def initialize(self, part: Part, mode_cfg: DefectDetectionConfig) -> None:
        self.part = part
        self.cfg = mode_cfg
        # defect_name (lowercased) -> (instance_key, confidence_threshold)
        self._by_name: dict[str, tuple[str, float]] = {}
        for instance_key, entry in (part.defect_parameters or {}).items():
            defect_name = (entry or {}).get("defect_name")
            if not defect_name:
                continue
            threshold = entry.get("confidence_threshold", mode_cfg.default_confidence_threshold)
            self._by_name[defect_name.strip().lower()] = (instance_key, threshold)

    def process(self, frame: np.ndarray, detections: list[Detection]) -> dict:
        # start every configured defect slot as OK, flip to NOK if a matching
        # detection clears its confidence threshold
        result = {instance_key: "OK" for instance_key, _ in self._by_name.values()}

        for det in detections:
            match = self._by_name.get(det.class_name.strip().lower())
            if match is None:
                continue
            instance_key, threshold = match
            if det.confidence >= threshold:
                result[instance_key] = "NOK"

        return result
