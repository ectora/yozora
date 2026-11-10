import asyncio
import ipaddress
import os
import re
import socket
import time
from collections import deque
from urllib.parse import urlparse

import httpx
import yt_dlp
from fastapi import FastAPI, HTTPException, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

DEFAULT_FORMAT = "bestvideo+bestaudio/best"
MAX_QUERY_LENGTH = 2048
MAX_FORMAT_LENGTH = 256
RATE_WINDOW_SECONDS = 60
RATE_LIMIT = 20
_request_times = {}


def _check_rate_limit(client_id: str):
    now = time.monotonic()
    recent = _request_times.setdefault(client_id, deque())
    while recent and now - recent[0] > RATE_WINDOW_SECONDS:
        recent.popleft()
    if len(recent) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="too many requests")
    recent.append(now)


def _is_public_address(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified)


def _validate_public_url(value: str) -> str:
    if len(value) > MAX_QUERY_LENGTH:
        raise HTTPException(status_code=400, detail="query is too long")
    if value.startswith("ytsearch:"):
        if not value.removeprefix("ytsearch:").strip():
            raise HTTPException(status_code=400, detail="search query is required")
        return value
    if re.fullmatch(r"[A-Za-z0-9_-]{6,32}", value):
        return value
    parsed = urlparse(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="only public HTTP(S) URLs are allowed")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)}
    except (OSError, ValueError):
        raise HTTPException(status_code=400, detail="URL host could not be resolved")
    if not addresses or not all(_is_public_address(address) for address in addresses):
        raise HTTPException(status_code=400, detail="URL must resolve to a public address")
    return value


# ── PO Token Provider Config ───────────────────────────────────────────────
PO_TOKEN_PROVIDER_URL = os.environ.get("PO_TOKEN_PROVIDER_URL", "https://poptox.onrender.com")
PO_TOKEN_API_KEY = os.environ.get("PO_TOKEN_API_KEY", None)

app = FastAPI(docs_url=None, redoc_url=None)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return PlainTextResponse(str(exc.detail), status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return PlainTextResponse(str(exc), status_code=status.HTTP_400_BAD_REQUEST)


@app.get("/favicon.ico", status_code=status.HTTP_200_OK)
async def favicon_blank():
    return PlainTextResponse("")


# ── PO Token Helper ────────────────────────────────────────────────────────
async def fetch_po_token(video_id: str, client: str = "web", context: str = "gvs"):
    """Fetch a PO token from the BgUtils provider service."""
    try:
        headers = {"Content-Type": "application/json"}
        if PO_TOKEN_API_KEY:
            headers["x-api-key"] = PO_TOKEN_API_KEY

        async with httpx.AsyncClient(timeout=30.0) as client_http:
            response = await client_http.post(
                f"{PO_TOKEN_PROVIDER_URL}/get_pot",
                headers=headers,
                json={
                    "video_id": video_id,
                    "client": client,
                    "context": context,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("po_token"), data.get("visitor_data")
    except Exception as exc:
        print(f"[PO Token] Provider error: {exc}")
        return None, None


def build_yt_dlp_opts(video_id: str, format_str: str, po_token: str | None = None, visitor_data: str | None = None):
    """Build yt-dlp options with PO token injected into extractor_args."""
    extractor_args = {
        "youtube": {
            "player_client": ["web"],
        }
    }

    # Format: CLIENT.CONTEXT+PO_TOKEN (e.g., web.gvs+XXX, web.player+XXX)
    po_token_parts = []
    if po_token:
        po_token_parts.append(f"web.gvs+{po_token}")
        po_token_parts.append(f"web.player+{po_token}")

    if po_token_parts:
        extractor_args["youtube"]["po_token"] = po_token_parts

    if visitor_data:
        extractor_args["youtube"]["visitor_data"] = [visitor_data]

    return {
        "format": format_str.replace(" ", "+"),
        "retries": 2,
        "noplaylist": True,
        "playlistend": 1,
        "quiet": True,
        "socket_timeout": 15,
        "extractor_retries": 1,
        "no_warnings": True,
        "extractor_args": extractor_args,
    }

@app.get("/api/info", status_code=status.HTTP_200_OK)
async def get_info(query: str, format: str = DEFAULT_FORMAT):
    _check_rate_limit("info")
    if not query or len(format) > MAX_FORMAT_LENGTH:
        raise HTTPException(status_code=400, detail="invalid query or format")
    query = _validate_public_url(query)
    # Extract video ID from URL or raw ID
    video_id = None
    if len(query) == 11 and query.replace("-", "").replace("_", "").isalnum():
        video_id = query
    else:
        match = re.search(r"(?:v=|/)([a-zA-Z0-9_-]{11})", query)
        if match:
            video_id = match.group(1)

    # Fetch PO token from BgUtils provider
    po_token, visitor_data = None, None
    if video_id:
        po_token, visitor_data = await fetch_po_token(video_id, client="web", context="gvs")

    # Build yt-dlp options with PO token
    ydl_opts = build_yt_dlp_opts(
        video_id=video_id or "unknown",
        format_str=format,
        po_token=po_token,
        visitor_data=visitor_data,
    )

    try:
        def extract():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(query, download=False)
                return ydl.sanitize_info(info)

        data = await asyncio.wait_for(asyncio.to_thread(extract), timeout=45)
        return JSONResponse(data, headers={"Cache-Control": "no-store, max-age=0"})
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="media extraction timed out")
    except yt_dlp.utils.DownloadError:
        raise HTTPException(status_code=400, detail="unable to extract media information")
    except Exception:
        print("[yt-dlp] unexpected extraction failure")
        raise HTTPException(status_code=400, detail="unable to extract media information")


@app.get("/api/version", status_code=status.HTTP_200_OK)
async def get_version():
    return JSONResponse(
        {
            "wrapper": yt_dlp.version.__version__,
            "variant": getattr(yt_dlp.version, "VARIANT", None),
            "git_hash": getattr(yt_dlp.version, "RELEASE_GIT_HEAD", None),
        }
    )
