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
    # Comma-separated list of allowed frontend origins for CORS.
    # Defaults to local dev; set CORS_ORIGINS on Render to also
    # include your deployed Vercel URL, e.g.
    # "http://localhost:5173,https://agentic-research-assistant-five.vercel.app"
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
