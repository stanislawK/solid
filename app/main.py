import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import sentry_sdk
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.requests import Request

from app.config import settings
from app.db import Base, engine
from app import models  # noqa: F401
from app.observability import configure_tracing
from app.routers import auth, health, plants, wiki
from starlette.middleware.sessions import SessionMiddleware

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
    if settings.database_url.startswith("sqlite"):
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    yield
    if tracer_provider is not None:
        tracer_provider.shutdown()


app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
    lifespan=lifespan,
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret_key,
    same_site=settings.session_same_site,
    https_only=settings.session_https_only,
    max_age=settings.session_max_age_seconds,
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts_list,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)


def _request_uses_https(request: Request) -> bool:
    if settings.trust_proxy_headers:
        forwarded_proto = request.headers.get("x-forwarded-proto")
        if forwarded_proto:
            return forwarded_proto.split(",", maxsplit=1)[0].strip().lower() == "https"
    return request.url.scheme == "https"


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    if not settings.security_headers_enabled:
        return response

    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy",
        "camera=(), geolocation=(), microphone=()",
    )
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")

    if _request_uses_https(request):
        response.headers.setdefault(
            "Strict-Transport-Security",
            (
                f"max-age={settings.strict_transport_security_seconds}; "
                "includeSubDomains"
            ),
        )

    return response

app.include_router(health.router)
app.include_router(plants.router)
app.include_router(wiki.router)
app.include_router(auth.router)

os.makedirs(settings.storage_dir, exist_ok=True)
app.mount("/images", StaticFiles(directory=settings.storage_dir), name="images")

# OpenTelemetry Setup
# This will automatically capture HTTP metrics and traces
if tracer_provider is not None:
    FastAPIInstrumentor.instrument_app(app, tracer_provider=tracer_provider)
    SQLAlchemyInstrumentor().instrument(
        engine=engine.sync_engine,
        tracer_provider=tracer_provider,
    )
