from __future__ import annotations

import numpy as np

from app.models.db import Part
from app.pipeline.config import CountingConfig
from app.pipeline.inference_engine import Detection
from app.pipeline.processors.base import ModeProcessor


class CountingProcessor(ModeProcessor):
    """Count = number of detections in the current capture (matches
    mv-desktop's CountingPipeline — no cross-frame tracking)."""

    def initialize(self, part: Part, mode_cfg: CountingConfig) -> None:
        self.part = part
        self.cfg = mode_cfg

    def process(self, frame: np.ndarray, detections: list[Detection]) -> dict:
        return {"total_count": len(detections)}
