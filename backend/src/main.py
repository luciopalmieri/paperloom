from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from contextlib import asynccontextmanager

from src import jobs as jobs_mod
from src.config import settings
from src.routers import files, health, jobs


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    async def _ttl_sweeper():
        while True:
            await asyncio.sleep(3600)
            jobs_mod.cleanup_old_jobs()

    task = asyncio.create_task(_ttl_sweeper())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="pdf-ocr backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(files.router)
app.include_router(jobs.router)
