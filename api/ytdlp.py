import os
import re
import httpx
import yt_dlp
from fastapi import HTTPException, status
from fastapi.responses import RedirectResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

DEFAULT_FORMAT = "bestvideo+bestaudio/best"

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
        "retries": 3,
        "noplaylist": False,
        "quiet": True,
        "no_warnings": True,
        "extractor_args": extractor_args,
    }

@app.get("/api/info", status_code=status.HTTP_200_OK)
async def get_info(query: str, format: str = DEFAULT_FORMAT):
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
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(query, download=False)
            data = ydl.sanitize_info(info)
        return JSONResponse(
            data,
            headers={"Cache-Control": "s-maxage=2592000, stale-while-revalidate"},
        )
    except yt_dlp.utils.DownloadError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
            headers={"Cache-Control": "no-store, max-age=0"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=repr(exc),
            headers={"Cache-Control": "no-store, max-age=0"},
        )

@app.get("/api/download")
async def download(
    format: str = DEFAULT_FORMAT,
    url: str = None,
):
    if not url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing url parameter",
        )

    try:
        # Extract video ID if possible
        video_id = None
        match = re.search(r"(?:v=|/)([a-zA-Z0-9_-]{11})", url)
        if match:
            video_id = match.group(1)

        # Fetch PO token only for YouTube URLs
        po_token = None
        visitor_data = None

        if "youtube.com" in url or "youtu.be" in url:
            po_token, visitor_data = await fetch_po_token(
                video_id or "unknown",
                client="web",
                context="gvs",
            )

        ydl_opts = build_yt_dlp_opts(
            video_id=video_id or "unknown",
            format_str=format,
            po_token=po_token,
            visitor_data=visitor_data,
        )

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        formats = info.get("formats", [])

        # Exact format match
        selected = next(
            (
                f
                for f in formats
                if str(f.get("format_id")) == str(format)
            ),
            None,
        )

        # Handle merged formats such as 137+140
        if not selected and "+" in format:
            selected = next(
                (
                    f
                    for f in formats
                    if str(f.get("format_id")) == format.split("+")[0]
                ),
                None,
            )

        # Fallback to best format
        if not selected:
            selected = info

        stream_url = selected.get("url")

        if not stream_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No stream URL found for format '{format}'",
            )

        return RedirectResponse(
            url=stream_url,
            status_code=302,
        )

    except yt_dlp.utils.DownloadError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    except Exception as exc:
        print(f"[DOWNLOAD ERROR] {repr(exc)}")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=repr(exc),
        )

@app.get("/api/version", status_code=status.HTTP_200_OK)
async def get_version():
    return JSONResponse(
        {
            "wrapper": yt_dlp.version.__version__,
            "variant": getattr(yt_dlp.version, "VARIANT", None),
            "git_hash": getattr(yt_dlp.version, "RELEASE_GIT_HEAD", None),
        }
    )