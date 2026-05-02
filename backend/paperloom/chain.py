from __future__ import annotations

import shutil
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from paperloom import jobs as jobs_mod
from paperloom import tools as tool_registry
from paperloom.zip import build_zip


async def run(
    job_id: str,
    chain: list[dict[str, Any]],
    input_files: list[Path],
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Sequential chain executor.

    chain: ordered list of {slug, params}. Each step's outputs feed the next.
    Final step's outputs land under `<jobId>/out/` and a zip artifact is built.
    """
    job_root = jobs_mod._root() / job_id
    current_inputs: list[Path] = list(input_files)

    for step, node in enumerate(chain):
        slug = node.get("slug")
        if not slug or not isinstance(slug, str):
            yield "error", {"job_id": job_id, "code": "bad_node", "message": "missing slug"}
            return
        handler = tool_registry.get(slug)
        if handler is None:
            yield "error", {"job_id": job_id, "code": "unknown_tool", "message": slug}
            return

        params: dict[str, Any] = node.get("params") or {}
        yield "node.start", {
            "job_id": job_id,
            "step": step,
            "tool": slug,
            "node_id": str(step),
        }
        step_outputs: list[Path] = []
        async for ev_type, ev_data in handler(job_id, job_root, current_inputs, params, step):
            if ev_type == "node.end" and "outputs" in ev_data:
                step_outputs = [Path(p) for p in ev_data["outputs"]]
            if ev_type == "error":
                yield ev_type, ev_data
                return
            yield ev_type, ev_data

        current_inputs = step_outputs

    # Materialise final outputs under <jobId>/out/, zip them.
    out_root = job_root / "out"
    out_root.mkdir(parents=True, exist_ok=True)
    for src in current_inputs:
        if not src.is_file():
            continue
        dest = out_root / src.name
        if src.resolve() != dest.resolve():
            shutil.copy2(src, dest)

    zip_path = job_root / "out.zip"
    build_zip(out_root, zip_path)

    yield "done", {
        "job_id": job_id,
        "artifacts": [
            {
                "name": "out.zip",
                "size": zip_path.stat().st_size,
                "url": f"/api/jobs/{job_id}/artifacts/out.zip",
            }
        ],
    }
