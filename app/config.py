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


settings = Settings()
