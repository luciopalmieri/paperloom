from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any


def sse_format(event: str, data: dict[str, Any]) -> bytes:
    payload = {"type": event, "ts": datetime.now(timezone.utc).isoformat(), **data}
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode()


async def emit(events: AsyncIterator[tuple[str, dict[str, Any]]]) -> AsyncIterator[bytes]:
    async for name, payload in events:
        yield sse_format(name, payload)
