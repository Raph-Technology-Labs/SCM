"""
Lifecycle management for the camera + processor + inference engine backing
one active session.

This is the fix for the anti-pattern found in /home/thor/gcm: there,
camera_manager/inference_engine are bare module-level singletons and every
endpoint independently re-checks is_initialized()/re-calls initialize().
Here there is exactly one place a session's pipeline is created
(PipelineRegistry.create) and exactly one place it's torn down
(PipelineRegistry.remove) — nothing else constructs a camera/processor.

Blocking SDK/inference calls run via asyncio.to_thread so one session's
camera/YOLO work never blocks the event loop (and therefore never blocks
other sessions' requests).
"""

from __future__ import annotations

import asyncio
import base64

import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.models.db import Part
from app.pipeline.camera.base import BaseCamera
from app.pipeline.camera.factory import create_camera
from app.pipeline.config import get_mode_config
from app.pipeline.inference_engine import InferenceEngine
from app.pipeline.processors.base import ModeProcessor
from app.pipeline.processors.factory import create_processor
from app.pipeline.result_processor import ResultProcessor


PREVIEW_MAX_WIDTH = 800


def _encode_frame_jpeg(frame: np.ndarray) -> str | None:
    """Base64 JPEG (no data-URI prefix) for the frontend's capture-poll preview.

    Downscaled — this is a UI preview, not the frame used for inference, and
    a full-resolution JPEG round-trip on every poll is a meaningful chunk of
    Counting's per-capture latency.
    """
    h, w = frame.shape[:2]
    if w > PREVIEW_MAX_WIDTH:
        scale = PREVIEW_MAX_WIDTH / w
        frame = cv2.resize(frame, (PREVIEW_MAX_WIDTH, int(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
    if not ok:
        return None
    return base64.b64encode(buf).decode("ascii")


class PipelineSession:
    def __init__(
        self,
        session_id: int,
        mode: str,
        part: Part,
        camera: BaseCamera,
        processor: ModeProcessor,
        inference_engine: InferenceEngine,
    ):
        self.session_id = session_id
        self.mode = mode
        self.part = part
        self.camera = camera
        self.processor = processor
        self.inference_engine = inference_engine
        self._lock = asyncio.Lock()  # serializes capture calls against this one session

    @classmethod
    async def create(cls, session_id: int, mode: str, part: Part) -> "PipelineSession":
        mode_cfg = get_mode_config(mode)

        camera = create_camera(mode_cfg)
        await asyncio.to_thread(camera.open)

        processor = create_processor(mode)
        processor.initialize(part, mode_cfg)

        inference_engine = InferenceEngine.get(mode, mode_cfg)

        return cls(session_id, mode, part, camera, processor, inference_engine)

    async def capture_and_process(self, db: Session, company_session) -> dict:
        async with self._lock:
            frame = await asyncio.to_thread(self.camera.read_frame)
            detections = await asyncio.to_thread(self.inference_engine.infer, frame)
            mode_result = self.processor.process(frame, detections)
            result = ResultProcessor.process(self.mode, company_session, self.part, mode_result, db)
            result["frame"] = await asyncio.to_thread(_encode_frame_jpeg, frame)
            return result

    async def stop(self) -> None:
        async with self._lock:
            await asyncio.to_thread(self.camera.release)
            self.processor.cleanup()


class PipelineRegistry:
    """The single owner of every active PipelineSession."""

    _sessions: dict[int, PipelineSession] = {}
    _registry_lock = asyncio.Lock()

    @classmethod
    async def create(cls, session_id: int, mode: str, part: Part) -> PipelineSession:
        async with cls._registry_lock:
            if session_id in cls._sessions:
                raise RuntimeError(f"Pipeline already active for session {session_id}")
            pipeline = await PipelineSession.create(session_id, mode, part)
            cls._sessions[session_id] = pipeline
            return pipeline

    @classmethod
    def get(cls, session_id: int) -> PipelineSession | None:
        return cls._sessions.get(session_id)

    @classmethod
    async def remove(cls, session_id: int) -> None:
        async with cls._registry_lock:
            pipeline = cls._sessions.pop(session_id, None)
        if pipeline:
            await pipeline.stop()
