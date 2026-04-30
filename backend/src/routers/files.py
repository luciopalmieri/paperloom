from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import Response

from src import jobs
from src.config import settings
from src.ocr import render

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("")
async def upload(file: UploadFile) -> dict[str, object]:
    content = await file.read()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail={"code": "file_too_large"})

    filename = file.filename or "upload"
    pages: int | None = None
    if filename.lower().endswith(".pdf"):
        # Quick page-count probe; the entry persists the file regardless.
        entry = jobs.store_file(filename, content, pages=None)
        try:
            pages = render.page_count(entry.path)
        except Exception:
            raise HTTPException(status_code=400, detail={"code": "invalid_pdf"})
        if pages > settings.max_pdf_pages:
            raise HTTPException(status_code=413, detail={"code": "too_many_pages"})
        return {
            "file_id": entry.file_id,
            "filename": entry.filename,
            "size": entry.size,
            "pages": pages,
        }

    entry = jobs.store_file(filename, content, pages=None)
    return {
        "file_id": entry.file_id,
        "filename": entry.filename,
        "size": entry.size,
        "pages": None,
    }


@router.get("/{file_id}")
async def metadata(file_id: str) -> dict[str, object]:
    entry = jobs.find_file(file_id)
    if not entry:
        raise HTTPException(status_code=404, detail={"code": "file_not_found"})
    pages: int | None = None
    if entry.filename.lower().endswith(".pdf"):
        try:
            pages = render.page_count(entry.path)
        except Exception:
            pages = None
    return {
        "file_id": entry.file_id,
        "filename": entry.filename,
        "size": entry.size,
        "pages": pages,
    }


@router.get("/{file_id}/preview")
async def preview(file_id: str, page: int = 1) -> Response:
    entry = jobs.find_file(file_id)
    if not entry:
        raise HTTPException(status_code=404, detail={"code": "file_not_found"})
    if not entry.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail={"code": "not_a_pdf"})
    try:
        png = render.render_page_png(entry.path, page - 1)
    except IndexError:
        raise HTTPException(status_code=404, detail={"code": "page_out_of_range"})
    except Exception:
        raise HTTPException(status_code=500, detail={"code": "render_failed"})
    return Response(content=png, media_type="image/png")
