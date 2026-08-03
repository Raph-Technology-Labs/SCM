"""
Mode-specific processing — turns raw YOLO detections for one capture into a
mode result dict. Modeled on mv-desktop's BasePipeline template
(_run_inference/_process_results split), but inference itself is factored
out into the shared InferenceEngine rather than living on the processor.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import numpy as np

from app.models.db import Part
from app.pipeline.inference_engine import Detection


class ModeProcessor(ABC):
    @abstractmethod
    def initialize(self, part: Part, mode_cfg: Any) -> None:
        """Bind this processor to a specific part + its mode config."""

    @abstractmethod
    def process(self, frame: np.ndarray, detections: list[Detection]) -> dict:
        """Turn this capture's detections into a mode-specific result dict."""

    def reset(self) -> None:
        pass

    def cleanup(self) -> None:
        pass
