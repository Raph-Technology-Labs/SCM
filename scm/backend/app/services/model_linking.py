"""
Model-linking helpers: connect a part to an AI model by name.

This is the shared logic behind both "Add new part" and the Excel import:
given a model name (e.g. 'bolt'), find the matching ai_models row; if it does
not exist yet, create it with model_path='<name>.pt' so the backend can load
the right weights. Returns the model_id to store in parts.ai_model_id.
"""

from __future__ import annotations

from typing import Optional
import yaml
from sqlalchemy.orm import Session

from app.inference import resolve_model_filename
from app.models.db import AIModel


def get_or_create_model(
    db: Session,
    model_name: str,
    *,
    create_if_missing: bool = True,
) -> Optional[AIModel]:
    """Look up an AI model by name; optionally create it if not present."""
    name = (model_name or "").strip()
    if not name:
        return None

    model = db.query(AIModel).filter(AIModel.model_name == name).first()
    if model is None and create_if_missing:
        model = AIModel(
            model_name=name,
            model_path=resolve_model_filename(name),  # '<name>.pt'
        )
        db.add(model)
        db.flush()  # assign model_id without committing the whole tx yet
    return model


def resolve_ai_model_id(
    db: Session,
    *,
    model_name: Optional[str] = None,
    ai_model_id: Optional[int] = None,
    create_if_missing: bool = True,
) -> Optional[int]:
    """Resolve the ai_model_id to store on a part.

    Priority: explicit ai_model_id > model_name lookup/create > None.
    """
    if ai_model_id is not None:
        return ai_model_id
    if model_name:
        model = get_or_create_model(db, model_name, create_if_missing=create_if_missing)
        return model.model_id if model else None
    return None

def sync_models_from_yaml(db: Session, path="config.yaml"):
    cfg = yaml.safe_load(open(path))
    for name, m in cfg["models"].items():
        row = db.query(AIModel).filter_by(model_name=name).first()
        if not row:
            row = AIModel(model_name=name); db.add(row)
        row.model_path = m.get("path")
        row.defects = m.get("defects", [])
    db.commit()