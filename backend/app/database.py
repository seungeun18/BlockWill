
'''
- SQLite 연결을 요청할 때마다 새로 열고 닫음
- 이메일 대소문자를 구분하지 않고 중복 차단
- 비밀번호 원문 대신 password_hash만 저장
- SQL 값을 ?로 전달해 SQL Injection 방지
- DB 위치를 환경변수로 바꿀 수 있어 테스트하기 쉬움
'''

import os
import sqlite3
from pathlib import Path


DEFAULT_DATABASE_PATH = (
    Path(__file__).resolve().parents[1] / "blockwill.db"
)


def get_database_path() -> Path:
    configured_path = os.getenv("BLOCKWILL_DATABASE_PATH")

    if configured_path:
        return Path(configured_path).expanduser().resolve()

    return DEFAULT_DATABASE_PATH


def connect() -> sqlite3.Connection:
    database_path = get_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")

    return connection


def init_database() -> None:
    with connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                disabled INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )


def find_user_by_email(email: str) -> sqlite3.Row | None:
    with connect() as connection:
        return connection.execute(
            """
            SELECT id, name, email, password_hash, disabled, created_at
            FROM users
            WHERE email = ?
            """,
            (email,),
        ).fetchone()


def find_user_by_id(user_id: int) -> sqlite3.Row | None:
    with connect() as connection:
        return connection.execute(
            """
            SELECT id, name, email, password_hash, disabled, created_at
            FROM users
            WHERE id = ?
            """,
            (user_id,),
        ).fetchone()


def create_user(
    name: str,
    email: str,
    password_hash: str,
) -> sqlite3.Row:
    try:
        with connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO users (name, email, password_hash)
                VALUES (?, ?, ?)
                """,
                (name, email, password_hash),
            )

            user = connection.execute(
                """
                SELECT id, name, email, password_hash, disabled, created_at
                FROM users
                WHERE id = ?
                """,
                (cursor.lastrowid,),
            ).fetchone()
    except sqlite3.IntegrityError as exc:
        raise ValueError("이미 가입된 이메일입니다.") from exc

    if user is None:
        raise RuntimeError("사용자 저장 결과를 확인할 수 없습니다.")

    return user