"""Ollama OCR backend (default, local).

Wraps the GLM-OCR model running under Ollama on `settings.ollama_url`.
Streams Markdown chunks per page via Ollama's NDJSON `/api/generate`
endpoint. No batch path — Ollama processes one image at a time.
"""

from __future__ import annotations

import base64
import json
from collections.abc import AsyncIterator

import httpx

from paperloom.config import settings
from paperloom.ocr.backends.base import BackendError, OCRBackend


class OllamaBackend(OCRBackend):
    provider_name = "ollama"
    is_local = True
    batch_supported = False

    async def stream_page(
        self,
        image_png: bytes,
        prompt: str,
    ) -> AsyncIterator[str]:
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
                    raise BackendError(f"ollama {resp.status_code}: {body[:200]}")
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
