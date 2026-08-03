"""
Common camera interface — one shape shared by the real LUCID GigE camera and
both simulator sources, so a PipelineSession never needs to know which one
it's holding.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np


class BaseCamera(ABC):
    @abstractmethod
    def open(self) -> None:
        """Acquire the frame source. Called exactly once, by PipelineSession.create."""

    @abstractmethod
    def read_frame(self) -> np.ndarray:
        """Return the next/latest frame as a BGR numpy array."""

    @abstractmethod
    def release(self) -> None:
        """Release the frame source. Called exactly once, by PipelineSession.stop."""

    @property
    @abstractmethod
    def is_opened(self) -> bool: ...

    def __enter__(self) -> "BaseCamera":
        self.open()
        return self

    def __exit__(self, *exc) -> None:
        self.release()
