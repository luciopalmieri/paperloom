from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

ToolHandler = Callable[
    [str, Path, list[Path], dict[str, Any], int],
    AsyncIterator[tuple[str, dict[str, Any]]],
]

REGISTRY: dict[str, ToolHandler] = {}


def register(slug: str) -> Callable[[ToolHandler], ToolHandler]:
    def deco(fn: ToolHandler) -> ToolHandler:
        REGISTRY[slug] = fn
        return fn

    return deco


def get(slug: str) -> ToolHandler | None:
    return REGISTRY.get(slug)


def list_tools() -> list[str]:
    return sorted(REGISTRY.keys())


# Importing the modules below registers each handler in REGISTRY.
from src.tools import (  # noqa: E402,F401
    add_page_numbers,
    add_watermark,
    compress_pdf,
    delete_pages,
    extract_pages,
    images_to_pdf,
    markdown_to_html,
    merge_pdfs,
    ocr_to_markdown,
    pdf_to_images,
    pdf_to_text,
    reorder_pages,
    rotate_pages,
    split_pdf,
    strip_metadata,
)
