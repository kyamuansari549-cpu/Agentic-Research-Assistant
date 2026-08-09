"""
Postgres persistence layer (Supabase).

Was originally plain SQLite for deploy simplicity, but on Render's
free tier the filesystem is ephemeral -- data.db (and every user's
history) got wiped on every redeploy. Supabase's free Postgres tier
survives redeploys/restarts, so this module now talks to that
instead over DATABASE_URL. Table shapes are unchanged, so the rest
of the app (routes in main.py) didn't need to change at all.
"""
import time
import uuid
from contextlib import contextmanager

import psycopg2
import psycopg2.extras

from app.config import settings


@contextmanager
def get_conn():
    conn = psycopg2.connect(settings.database_url, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


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
                created_at DOUBLE PRECISION NOT NULL
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                query TEXT NOT NULL,
                report_markdown TEXT,
                chart_path TEXT,
                created_at DOUBLE PRECISION NOT NULL
            )
            """
        )


def upsert_user(google_sub: str, email: str, name: str, picture: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE google_sub = %s", (google_sub,))
        row = cur.fetchone()
        if row:
            cur.execute(
                "UPDATE users SET email = %s, name = %s, picture = %s WHERE id = %s",
                (email, name, picture, row["id"]),
            )
            user_id = row["id"]
        else:
            user_id = uuid.uuid4().hex
            cur.execute(
                "INSERT INTO users (id, google_sub, email, name, picture, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (user_id, google_sub, email, name, picture, time.time()),
            )
        # Fetch on the SAME connection/transaction -- a fresh connection
        # (like get_user_by_id opens) can't see this row until the
        # `with` block above commits.
        cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        return dict(cur.fetchone())


def get_user_by_id(user_id: str) -> dict | None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def save_report(user_id: str, query: str, report_markdown: str, chart_path: str | None):
    report_id = uuid.uuid4().hex[:12]
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO reports (id, user_id, query, report_markdown, chart_path, created_at) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (report_id, user_id, query, report_markdown, chart_path, time.time()),
        )
    return report_id


def list_reports(user_id: str) -> list[dict]:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, query, created_at FROM reports "
            "WHERE user_id = %s ORDER BY created_at DESC LIMIT 50",
            (user_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def get_report(user_id: str, report_id: str) -> dict | None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM reports WHERE id = %s AND user_id = %s",
            (report_id, user_id),
        )
        row = cur.fetchone()
        return dict(row) if row else None
