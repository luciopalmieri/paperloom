from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "glm-ocr:latest"

    opf_device: str = "cpu"

    max_file_size_mb: int = 50
    max_pdf_pages: int = 200
    max_files_per_job: int = 10

    job_storage_root: str = "/tmp/pdf-ocr"
    job_ttl_hours: int = 24

    cors_origin: str = "http://localhost:3000"


settings = Settings()
