"""Stub OCR backend for offline development & tests.

Emits canned markdown fragments with a small artificial delay so streaming
UX wiring can be validated without Ollama or any cloud model. Selected
when `OCR_PROVIDER=stub`.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from paperloom.ocr.backends.base import OCRBackend

_CANNED_CHUNKS = [
    "# Page (stub)\n\n",
    "Lorem ipsum dolor sit amet, ",
    "consectetur adipiscing elit. ",
    "Sed do eiusmod tempor incididunt ",
    "ut labore et dolore magna aliqua.\n\n",
    "## Section\n\n",
    "- Bullet one\n",
    "- Bullet two\n",
    "- Bullet three\n\n",
    "| col a | col b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n\n",
]

CHUNK_DELAY_S = 0.08


class StubBackend(OCRBackend):
    provider_name = "stub"
    is_local = True
    batch_supported = False

    async def stream_page(
        self,
        image_png: bytes,
        prompt: str,
    ) -> AsyncIterator[str]:
        for tpl in _CANNED_CHUNKS:
            await asyncio.sleep(CHUNK_DELAY_S)
            yield tpl
