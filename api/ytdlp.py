import yt_dlp
from fastapi import FastAPI, HTTPException, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

DEFAULT_FORMAT = "bestvideo+bestaudio/best"

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


@app.get("/api/info", status_code=status.HTTP_200_OK)
async def get_info(query: str, format: str = DEFAULT_FORMAT):
    ydl_opts = {
        "format": format.replace(" ", "+"),
        "retries": 3,
        "noplaylist": False,
        "quiet": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(query, download=False)
            # sanitize_info makes the result safely JSON serializable
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
    except Exception as exc:  # noqa: BLE001 - surface any extractor failure cleanly
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=repr(exc),
            headers={"Cache-Control": "no-store, max-age=0"},
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
