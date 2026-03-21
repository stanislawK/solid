import curl_cffi
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "solid.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Solid API"
    database_url: str = "sqlite:///./app.db"
    debug: bool = False
    browser: curl_cffi.requests.BrowserTypeLiteral = "chrome"
    gem_api_key: str = ""
    glitchtip_dsn: str = ""
    otel_enabled: bool = True
    otel_service_name: str = "solid-backend"
    otel_exporter_otlp_endpoint: str = (
        "http://otel-collector-opentelemetry-collector.default.svc.cluster.local:4318"
    )
    otel_exporter_otlp_protocol: str = "http/protobuf"
    otel_resource_attributes: str = "deployment.environment=local"
    gcp_client_id: str = ""
    gcp_client_secret: str = ""
    gcp_redirect_uri: str = "http://localhost:8080/api/auth/callback"
    frontend_url: str = "http://localhost:8080"
    jwt_secret_key: str = Field(
        default="your-very-secure-jwt-secret-key", min_length=32
    )
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440
    admin_email: str = ""
    session_secret_key: str = Field(default="", min_length=32)
    session_https_only: bool = False
    session_same_site: Literal["lax", "strict", "none"] = "lax"
    session_max_age_seconds: int = 3600


settings = Settings()
