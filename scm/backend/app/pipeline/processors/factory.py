from __future__ import annotations

from app.pipeline.processors.base import ModeProcessor
from app.pipeline.processors.counting import CountingProcessor
from app.pipeline.processors.defect import DefectProcessor
from app.pipeline.processors.measurement import MeasurementProcessor

_PROCESSORS: dict[str, type[ModeProcessor]] = {
    "Counting": CountingProcessor,
    "Defect Detection": DefectProcessor,
    "Measurement": MeasurementProcessor,
}


def create_processor(mode: str) -> ModeProcessor:
    processor_cls = _PROCESSORS.get(mode)
    if processor_cls is None:
        raise ValueError(f"Unknown mode_of_operation: {mode!r}")
    return processor_cls()
