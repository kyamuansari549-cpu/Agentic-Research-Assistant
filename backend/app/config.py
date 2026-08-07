"""
Central configuration, loaded from environment variables / .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # API Keys
    groq_api_key: str = ""
    tavily_api_key: str = ""

    # Free-tier friendly Groq model
    groq_model: str = "llama-3.1-8b-instant"

    # Agent settings
    max_revision_cycles: int = 0
    max_subtasks: int = 5

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()