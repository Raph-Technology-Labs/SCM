"""
Camera-less frame sources for dev/test, enabled per-mode via
machine_config.yaml's `simulator.enabled`. Ported from
/home/thor/mv-desktop/app/inference/simulator.py, adapted to BaseCamera.

VideoSimulatorCamera loops an mp4 — used by Counting and Defect Detection.
ImageSimulatorCamera cycles through a directory of images — used by Measurement.
"""

from __future__ import annotations

import glob
import os
from pathlib import Path

import cv2
import numpy as np

from app.pipeline.camera.base import BaseCamera


class VideoSimulatorCamera(BaseCamera):
    def __init__(self, video_path: str, loop: bool = True):
        self.video_path = video_path
        self.loop = loop
        self._cap: cv2.VideoCapture | None = None

    def open(self) -> None:
        if not Path(self.video_path).exists():
            raise FileNotFoundError(f"Simulator video not found: {self.video_path}")
        self._cap = cv2.VideoCapture(self.video_path)
        if not self._cap.isOpened():
            raise RuntimeError(f"Could not open video: {self.video_path}")

    def read_frame(self) -> np.ndarray:
        if self._cap is None:
            raise RuntimeError("VideoSimulatorCamera not opened. Call open() first.")
        ret, frame = self._cap.read()
        if not ret:
            if not self.loop:
                raise RuntimeError("Simulator video ended")
            self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self._cap.read()
            if not ret:
                raise RuntimeError(f"Could not read from video: {self.video_path}")
        return frame

    def release(self) -> None:
        if self._cap:
            self._cap.release()
            self._cap = None

    @property
    def is_opened(self) -> bool:
        return self._cap is not None and self._cap.isOpened()


class ImageSimulatorCamera(BaseCamera):
    SUPPORTED_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".tiff")

    def __init__(self, images_dir: str):
        self.images_dir = images_dir
        self._image_paths: list[str] = []
        self._index = 0

    def open(self) -> None:
        if not Path(self.images_dir).exists():
            raise FileNotFoundError(f"Simulator images dir not found: {self.images_dir}")
        self._image_paths = sorted(
            p
            for p in glob.glob(os.path.join(self.images_dir, "*"))
            if Path(p).suffix.lower() in self.SUPPORTED_EXTENSIONS
        )
        if not self._image_paths:
            raise RuntimeError(f"No images found in: {self.images_dir}")
        self._index = 0

    def read_frame(self) -> np.ndarray:
        if not self._image_paths:
            raise RuntimeError("ImageSimulatorCamera not opened. Call open() first.")
        path = self._image_paths[self._index]
        frame = cv2.imread(path)
        self._index = (self._index + 1) % len(self._image_paths)
        if frame is None:
            raise RuntimeError(f"Could not read image: {path}")
        return frame

    def release(self) -> None:
        self._image_paths = []
        self._index = 0

    @property
    def is_opened(self) -> bool:
        return bool(self._image_paths)
