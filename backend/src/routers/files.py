from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import Response

from src import jobs
from src.config import settings
from src.ocr import images, render

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

    pages_out: int | None = 1 if images.is_image(filename) else None
    entry = jobs.store_file(filename, content, pages=pages_out)
    return {
        "file_id": entry.file_id,
        "filename": entry.filename,
        "size": entry.size,
        "pages": pages_out,
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
    elif images.is_image(entry.filename):
        pages = 1
    return {
        "file_id": entry.file_id,
        "filename": entry.filename,
        "size": entry.size,
        "pages": pages,
    }


@router.post("/{file_id}/rotate")
async def rotate(file_id: str, degrees: int = 90) -> dict[str, object]:
    entry = jobs.find_file(file_id)
    if not entry:
        raise HTTPException(status_code=404, detail={"code": "file_not_found"})
    if not images.is_image(entry.filename):
        raise HTTPException(status_code=400, detail={"code": "not_an_image"})
    if degrees % 90 != 0:
        raise HTTPException(status_code=400, detail={"code": "invalid_degrees"})
    try:
        images.rotate_in_place(entry.path, degrees)
    except Exception:
        raise HTTPException(status_code=500, detail={"code": "rotate_failed"})
    return {"file_id": file_id, "degrees": degrees % 360}


@router.get("/{file_id}/preview")
async def preview(file_id: str, page: int = 1) -> Response:
    entry = jobs.find_file(file_id)
    if not entry:
        raise HTTPException(status_code=404, detail={"code": "file_not_found"})
    if images.is_image(entry.filename):
        if page != 1:
            raise HTTPException(status_code=404, detail={"code": "page_out_of_range"})
        try:
            png = images.load_as_png(entry.path)
        except Exception:
            raise HTTPException(status_code=500, detail={"code": "render_failed"})
        return Response(content=png, media_type="image/png")
    if not entry.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail={"code": "unsupported_type"})
    try:
        png = render.render_page_png(entry.path, page - 1)
    except IndexError:
        raise HTTPException(status_code=404, detail={"code": "page_out_of_range"})
    except Exception:
        raise HTTPException(status_code=500, detail={"code": "render_failed"})
    return Response(content=png, media_type="image/png")
