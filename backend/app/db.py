"""
Tiny SQLite persistence layer.

No ORM on purpose -- this project only has two small tables, and a
plain sqlite3 file keeps the deploy story simple (no separate DB
service to provision). On Render's free tier the file lives on
ephemeral disk, so it resets on redeploy -- fine for a portfolio /
class project, but swap DB_PATH for a persistent disk or a hosted
Postgres if you need history to survive redeploys.
"""
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data.db"


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.execute(
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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                query TEXT NOT NULL,
                report_markdown TEXT,
                chart_path TEXT,
                created_at REAL NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )


def upsert_user(google_sub: str, email: str, name: str, picture: str) -> dict:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE google_sub = ?", (google_sub,)
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?",
                (email, name, picture, row["id"]),
            )
            user_id = row["id"]
        else:
            user_id = uuid.uuid4().hex
            conn.execute(
                "INSERT INTO users (id, google_sub, email, name, picture, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, google_sub, email, name, picture, time.time()),
            )
        # Fetch on the SAME connection/transaction -- a fresh connection
        # (like get_user_by_id opens) can't see this row until the
        # `with` block above commits, which was returning None here.
        fresh = conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return dict(fresh)


def get_user_by_id(user_id: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None


def save_report(user_id: str, query: str, report_markdown: str, chart_path: str | None):
    report_id = uuid.uuid4().hex[:12]
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO reports (id, user_id, query, report_markdown, chart_path, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (report_id, user_id, query, report_markdown, chart_path, time.time()),
        )
    return report_id


def list_reports(user_id: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, query, created_at FROM reports "
            "WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_report(user_id: str, report_id: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM reports WHERE id = ? AND user_id = ?",
            (report_id, user_id),
        ).fetchone()
        return dict(row) if row else None
