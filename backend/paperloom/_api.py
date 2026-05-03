"""Public Python API for paperloom.

Stable surface — anything imported from `paperloom` (top-level) is part of
the public contract. Internals live in their own modules and are not
covered by SemVer guarantees.
"""

from __future__ import annotations

import asyncio
import tempfile
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from paperloom import chain as _chain_mod
from paperloom import jobs as _jobs_mod
from paperloom import tools as _tool_registry

__version__ = "0.1.0"


def list_tools() -> list[str]:
    """Return slugs of every registered tool."""
    return _tool_registry.list_tools()


def _run_chain(
    chain: list[dict[str, Any]],
    inputs: Sequence[str | Path],
) -> dict[str, Any]:
    """Run a chain synchronously. Returns {job_id, outputs, artifacts}.

    Raises `PaperloomError` on any in-band error event.
    """
    paths = [Path(p).expanduser().resolve() for p in inputs]
    for p in paths:
        if not p.is_file():
            raise FileNotFoundError(p)
    job = _jobs_mod.create_job(chain, [str(p) for p in paths])

    async def _drive() -> dict[str, Any]:
        artifacts: list[dict[str, Any]] = []
        last_error: dict[str, Any] | None = None
        async for ev_type, data in _chain_mod.run(job.job_id, chain, paths):
            if ev_type == "error":
                last_error = data
            elif ev_type == "done":
                artifacts = list(data.get("artifacts") or [])
        if last_error is not None:
            raise PaperloomError(last_error.get("code", "error"), last_error.get("message", ""))
        return {"job_id": job.job_id, "root": job.root, "artifacts": artifacts}

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(_drive())
    # Already inside an event loop — caller should use the async API instead.
    raise RuntimeError(
        "paperloom sync API called inside a running event loop; "
        "use `await paperloom.arun_chain(...)` instead",
    )


async def arun_chain(
    chain: list[dict[str, Any]],
    inputs: Sequence[str | Path],
) -> dict[str, Any]:
    """Async version of the chain runner. Returns {job_id, outputs, artifacts}."""
    paths = [Path(p).expanduser().resolve() for p in inputs]
    for p in paths:
        if not p.is_file():
            raise FileNotFoundError(p)
    job = _jobs_mod.create_job(chain, [str(p) for p in paths])
    artifacts: list[dict[str, Any]] = []
    last_error: dict[str, Any] | None = None
    async for ev_type, data in _chain_mod.run(job.job_id, chain, paths):
        if ev_type == "error":
            last_error = data
        elif ev_type == "done":
            artifacts = list(data.get("artifacts") or [])
    if last_error is not None:
        raise PaperloomError(last_error.get("code", "error"), last_error.get("message", ""))
    return {"job_id": job.job_id, "root": job.root, "artifacts": artifacts}


class PaperloomError(RuntimeError):
    """Tool execution failed in-band (returned an `error` event)."""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(f"{code}: {message}" if message else code)
        self.code = code
        self.message = message


def _read_first_output(job_root: Path, suffixes: tuple[str, ...]) -> str | None:
    out = job_root / "out"
    if not out.is_dir():
        return None
    for p in sorted(out.iterdir()):
        if p.is_file() and p.suffix.lower() in suffixes:
            return p.read_text(encoding="utf-8", errors="replace")
    return None


def ocr_to_markdown(
    input_path: str | Path,
    *,
    pages: str | None = None,
    include_images: bool = False,
    image_strategy: str = "auto",
) -> str:
    """OCR a PDF or image to Markdown via local Ollama (`glm-ocr`).

    `pages` accepts page specs like `"1,3-5"`. `image_strategy` is one of
    `auto|objects|llm`. Returns the full Markdown as a string.

    Raises `PaperloomError` if Ollama is unreachable or the model is missing.
    """
    chain = [
        {
            "slug": "ocr-to-markdown",
            "params": {
                "pages": pages,
                "include_images": include_images,
                "image_strategy": image_strategy,
            },
        }
    ]
    result = _run_chain(chain, [input_path])
    md = _read_first_output(result["root"], (".md", ".txt"))
    if md is None:
        raise PaperloomError("no_output", "OCR produced no markdown file")
    return md


def anonymize(
    text_or_path: str | Path,
    *,
    preset: str = "balanced",
) -> str:
    """Redact PII from a markdown/plain-text input via the OPF model.

    `text_or_path` can be either a path to a `.md`/`.txt` file or the
    text itself (auto-detected: a path that exists is treated as a file).
    `preset` is one of `balanced|recall|precision`. Returns the redacted
    text. OPF auto-installs on first call (set
    PAPERLOOM_AUTO_INSTALL_OPF=0 to disable; install manually with
    `uv pip install 'opf @ git+https://github.com/openai/privacy-filter@main'`).
    """
    candidate = Path(str(text_or_path)).expanduser()
    cleanup: Path | None = None
    if candidate.is_file():
        input_path: Path = candidate
    else:
        tmp = Path(tempfile.mkstemp(suffix=".md")[1])
        tmp.write_text(str(text_or_path), encoding="utf-8")
        input_path = tmp
        cleanup = tmp
    try:
        chain = [{"slug": "anonymize", "params": {"preset": preset}}]
        result = _run_chain(chain, [input_path])
    finally:
        if cleanup is not None:
            cleanup.unlink(missing_ok=True)
    redacted = _read_first_output(result["root"], (".md", ".txt"))
    if redacted is None:
        raise PaperloomError("no_output", "anonymize produced no output file")
    return redacted


class Chain:
    """Compose any registered tools into a pipeline.

    >>> Chain([
    ...     ("pdf-to-images", {"dpi": 200}),
    ...     ("ocr-to-markdown", {}),
    ...     ("anonymize", {"preset": "recall"}),
    ... ]).run(["doc.pdf"])
    """

    def __init__(self, steps: Sequence[tuple[str, dict[str, Any]] | tuple[str]]) -> None:
        normalized: list[dict[str, Any]] = []
        for step in steps:
            if not step:
                raise ValueError("empty step")
            slug = step[0]
            params: dict[str, Any] = step[1] if len(step) > 1 and step[1] else {}  # type: ignore[misc]
            normalized.append({"slug": slug, "params": params})
        self._chain = normalized

    def run(self, inputs: Sequence[str | Path]) -> dict[str, Any]:
        return _run_chain(self._chain, inputs)

    async def arun(self, inputs: Sequence[str | Path]) -> dict[str, Any]:
        return await arun_chain(self._chain, inputs)
