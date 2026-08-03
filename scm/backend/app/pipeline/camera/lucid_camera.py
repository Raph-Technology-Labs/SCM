"""
Real LUCID GigE camera via the Arena SDK (arena_api).

Config-driven setup (exposure/gain/resolution/fps straight from
CameraConfig) ported from
/home/thor/mv-desktop/app/inference/workers.py::CaptureWorker.run().

arena_api is imported lazily, inside open(), so this module — and the app —
still imports cleanly on a machine without the SDK/hardware present; only
actually opening a LucidCamera requires it.
"""

from __future__ import annotations

import numpy as np

from app.pipeline.camera.base import BaseCamera
from app.pipeline.config import CameraConfig


class LucidCamera(BaseCamera):
    def __init__(self, camera_cfg: CameraConfig):
        self.camera_cfg = camera_cfg
        self._device = None

    def open(self) -> None:
        from arena_api.system import system

        cfg = self.camera_cfg
        infos = system.device_infos
        if not infos:
            raise RuntimeError("No LUCID camera detected")

        if cfg.serial:
            infos = [i for i in infos if i.get("serial") == cfg.serial]
        elif cfg.ip:
            infos = [i for i in infos if i.get("ip") == cfg.ip]

        if not infos:
            raise RuntimeError(
                f"No LUCID camera matched configured serial={cfg.serial!r} ip={cfg.ip!r}"
            )

        device = system.create_device(infos[0])[0]

        # If anything below fails, destroy the device before re-raising —
        # otherwise a partially-opened handle leaks client-side on every
        # failed attempt, which can itself compound "already in use" /
        # "access denied" errors on the next retry.
        try:
            nodemap = device.nodemap
            nodemap["ExposureAuto"].value = "Off"
            nodemap["ExposureTime"].value = float(cfg.exposure_us)
            nodemap["GainAuto"].value = "Off"
            nodemap["Gain"].value = float(cfg.gain)
            nodemap["Width"].value = int(cfg.resolution.w)
            nodemap["Height"].value = int(cfg.resolution.h)
            nodemap["AcquisitionFrameRateEnable"].value = True
            nodemap["AcquisitionFrameRate"].value = float(cfg.fps)

            device.start_stream()
        except Exception:
            system.destroy_device(device)
            raise

        self._device = device

    def read_frame(self) -> np.ndarray:
        from arena_api.buffer import BufferFactory

        if self._device is None:
            raise RuntimeError("LucidCamera not opened. Call open() first.")

        buffer = self._device.get_buffer(timeout=2000)
        try:
            converted = BufferFactory.convert(buffer, self.camera_cfg.pixel_format)
            try:
                img = np.ctypeslib.as_array(
                    converted.pdata, shape=(converted.height, converted.width, 3)
                )
                return np.ascontiguousarray(np.array(img, copy=True))
            finally:
                BufferFactory.destroy(converted)
        finally:
            self._device.requeue_buffer(buffer)

    def release(self) -> None:
        if self._device is None:
            return
        from arena_api.system import system

        try:
            self._device.stop_stream()
        finally:
            system.destroy_device(self._device)
            self._device = None

    @property
    def is_opened(self) -> bool:
        return self._device is not None
