from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_storage_root() -> str:
    return str(Path.home() / ".paperloom")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # OCR provider selection. "ollama" (default, local) or "mistral" (cloud,
    # requires paperloom[mistral] + MISTRAL_API_KEY). Other providers may
    # land later — see paperloom.ocr.backends.available_providers().
    ocr_provider: str = "ollama"

    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "glm-ocr:latest"

    # Mistral cloud OCR — only consulted when ocr_provider == "mistral".
    # mode is "batch" (one API call per PDF, cheaper, no streaming) or
    # "per_page" (one call per rendered page, costlier, streaming).
    mistral_api_key: str = ""
    mistral_ocr_model: str = "mistral-ocr-latest"
    mistral_ocr_mode: str = "batch"
    mistral_api_base: str = "https://api.mistral.ai"

    opf_device: str = "cpu"

    max_file_size_mb: int = 50
    max_pdf_pages: int = 200
    max_files_per_job: int = 10

    # Defaults to ~/.paperloom (created with 0700 on first access).
    # Override via PAPERLOOM_JOB_STORAGE_ROOT for tests/containers.
    job_storage_root: str = _default_storage_root()
    job_ttl_hours: int = 24

    cors_origin: str = "http://localhost:3000"

    # Comma-separated allowlist of directories the MCP `register_file`
    # tool may copy from. Defaults to common user folders. Anything outside
    # is rejected to limit blast radius if an LLM is asked (or tricked) to
    # OCR sensitive paths like ~/.ssh/.
    mcp_allowed_dirs: str = (
        f"{Path.home() / 'Documents'},"
        f"{Path.home() / 'Downloads'},"
        f"{Path.home() / 'Desktop'}"
    )


settings = Settings()
