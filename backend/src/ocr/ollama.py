from __future__ import annotations

import base64
import json
from collections.abc import AsyncIterator

import httpx

from src.config import settings


class OllamaError(RuntimeError):
    pass


async def stream_generate(image_png: bytes, prompt: str) -> AsyncIterator[str]:
    """Stream Markdown chunks from Ollama /api/generate.

    Body: {model, prompt, images:[base64], stream:true}.
    Response: NDJSON, one {model, created_at, response, done} object per line.
    Yields each `response` text fragment until `done:true`.
    """
    payload = {
        "model": settings.ollama_model,
        "prompt": prompt,
        "images": [base64.b64encode(image_png).decode("ascii")],
        "stream": True,
        "options": {
            "num_ctx": 8192,
            "num_predict": 4096,
        },
    }
    url = f"{settings.ollama_url}/api/generate"
    timeout = httpx.Timeout(connect=10.0, read=600.0, write=60.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", url, json=payload) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode(errors="replace")
                raise OllamaError(f"ollama {resp.status_code}: {body[:200]}")
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                chunk = obj.get("response", "")
                if chunk:
                    yield chunk
                if obj.get("done"):
                    break
