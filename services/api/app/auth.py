"""Opaque, signed, expiring server-side sessions and explicit CSRF checks."""

import hashlib
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from itsdangerous import BadSignature, URLSafeSerializer
from sqlalchemy import select

from .models import BrowserSession, User

COOKIE_NAME = "saf_session"
password_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
DUMMY_HASH = password_hasher.hash(secrets.token_urlsafe(32))


def error(status: int, code: str, message: str):
    raise HTTPException(status_code=status, detail={"code": code, "message": message})


def db_session(request: Request):
    with request.app.state.sessions() as db:
        yield db


def setup_security(app):
    production = os.getenv("APP_ENV", "development") == "production"
    secret = os.getenv("SESSION_SECRET", "")
    if production and len(secret) < 32:
        raise RuntimeError("Production SESSION_SECRET must contain at least 32 characters")
    if not secret:
        path = Path(os.getenv("SESSION_SECRET_FILE", ".local/session-secret"))
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            secret = path.read_text().strip()
        else:
            secret = secrets.token_urlsafe(48)
            with os.fdopen(descriptor, "w") as stream:
                stream.write(secret)
        if len(secret) < 32:
            raise RuntimeError(
                "Development session secret file is invalid; use SESSION_SECRET or a valid SESSION_SECRET_FILE"
            )
    app.state.signer = URLSafeSerializer(secret, salt="saf-command-session-v1")
    app.state.secure_cookie = production or os.getenv("COOKIE_SECURE", "false").lower() == "true"


def new_session(request: Request, response: Response, db, user_id=None):
    token = secrets.token_urlsafe(40)
    row = BrowserSession(
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        csrf_token=secrets.token_hex(32),
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(row)
    db.commit()
    response.set_cookie(
        COOKIE_NAME,
        request.app.state.signer.dumps(token),
        max_age=7 * 86400,
        httponly=True,
        secure=request.app.state.secure_cookie,
        samesite="lax",
        path="/",
    )
    return row


def current_session(request: Request, response: Response, db=Depends(db_session)):
    cookie = request.cookies.get(COOKIE_NAME)
    row = None
    if cookie:
        try:
            token = request.app.state.signer.loads(cookie)
            if isinstance(token, str):
                row = db.scalar(
                    select(BrowserSession).where(
                        BrowserSession.token_hash == hashlib.sha256(token.encode()).hexdigest()
                    )
                )
        except BadSignature:
            row = None
    if row and row.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        row = None
    return row or new_session(request, response, db)


def csrf_session(request: Request, principal=Depends(current_session)):
    supplied = request.headers.get("x-csrf-token", "")
    if not secrets.compare_digest(supplied, principal.csrf_token):
        error(403, "csrf_failed", "Session expired or CSRF token missing; refresh the page and try again")
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in request.app.state.allowed_origins:
        error(403, "origin_denied", "This origin is not allowed to modify the application")
    return principal


def public_user(user):
    return {"id": user.id, "email": user.email, "display_name": user.display_name} if user else None


def auth_payload(principal, db):
    return {
        "user": public_user(db.get(User, principal.user_id) if principal.user_id else None),
        "csrf_token": principal.csrf_token,
    }


def verify_password(stored: str, supplied: str):
    try:
        return password_hasher.verify(stored, supplied)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


class RateLimiter:
    def __init__(self):
        self.events = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, category: str, key: str, maximum: int, period: float = 60):
        clock = time.monotonic()
        with self.lock:
            bucket = self.events[(category, key)]
            while bucket and bucket[0] < clock - period:
                bucket.popleft()
            if len(bucket) >= maximum:
                error(429, "rate_limited", "Too many requests; wait a minute before trying again")
            bucket.append(clock)
            if len(self.events) > 10000:
                for old_key in list(self.events):
                    if not self.events[old_key] or self.events[old_key][-1] < clock - period:
                        self.events.pop(old_key, None)


limiter = RateLimiter()
