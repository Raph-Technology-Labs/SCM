"""
FastAPI application entrypoint.

Run (from the project root):
    uvicorn app.main:app --reload
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.auth import router as auth_router
from app.routers.dashboard import router as dashboard_router
from app.routers.routers import router
from app.services.model_linking import sync_models_from_yaml

app = FastAPI(title=settings.APP_NAME)

# CORS — the React dev server usually runs on :5173 (Vite) or :3000 (CRA).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(router)


@app.get("/", tags=["system"])
def root() -> dict:
    return {"app": settings.APP_NAME, "docs": "/docs"}
    

@app.on_event("startup")
def load_models():
    db = SessionLocal()
    try:
        sync_models_from_yaml(db, "config.yaml")
    finally:
        db.close()
