from contextlib import asynccontextmanager

from fastapi import FastAPI
import sentry_sdk
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

from app.config import settings
from app.db import Base, engine
from app import models  # noqa: F401
from app.observability import configure_tracing
from app.routers import health, plants, wiki

# GlitchTip (Sentry SDK)
if settings.glitchtip_dsn:
    sentry_sdk.init(
        dsn=settings.glitchtip_dsn,
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

tracer_provider = configure_tracing()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield
    if tracer_provider is not None:
        tracer_provider.shutdown()


app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


app.include_router(health.router)
app.include_router(plants.router)
app.include_router(wiki.router)

# OpenTelemetry Setup
# This will automatically capture HTTP metrics and traces
if tracer_provider is not None:
    FastAPIInstrumentor.instrument_app(app, tracer_provider=tracer_provider)
    SQLAlchemyInstrumentor().instrument(engine=engine, tracer_provider=tracer_provider)
