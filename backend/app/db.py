"""
Persistence layer — Postgres (Supabase) in production, SQLite locally.

Auto-detects which to use:
  - If DATABASE_URL starts with "postgresql" AND the host is reachable
    → uses Postgres via psycopg2 (production / Render + Supabase)
  - Otherwise → falls back to a local SQLite file (data.db) so the
    app works offline / without Supabase configured
"""
import sqlite3
import time
import uuid
from contextlib import contextmanager

from app.config import settings

# ── Driver detection ──────────────────────────────────────────────────────────

def _use_postgres() -> bool:
    """Return True only if DATABASE_URL looks like Postgres AND we can import psycopg2."""
    url = settings.database_url or ""
    if not url.startswith("postgresql"):
        return False
    try:
        import psycopg2  # noqa: F401
        return True
    except ImportError:
        return False

USE_POSTGRES = _use_postgres()

# ── Postgres helpers ──────────────────────────────────────────────────────────

if USE_POSTGRES:
    import psycopg2
    import psycopg2.extras

    @contextmanager
    def get_conn():
        conn = psycopg2.connect(
            settings.database_url,
            cursor_factory=psycopg2.extras.RealDictCursor,
            connect_timeout=10,
        )
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _row(r):
        return dict(r) if r else None

# ── SQLite helpers ────────────────────────────────────────────────────────────

else:
    import os
    _DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data.db")

    @contextmanager
    def get_conn():
        conn = sqlite3.connect(_DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _row(r):
        return dict(r) if r else None


# ── Public API (same interface regardless of backend) ─────────────────────────

def init_db():
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                google_sub TEXT UNIQUE NOT NULL,
                email TEXT NOT NULL,
                name TEXT,
                picture TEXT,
                created_at REAL NOT NULL
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                query TEXT NOT NULL,
                report_markdown TEXT,
                chart_path TEXT,
                created_at REAL NOT NULL
            )
            """
        )
        if USE_POSTGRES:
            # Postgres needs explicit commit via context manager
            pass


def upsert_user(google_sub: str, email: str, name: str, picture: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor()

        if USE_POSTGRES:
            cur.execute("SELECT * FROM users WHERE google_sub = %s", (google_sub,))
        else:
            cur.execute("SELECT * FROM users WHERE google_sub = ?", (google_sub,))

        row = cur.fetchone()
        is_new_user = row is None

        if row:
            user_id = row["id"]
            if USE_POSTGRES:
                cur.execute(
                    "UPDATE users SET email = %s, name = %s, picture = %s WHERE id = %s",
                    (email, name, picture, user_id),
                )
            else:
                cur.execute(
                    "UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?",
                    (email, name, picture, user_id),
                )
        else:
            user_id = uuid.uuid4().hex
            if USE_POSTGRES:
                cur.execute(
                    "INSERT INTO users (id, google_sub, email, name, picture, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (user_id, google_sub, email, name, picture, time.time()),
                )
            else:
                cur.execute(
                    "INSERT INTO users (id, google_sub, email, name, picture, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (user_id, google_sub, email, name, picture, time.time()),
                )

        if USE_POSTGRES:
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        else:
            cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))

        user = _row(cur.fetchone())
        user["is_new_user"] = is_new_user
        return user


def get_user_by_id(user_id: str) -> dict | None:
    with get_conn() as conn:
        cur = conn.cursor()
        if USE_POSTGRES:
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        else:
            cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return _row(cur.fetchone())


def save_report(user_id: str, query: str, report_markdown: str, chart_path: str | None):
    report_id = uuid.uuid4().hex[:12]
    with get_conn() as conn:
        cur = conn.cursor()
        if USE_POSTGRES:
            cur.execute(
                "INSERT INTO reports (id, user_id, query, report_markdown, chart_path, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (report_id, user_id, query, report_markdown, chart_path, time.time()),
            )
        else:
            cur.execute(
                "INSERT INTO reports (id, user_id, query, report_markdown, chart_path, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (report_id, user_id, query, report_markdown, chart_path, time.time()),
            )
    return report_id


def list_reports(user_id: str) -> list[dict]:
    with get_conn() as conn:
        cur = conn.cursor()
        if USE_POSTGRES:
            cur.execute(
                "SELECT id, query, created_at FROM reports "
                "WHERE user_id = %s ORDER BY created_at DESC LIMIT 50",
                (user_id,),
            )
        else:
            cur.execute(
                "SELECT id, query, created_at FROM reports "
                "WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
                (user_id,),
            )
        return [_row(r) for r in cur.fetchall()]


def get_report(user_id: str, report_id: str) -> dict | None:
    with get_conn() as conn:
        cur = conn.cursor()
        if USE_POSTGRES:
            cur.execute(
                "SELECT * FROM reports WHERE id = %s AND user_id = %s",
                (report_id, user_id),
            )
        else:
            cur.execute(
                "SELECT * FROM reports WHERE id = ? AND user_id = ?",
                (report_id, user_id),
            )
        return _row(cur.fetchone())


def delete_report(user_id: str, report_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.cursor()
        if USE_POSTGRES:
            cur.execute(
                "DELETE FROM reports WHERE id = %s AND user_id = %s",
                (report_id, user_id),
            )
        else:
            cur.execute(
                "DELETE FROM reports WHERE id = ? AND user_id = ?",
                (report_id, user_id),
            )
        return cur.rowcount > 0
