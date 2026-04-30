# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

# uv: official static binary, no pip needed
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# System libs:
#   - libgomp1: pypdfium2 PDFium runtime
#   - WeasyPrint deps (cairo/pango/...) added in Phase 3 if WeasyPrint wins the html→pdf pick
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/*

# Resolve deps first (layer cache friendly)
COPY backend/pyproject.toml backend/uv.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project 2>/dev/null \
 || uv sync --no-install-project

# Project sources (overridden by bind mount in dev)
COPY backend/src ./src
COPY backend/tests ./tests

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
