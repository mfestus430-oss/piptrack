"""Shared storage layer for PipTrack.

Works with SQLite (local default) and PostgreSQL (Render / production via DATABASE_URL).
All queries use '?' placeholders — translated to '%s' automatically on Postgres.
"""

import json
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "piptrack.db")

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()


def use_postgres():
    return DATABASE_URL.startswith("postgres")


def is_postgres():
    return use_postgres()


class PgCursor:
    """Thin wrapper so Postgres cursors behave like sqlite3 cursors (dict rows)."""

    def __init__(self, cur):
        self.cur = cur

    @property
    def rowcount(self):
        return self.cur.rowcount

    @property
    def lastrowid(self):
        row = self.cur.fetchone()
        return row[0] if row else None

    def fetchall(self):
        cols = [d[0] for d in (self.cur.description or [])]
        return [dict(zip(cols, r)) for r in self.cur.fetchall()]

    def fetchone(self):
        cols = [d[0] for d in (self.cur.description or [])]
        r = self.cur.fetchone()
        return dict(zip(cols, r)) if r else None


class Conn:
    """A connection that abstracts sqlite3 / psycopg2."""

    def __init__(self):
        self.is_pg = use_postgres()
        if self.is_pg:
            import psycopg2
            self.raw = psycopg2.connect(DATABASE_URL)
        else:
            os.makedirs(DATA_DIR, exist_ok=True)
            self.raw = sqlite3.connect(DB_PATH, timeout=15)
            self.raw.row_factory = sqlite3.Row

    def execute(self, sql, args=()):
        args = list(args) if args else []
        if self.is_pg:
            cur = self.raw.cursor()
            cur.execute(sql.replace("?", "%s"), args or None)
            return PgCursor(cur)
        return self.raw.execute(sql, args or [])

    def commit(self):
        self.raw.commit()

    def close(self):
        self.raw.close()


def get_db():
    return Conn()


def query_db(sql, args=(), one=False):
    conn = get_db()
    try:
        rows = conn.execute(sql, args).fetchall()
        return (rows[0] if rows else None) if one else rows
    finally:
        conn.close()


def exec_db(sql, args=()):
    conn = get_db()
    try:
        cur = conn.execute(sql, args)
        conn.commit()
        return cur
    finally:
        conn.close()


def init_db():
    if use_postgres():
        exec_db(
            """
            CREATE TABLE IF NOT EXISTS trades (
                id         SERIAL PRIMARY KEY,
                ts         TEXT NOT NULL,
                pair       TEXT NOT NULL,
                direction  TEXT NOT NULL,
                lot        DOUBLE PRECISION,
                entry      DOUBLE PRECISION,
                exit_p     DOUBLE PRECISION,
                sl         DOUBLE PRECISION,
                tp         DOUBLE PRECISION,
                pips       DOUBLE PRECISION,
                pnl        DOUBLE PRECISION,
                fee        DOUBLE PRECISION,
                strategy   TEXT,
                setup      TEXT,
                session    TEXT,
                rating     INTEGER,
                risk       DOUBLE PRECISION,
                r          DOUBLE PRECISION,
                notes      TEXT,
                created_at TEXT
            )
            """
        )
        exec_db(
            """
            CREATE TABLE IF NOT EXISTS kv (
                key   TEXT PRIMARY KEY,
                value TEXT
            )
            """
        )
    else:
        exec_db(
            """
            CREATE TABLE IF NOT EXISTS trades (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                ts         TEXT NOT NULL,
                pair       TEXT NOT NULL,
                direction  TEXT NOT NULL,
                lot        REAL,
                entry      REAL,
                exit_p     REAL,
                sl         REAL,
                tp         REAL,
                pips       REAL,
                pnl        REAL,
                fee        REAL,
                strategy   TEXT,
                setup      TEXT,
                session    TEXT,
                rating     INTEGER,
                risk       REAL,
                r          REAL,
                notes      TEXT,
                created_at TEXT
            )
            """
        )
        exec_db(
            """
            CREATE TABLE IF NOT EXISTS kv (
                key   TEXT PRIMARY KEY,
                value TEXT
            )
            """
        )


def kv_get(key, default=None):
    row = query_db("SELECT value FROM kv WHERE key=?", (key,), one=True)
    if row is None:
        return default
    try:
        return json.loads(row["value"])
    except Exception:
        return default


def kv_set(key, value):
    exec_db(
        "INSERT INTO kv(key,value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, json.dumps(value)),
    )


init_db()
