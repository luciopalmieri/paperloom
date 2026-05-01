from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, field_validator

from src import chain as chain_mod
from src import jobs as jobs_mod
from src.sse import emit

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class CreateJobBody(BaseModel):
    tools: list[dict[str, Any]]
    inputs: list[str]

    @field_validator("tools", mode="before")
    @classmethod
    def _normalise(cls, v: Any) -> list[dict[str, Any]]:
        if not isinstance(v, list):
            return v
        out: list[dict[str, Any]] = []
        for item in v:
            if isinstance(item, str):
                out.append({"slug": item, "params": {}})
            elif isinstance(item, dict):
                out.append({"slug": item.get("slug", ""), "params": item.get("params", {})})
            else:
                out.append({"slug": "", "params": {}})
        return out


@router.post("")
async def create(body: CreateJobBody) -> dict[str, str]:
    if not body.tools or not body.inputs:
        raise HTTPException(status_code=400, detail={"code": "empty_job"})
    job = jobs_mod.create_job(body.tools, body.inputs)
    return {"job_id": job.job_id}


@router.get("/{job_id}/events")
async def events(job_id: str) -> StreamingResponse:
    job_root = jobs_mod.find_job_root(job_id)
    if job_root is None:
        raise HTTPException(status_code=404, detail={"code": "job_not_found"})

    meta = json.loads((job_root / "job.json").read_text())
    chain: list[dict[str, Any]] = meta["chain"]
    inputs: list[str] = meta["inputs"]

    input_paths = []
    for file_id in inputs:
        entry = jobs_mod.find_file(file_id)
        if entry is None:
            raise HTTPException(status_code=404, detail={"code": "input_not_found"})
        input_paths.append(entry.path)

    async def stream() -> Any:
        async for event in emit(chain_mod.run(job_id, chain, input_paths)):
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


@router.get("/{job_id}/artifacts/{name}")
async def artifact(job_id: str, name: str) -> FileResponse:
    if "/" in name or ".." in name:
        raise HTTPException(status_code=400, detail={"code": "bad_artifact_name"})
    job_root = jobs_mod.find_job_root(job_id)
    if job_root is None:
        raise HTTPException(status_code=404, detail={"code": "job_not_found"})
    path = job_root / name
    try:
        path = jobs_mod.safe_under(path, job_root)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail={"code": "bad_artifact_name"}
        ) from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail={"code": "artifact_not_found"})
    return FileResponse(path, filename=name)
