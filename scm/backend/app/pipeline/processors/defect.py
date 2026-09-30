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
        boxes: list[dict] = []
        frame_h, frame_w = frame.shape[:2]

        for det in detections:
            match = self._by_name.get(det.class_name.strip().lower())
            if match is None:
                continue
            instance_key, threshold = match
            if det.confidence < threshold:
                continue
            result[instance_key] = "NOK"
            if self.cfg.display.show_bboxes:
                x1, y1, x2, y2 = det.bbox
                # normalized (0-1) so the frontend can overlay them on the
                # preview JPEG regardless of what size that got downscaled to
                boxes.append(
                    {
                        "instance_key": instance_key,
                        "defect_name": det.class_name,
                        "confidence": round(det.confidence, 4),
                        "bbox": [x1 / frame_w, y1 / frame_h, x2 / frame_w, y2 / frame_h],
                    }
                )

        return {"status": result, "boxes": boxes}
