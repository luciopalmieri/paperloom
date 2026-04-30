from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

# Canned Markdown chunks per page. Phase 2 stub: deterministic, lets the UI
# wire up streaming + scroll-sync without a real model.
_CANNED_CHUNKS = [
    "# Page {page}\n\n",
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


async def stream_page(page: int) -> AsyncIterator[str]:
    for tpl in _CANNED_CHUNKS:
        await asyncio.sleep(CHUNK_DELAY_S)
        yield tpl.format(page=page)
