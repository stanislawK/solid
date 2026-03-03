import curl_cffi
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "solid.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Solid API"
    database_url: str = "sqlite:///./app.db"
    debug: bool = False
    browser: curl_cffi.BrowserTypeLiteral = "chrome"
    gem_api_key: str = ""
    glitchtip_dsn: str = ""
    otel_enabled: bool = True
    otel_service_name: str = "solid-backend"
    otel_exporter_otlp_endpoint: str = (
        "http://otel-collector-opentelemetry-collector.default.svc.cluster.local:4318"
    )
    otel_exporter_otlp_protocol: str = "http/protobuf"
    otel_resource_attributes: str = "deployment.environment=local"


settings = Settings()
