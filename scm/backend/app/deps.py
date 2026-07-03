"""
Lightweight auth dependencies (no JWT).

The frontend stores the logged-in user after /auth/login and sends the user id
in the `X-User-Id` header on each request. These dependencies look the user up
and enforce role-based access.

This is intentionally simple for a POC / single-machine delivery. To harden for
a networked deployment, swap the header for a signed JWT and verify it here —
the endpoint signatures stay the same.
"""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.models.db import User, get_db

ADMIN_ROLES = {"administrator", "superadministrator"}


def get_current_user(
    x_user_id: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        uid = int(x_user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid user id")
    user = db.get(User, uid)
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown user")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in ADMIN_ROLES:
        raise HTTPException(
            status_code=403, detail="Administrator access required"
        )
    return user
