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
from app.models.db import SessionLocal

app = FastAPI(title=settings.APP_NAME)

# CORS — the React dev server usually runs on :5173 (Vite) or :3000 (CRA),
# reachable from localhost, the LAN, or a Tailscale address depending on
# where the browser actually is relative to this machine.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # allow_origin_regex=r"http://(127\.0\.0\.1|100\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+):(5173|3000)",
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
    import os
    if not os.path.exists("config.yaml"):
        print("config.yaml not found — skipping model sync")
        return
    db = SessionLocal()
    try:
        sync_models_from_yaml(db, "config.yaml")
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8011)
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
