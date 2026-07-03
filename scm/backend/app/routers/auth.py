"""Authentication endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.db import User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    message: str
    role: str
    user_id: int
    user_name: str


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest) -> dict:
    """Validate credentials against the users table (sha256, as in the desktop app).

    NOTE: returns the user record only. For production, issue a signed token
    (JWT) here and verify it on protected routes.
    """
    result = User.can_login(payload.username, payload.password)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return result
