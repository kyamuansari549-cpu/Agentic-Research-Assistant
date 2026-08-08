"""
Central configuration, loaded from environment variables / .env file.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    tavily_api_key: str = ""  # optional -- used as fallback if DDG search fails
    max_revision_cycles: int = 2
    max_subtasks: int = 5

    # --- Auth (Google OAuth + JWT) ---
    google_client_id: str = ""
    google_client_secret: str = ""
    jwt_secret: str = "dev-secret-change-me"  # override in production!
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    frontend_url: str = "http://localhost:5173"  # where we redirect after login
    backend_url: str = "http://localhost:8000"  # our own base URL, for the OAuth redirect_uri

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
