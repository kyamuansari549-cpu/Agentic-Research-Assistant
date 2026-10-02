"""
Central configuration, loaded from environment variables / .env file.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"
    tavily_api_key: str = ""  # optional -- used as fallback if DDG search fails
    semanticscholar_api_key: str = ""  # optional -- raises S2 rate limits (free key)
    unpaywall_email: str = ""  # optional -- enables legal OA PDF lookup; skipped if unset
    enable_paper_relevance_filter: bool = True  # LLM gate for off-topic papers; disable for ~3-5s faster jobs
    # --- LLM fallback (Groq primary -> Gemini on 429) ---
    # Same Google AI Studio key as embeddings (DocQA); NOT the OAuth client id/secret.
    google_api_key: str = ""  # optional -- enables Gemini fallback when Groq rate-limits
    gemini_model: str = "gemini-3.6-flash"  # override with GEMINI_MODEL if Google retires it again
    llm_fallback_enabled: bool = True  # set false to keep legacy Groq-only long backoff
    max_revision_cycles: int = 1
    max_subtasks: int = 3

    # --- Auth (Google OAuth + JWT) ---
    google_client_id: str = ""
    google_client_secret: str = ""
    jwt_secret: str = "dev-secret-change-me"  # override in production!
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    frontend_url: str = "http://localhost:5173"  # where we redirect after login
    backend_url: str = "http://localhost:8000"  # our own base URL, for the OAuth redirect_uri

    # --- Database (Supabase Postgres) ---
    # Falls back to a local SQLite-less Postgres URL only if you run one
    # yourself; in production this MUST be set to your Supabase connection
    # string (Render env var), or the app will fail to start.
    database_url: str = "postgresql://postgres:postgres@localhost:5432/postgres"

    # --- CORS ---
    # Comma-separated list of allowed frontend origins, e.g.:
    # "http://localhost:5173,http://localhost:5174,https://your-app.vercel.app"
    allowed_origins: str = "http://localhost:5173"
    # Optional -- if unset, the welcome email is silently skipped (see
    # app/tools/email.py) instead of breaking login.
    resend_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
