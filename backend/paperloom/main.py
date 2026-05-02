from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from contextlib import asynccontextmanager

from paperloom import jobs as jobs_mod
from paperloom.config import settings
from paperloom.routers import files, health, jobs


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


app = FastAPI(title="paperloom backend", version="0.1.0", lifespan=lifespan)

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
