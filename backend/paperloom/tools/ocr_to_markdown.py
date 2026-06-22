from __future__ import annotations

import re
import shutil
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, Literal

from paperloom.ocr import images as img_mod, pipeline, render
from paperloom.tools import register


def _remap_image_filename(name: str, offset: int) -> str:
    m = re.match(r"page-(\d+)(.*)", name)
    if m:
        return f"page-{int(m.group(1)) + offset}{m.group(2)}"
    return name


def _remap_md_images(md: str, offset: int) -> str:
    def _repl(m: re.Match[str]) -> str:
        return str(int(m.group(1)) + offset)

    return re.sub(r"(?<=images/page-)(\d+)", _repl, md)


@register("ocr-to-markdown")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    if not inputs:
        yield "error", {"code": "no_input", "message": "ocr-to-markdown needs at least one input"}
        return

    base_dir = job_root / "work" / str(step)
    selected_pages = _coerce_pages(params.get("pages"))
    include_images = bool(params.get("include_images", False))
    image_strategy: Literal["auto", "objects", "llm"] = _coerce_strategy(
        params.get("image_strategy")
    )

    file_page_counts: list[int] = []
    for inp in inputs:
        if img_mod.is_image(inp.name):
            file_page_counts.append(1)
        else:
            try:
                file_page_counts.append(render.page_count(inp))
            except Exception:
                file_page_counts.append(1)
    total_pages = sum(file_page_counts)

    file_offsets: list[int] = []
    acc = 0
    for c in file_page_counts:
        file_offsets.append(acc)
        acc += c

    global_selected: list[int] | None = None
    if selected_pages is not None:
        valid = [p for p in selected_pages if 1 <= p <= total_pages]
        global_selected = valid if valid else None

    all_page_buffers: dict[int, str] = {}

    for file_idx, inp in enumerate(inputs):
        offset = file_offsets[file_idx]
        local_count = file_page_counts[file_idx]
        file_out_dir = base_dir / f"f{file_idx}"

        file_selected: list[int] | None = None
        if global_selected is not None:
            file_selected = sorted(
                p - offset for p in global_selected if 1 <= p - offset <= local_count
            )
            if not file_selected:
                continue

        async for ev_type, ev_data in pipeline.run_real(
            job_id,
            inp,
            file_out_dir,
            selected_pages=file_selected,
            include_images=include_images,
            image_strategy=image_strategy,
        ):
            if ev_type == "ocr.page" and "page" in ev_data:
                global_page = ev_data["page"] + offset
                yield ev_type, {**ev_data, "page": global_page}
            elif ev_type == "ocr.page.replace" and "page" in ev_data:
                global_page = ev_data["page"] + offset
                md_final = _remap_md_images(ev_data.get("markdown_final", ""), offset)
                all_page_buffers[global_page] = md_final
                yield ev_type, {**ev_data, "page": global_page, "markdown_final": md_final}
            else:
                yield ev_type, ev_data

        file_images = file_out_dir / "images"
        shared_images = base_dir / "images"
        if file_images.is_dir() and any(file_images.iterdir()):
            shared_images.mkdir(parents=True, exist_ok=True)
            for f in sorted(file_images.iterdir()):
                if f.is_file():
                    dest = shared_images / _remap_image_filename(f.name, offset)
                    shutil.move(str(f), str(dest))

    md_text = "\n\n".join(all_page_buffers[p] for p in sorted(all_page_buffers))
    md_path = base_dir / "out.md"
    if all_page_buffers:
        md_path.write_text(md_text, encoding="utf-8")

    outputs: list[str] = []
    if md_path.is_file():
        outputs.append(str(md_path))
    shared_images = base_dir / "images"
    if shared_images.is_dir():
        for f in sorted(shared_images.iterdir()):
            if f.is_file():
                outputs.append(str(f))

    yield "node.end", {"step": step, "tool": "ocr-to-markdown", "outputs": outputs}


def _coerce_strategy(raw: Any) -> Literal["auto", "objects", "llm"]:
    if raw == "objects":
        return "objects"
    if raw == "llm":
        return "llm"
    return "auto"


def _coerce_pages(raw: Any) -> list[int] | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        items = [s.strip() for s in raw.split(",") if s.strip()]
    elif isinstance(raw, list):
        items = raw
    else:
        return None
    out: list[int] = []
    for item in items:
        try:
            n = int(item)
        except (TypeError, ValueError):
            continue
        if n >= 1:
            out.append(n)
    return out or None
