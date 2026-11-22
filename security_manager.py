"""
security_manager.py
===================
Enterprise-grade security controls for Anishka Industries Inventory ERP:
- Argon2 / Bcrypt password hashing with automatic transparent upgrade
- Login rate limiting and brute-force lockout (5 attempts -> 15 min lock)
- Password complexity validation and default password detection
- Security headers and secure cookie configuration
"""

import os
import secrets
import datetime
import threading
from typing import Tuple, Dict, Any, Optional

from passlib.context import CryptContext

# ---------------------------------------------------------------------------
# 1. Password Hashing (Argon2id primary, Bcrypt fallback)
# ---------------------------------------------------------------------------

pwd_context = CryptContext(
    schemes=["argon2", "bcrypt"],
    deprecated="auto"
)

# Known seed / default passwords for Anishka ERP
DEFAULT_PASSWORDS = {
    "admin": "admin@2026",
    "manager": "manager@2026",
    "storekeeper": "storekeeper@2026"
}


def hash_password(plain_password: str) -> str:
    """Generate an Argon2id (or bcrypt) password hash."""
    if not plain_password:
        raise ValueError("Password cannot be empty.")
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_or_plain: str) -> bool:
    """
    Verify a plain password against a stored hash or legacy plaintext string.
    Uses constant-time comparison to prevent timing attacks.
    """
    if not plain_password or not hashed_or_plain:
        return False

    # Check if stored value is a modern hash
    if (hashed_or_plain.startswith("$argon2") or 
        hashed_or_plain.startswith("$2b$") or 
        hashed_or_plain.startswith("$2a$")):
        try:
            return pwd_context.verify(plain_password, hashed_or_plain)
        except Exception:
            return False

    # Legacy plaintext fallback (safe constant-time compare)
    return secrets.compare_digest(plain_password, hashed_or_plain)


def needs_rehash(hashed_or_plain: str) -> bool:
    """Check if the password was stored as plaintext or needs hash upgrade."""
    if not (hashed_or_plain.startswith("$argon2") or hashed_or_plain.startswith("$2b$")):
        return True
    try:
        return pwd_context.needs_update(hashed_or_plain)
    except Exception:
        return True


def is_default_password(password: str) -> bool:
    """Check if the provided password matches any known default seed passwords."""
    return password in DEFAULT_PASSWORDS.values()


def validate_password_complexity(password: str) -> Tuple[bool, str]:
    """
    Validate password requirements:
    - Minimum 8 characters
    - At least 1 alphabet character
    - At least 1 digit or special character
    - Cannot match factory default credentials
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not any(c.isalpha() for c in password):
        return False, "Password must contain at least one letter."
    if not any(c.isdigit() or not c.isalnum() for c in password):
        return False, "Password must contain at least one digit or special character."
    if is_default_password(password):
        return False, "You cannot reuse factory default credentials (e.g. admin@2026). Choose a unique password."
    return True, ""


# ---------------------------------------------------------------------------
# 2. Rate Limiting & Account Lockout
# ---------------------------------------------------------------------------

MAX_FAILED_ATTEMPTS = int(os.getenv("MAX_FAILED_ATTEMPTS", "5"))
LOCKOUT_MINUTES = int(os.getenv("LOCKOUT_MINUTES", "15"))

_lock = threading.Lock()
_FAILED_LOGINS: Dict[str, Dict[str, Any]] = {}


def check_rate_limit(identifier: str) -> Tuple[bool, int]:
    """
    Check if an identifier (username or client IP) is currently locked out.
    Returns: (is_locked: bool, seconds_remaining: int)
    """
    with _lock:
        info = _FAILED_LOGINS.get(identifier)
        if not info:
            return False, 0

        locked_until: Optional[datetime.datetime] = info.get("locked_until")
        if locked_until:
            now = datetime.datetime.now()
            if now < locked_until:
                remaining = int((locked_until - now).total_seconds())
                return True, max(1, remaining)
            else:
                # Lockout period expired; reset
                _FAILED_LOGINS.pop(identifier, None)
                return False, 0

        return False, 0


def record_failed_login(identifier: str) -> Tuple[int, bool, int]:
    """
    Record a failed login attempt for an identifier.
    Returns: (attempt_count: int, is_now_locked: bool, lockout_seconds: int)
    """
    with _lock:
        now = datetime.datetime.now()
        info = _FAILED_LOGINS.setdefault(identifier, {
            "attempts": 0,
            "first_failed": now,
            "locked_until": None
        })

        info["attempts"] += 1
        attempts = info["attempts"]

        if attempts >= MAX_FAILED_ATTEMPTS:
            locked_until = now + datetime.timedelta(minutes=LOCKOUT_MINUTES)
            info["locked_until"] = locked_until
            remaining = int((locked_until - now).total_seconds())
            return attempts, True, remaining

        return attempts, False, 0


def record_successful_login(identifier: str) -> None:
    """Clear failed attempt history upon successful authentication."""
    with _lock:
        _FAILED_LOGINS.pop(identifier, None)


def reset_all_rate_limits() -> None:
    """Clear all lockout states (used for test teardown and administrative unlock)."""
    with _lock:
        _FAILED_LOGINS.clear()


# ---------------------------------------------------------------------------
# 3. Security Headers & Cookie Configurations
# ---------------------------------------------------------------------------

SECURE_COOKIES = os.getenv("SECURE_COOKIES", "false").strip().lower() in ("true", "1", "yes")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": (
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: "
        "https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net; "
        "img-src 'self' data: blob: https:;"
    )
}


def get_cookie_params(max_age_seconds: int = 43200) -> Dict[str, Any]:
    """Get standardized secure cookie parameters."""
    return {
        "httponly": True,
        "samesite": "lax",
        "secure": SECURE_COOKIES,
        "max_age": max_age_seconds
    }
