"""
Inference module: resolve which .pt weights file a part should use, and load it.

The link works like this:
    parts.ai_model_id  ->  ai_models.model_name / model_path
So each part carries a reference to a model, and the model row knows the file
(e.g. model_name='bolt' -> model_path='bolt.pt').

`resolve_model_path()` is the data-driven replacement for a hard-coded
if/else chain. The equivalent if/else is shown in `_legacy_if_else_example()`
so the mapping logic is explicit.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.config import settings
from app.models.db import Part

MODELS_DIR = Path(settings.MODELS_DIR)

# simple in-process cache so a given .pt is loaded from disk only once
_loaded_models: dict[str, object] = {}


def resolve_model_filename(model_name: str, model_path: Optional[str] = None) -> str:
    """Return the weights filename for a model name.

    If the ai_models row stored an explicit `model_path` use it; otherwise
    fall back to the convention `<model_name>.pt`.
    """
    if model_path:
        return model_path
    return f"{model_name}.pt"


def resolve_model_path_for_part(part: Part) -> Path:
    """Return the absolute path to the .pt file linked to this part.

    Uses the part -> ai_model relationship. Raises if the part has no model.
    """
    model = part.ai_model
    if model is None:
        raise ValueError(
            f"Part '{part.part_code}' has no linked AI model (ai_model_id is NULL)."
        )
    filename = resolve_model_filename(model.model_name, model.model_path)
    path = MODELS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Model file not found on backend: {path}")
    return path


def load_model(path: Path):
    """Lazily load and cache a model from a .pt file.

    Wire your real loader here (e.g. torch.load / YOLO(str(path))).
    Left as a stub so the DB layer has no hard dependency on the ML runtime.
    """
    key = str(path)
    if key not in _loaded_models:
        # --- replace with your actual model loading, e.g.: ---
        # from ultralytics import YOLO
        # _loaded_models[key] = YOLO(str(path))
        _loaded_models[key] = {"stub_model_path": key}
    return _loaded_models[key]


def get_model_for_part(part: Part):
    """Convenience: resolve the path and return the loaded model for a part."""
    return load_model(resolve_model_path_for_part(part))


def _legacy_if_else_example(model_name: str) -> str:
    """The hard-coded style the ai_models table replaces (illustration only).

    Instead of editing this function whenever a model is added, insert a row
    into ai_models and link it via parts.ai_model_id.
    """
    name = (model_name or "").strip().lower()
    if name == "bolt":
        return "bolt.pt"
    elif name == "nut":
        return "nut.pt"
    elif name == "screw":
        return "screw.pt"
    else:
        raise ValueError(f"Unknown model name: {model_name!r}")


def ping() -> str:
    return "inference module ready"
