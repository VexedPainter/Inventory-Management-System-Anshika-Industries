"""
structured_logging.py
=====================
Structured, auditable logging infrastructure for Anishka Industries ERP.
Formats all system, audit, and HTTP request logs with JSON-structured
fields: timestamp, request_id, log_level, module, user, and latency.
"""

import time
import json
import uuid
import logging
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Configure root logger with structured format
logger = logging.getLogger("anishka_erp")
logger.setLevel(logging.INFO)

if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "module": "%(name)s", "message": %(message)s}'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """
    HTTP Request logging middleware:
    - Injects unique X-Request-ID
    - Records request latency in ms (X-Process-Time)
    - Emits structured JSON log line for every completed API request
    """
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate or capture incoming request ID
        request_id = request.headers.get("X-Request-ID") or f"req-{uuid.uuid4().hex[:12]}"
        start_time = time.perf_counter()

        # Identify user from cookie or test header
        user = request.headers.get("X-User-Role") or "unauthenticated"
        cookie_token = request.cookies.get("ss_token")
        if cookie_token and user == "unauthenticated":
            user = f"token:{cookie_token[:6]}..."

        # Process the request
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            log_data = {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": 500,
                "duration_ms": duration_ms,
                "client_ip": request.client.host if request.client else "unknown",
                "user": user,
                "error": str(exc)
            }
            logger.error(json.dumps(log_data))
            raise exc

        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Skip noisy polling or static assets from heavy logs
        if not request.url.path.startswith(("/static", "/favicon", "/manifest")):
            log_data = {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
                "duration_ms": duration_ms,
                "client_ip": request.client.host if request.client else "unknown",
                "user": user
            }
            logger.info(json.dumps(log_data))

        # Inject tracing headers into response
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time-Ms"] = str(duration_ms)
        return response
