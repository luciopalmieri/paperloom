from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src import jobs as jobs_mod
from src.ocr import pipeline as ocr_pipeline
from src.sse import emit

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class CreateJobBody(BaseModel):
    tools: list[str]
    inputs: list[str]


@router.post("")
async def create(body: CreateJobBody) -> dict[str, str]:
    if not body.tools or not body.inputs:
        raise HTTPException(status_code=400, detail={"code": "empty_job"})
    job = jobs_mod.create_job(body.tools, body.inputs)
    return {"job_id": job.job_id}


@router.get("/{job_id}/events")
async def events(job_id: str) -> StreamingResponse:
    # Phase 2 stub: only the ocr-to-markdown tool exists. Resolve the first
    # input file, run the stub pipeline, stream NDJSON-as-SSE.
    job_root = jobs_mod._root() / job_id
    if not job_root.is_dir():
        raise HTTPException(status_code=404, detail={"code": "job_not_found"})

    import json
    meta = json.loads((job_root / "job.json").read_text())
    tools: list[str] = meta["tools"]
    inputs: list[str] = meta["inputs"]

    if tools != ["ocr-to-markdown"]:
        raise HTTPException(status_code=400, detail={"code": "unsupported_chain"})

    file_entry = jobs_mod.find_file(inputs[0])
    if not file_entry:
        raise HTTPException(status_code=404, detail={"code": "input_not_found"})

    async def stream() -> Any:
        async for event in emit(ocr_pipeline.run_stub(job_id, file_entry.path)):
            yield event

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
