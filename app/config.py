from functools import cached_property
from typing import Literal
from urllib.parse import urlsplit

import curl_cffi
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "solid.env", "solid-prod.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Solid API"
    environment: Literal["development", "production"] = "development"
    database_url: str = "sqlite:///./app.db"
    debug: bool = False
    browser: curl_cffi.requests.BrowserTypeLiteral = "chrome"
    gem_api_key: str = ""
    glitchtip_dsn: str = ""
    otel_enabled: bool = False
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
    cors_allowed_origins: str = "http://localhost:8080,http://127.0.0.1:8080"
    allowed_hosts: str = "localhost,127.0.0.1"
    docs_enabled: bool = True
    security_headers_enabled: bool = True
    trust_proxy_headers: bool = False
    strict_transport_security_seconds: int = 31536000
    jwt_secret_key: str = Field(
        default="development-jwt-secret-change-me-1234567890",
        min_length=32,
    )
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    auth_refresh_token_expire_days: int = 14
    auth_access_cookie_name: str = "solid_access_token"
    auth_refresh_cookie_name: str = "solid_refresh_token"
    auth_csrf_cookie_name: str = "solid_csrf_token"
    admin_email: str = ""
    session_secret_key: str = Field(
        default="development-session-secret-change-me-1234567890",
        min_length=32,
    )
    session_https_only: bool = False
    session_same_site: Literal["lax", "strict", "none"] = "lax"
    session_max_age_seconds: int = 3600
    storage_dir: str = "data/images"

    @staticmethod
    def _split_csv(raw_value: str) -> list[str]:
        return [value.strip() for value in raw_value.split(",") if value.strip()]

    @cached_property
    def frontend_origin(self) -> str:
        parsed = urlsplit(self.frontend_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("FRONTEND_URL must be an absolute http(s) URL")
        return f"{parsed.scheme}://{parsed.netloc}"

    @cached_property
    def cors_allowed_origins_list(self) -> list[str]:
        origins = self._split_csv(self.cors_allowed_origins)
        if self.frontend_origin not in origins:
            origins.append(self.frontend_origin)
        return origins

    @cached_property
    def allowed_hosts_list(self) -> list[str]:
        hosts = self._split_csv(self.allowed_hosts)
        for url in (self.frontend_url, self.gcp_redirect_uri):
            host = urlsplit(url).hostname
            if host and host not in hosts:
                hosts.append(host)
        return hosts

    @model_validator(mode="after")
    def validate_security_posture(self) -> "Settings":
        for field_name in ("frontend_url", "gcp_redirect_uri"):
            parsed = urlsplit(getattr(self, field_name))
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError(f"{field_name} must be an absolute http(s) URL")

        if self.environment == "production":
            if not self.session_https_only:
                raise ValueError("SESSION_HTTPS_ONLY must be enabled in production")
            if self.frontend_url.startswith("http://"):
                raise ValueError(
                    f"FRONTEND_URL {self.frontend_url} must use https in production"
                )
            if self.gcp_redirect_uri.startswith("http://"):
                raise ValueError(
                    f"GCP_REDIRECT_URI {self.gcp_redirect_uri} must use https in production"
                )
            if self.jwt_secret_key.startswith("development-"):
                raise ValueError(
                    f"JWT_SECRET_KEY {self.jwt_secret_key} must be replaced with a production secret"
                )
            if self.session_secret_key.startswith("development-"):
                raise ValueError(
                    f"SESSION_SECRET_KEY {self.session_secret_key} must be replaced with a production secret"
                )

        return self


settings = Settings()
