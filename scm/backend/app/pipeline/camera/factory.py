from __future__ import annotations

from typing import Union

from app.pipeline.camera.base import BaseCamera
from app.pipeline.camera.lucid_camera import LucidCamera
from app.pipeline.camera.simulator_camera import ImageSimulatorCamera, VideoSimulatorCamera
from app.pipeline.config import CountingConfig, DefectDetectionConfig, MeasurementConfig

ModeConfig = Union[CountingConfig, DefectDetectionConfig, MeasurementConfig]


def create_camera(mode_cfg: ModeConfig) -> BaseCamera:
    sim = mode_cfg.simulator
    if sim.enabled:
        # DefectSimulatorConfig carries both fields (video_path and
        # images_dir) so Defect Detection can simulate off either — whichever
        # one is actually filled in wins. images_dir takes priority since an
        # empty default ("") means "not configured".
        if getattr(sim, "images_dir", ""):
            return ImageSimulatorCamera(images_dir=sim.images_dir)
        return VideoSimulatorCamera(video_path=sim.video_path, loop=sim.loop)
    return LucidCamera(mode_cfg.camera)
