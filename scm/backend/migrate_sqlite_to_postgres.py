"""
One-time data migration:  SQLite (mv_desktop.db)  ->  PostgreSQL.

Prerequisites
-------------
1. The target Postgres tables already exist (run `psql "$DATABASE_URL" -f schema.sql`).
2. psycopg2 is installed:  pip install "psycopg2-binary"

Usage
-----
    python migrate_sqlite_to_postgres.py \
        --sqlite ./mv_desktop.db \
        --pg "postgresql://scm_user:scm_password@localhost:5432/scm"

If --pg is omitted, the DATABASE_URL env var is used (the SQLAlchemy
"+psycopg2" prefix is stripped automatically).

What it does
------------
* Copies tables in foreign-key-safe order.
* Preserves original primary keys so all relationships line up.
* Coerces JSON-text columns -> JSONB (empty/invalid text becomes NULL).
* Coerces 0/1 integer flags -> BOOLEAN.
* Resets each identity sequence so future inserts don't collide.
* Wraps everything in a single transaction (all-or-nothing).
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys

import psycopg2
from psycopg2.extras import Json, execute_values

# ---------------------------------------------------------------------------
# Column typing: which columns are JSON, which are booleans.
# ---------------------------------------------------------------------------
JSON_COLUMNS = {
    "parts": {"actual_measurement_data"},
    "company_sessions": {"measured_realtime_data", "calibration_runs"},
}
BOOL_COLUMNS = {
    "parts": {"part_co_planarity", "part_parallelity", "part_concentricity"},
    "company_sessions": {"is_calibration", "calibration_passed"},
    "part_defects": {"thread_missing", "dent", "scratch", "rust"},
}

# Foreign-key-safe insertion order and the identity column of each table.
# ai_models has no legacy source data, so it is not listed here.
TABLE_ORDER = [
    ("users", "id"),
    ("categories", "category_id"),
    ("parts", "part_id"),
    ("company_sessions", "id"),
    ("part_defects", "id"),
]


def coerce_json(value):
    """Text/blob -> Python object suitable for a JSONB column (or None)."""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    text = str(value).strip()
    if text == "" or text.lower() == "null":
        return None
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        print(f"    ! could not parse JSON, storing NULL: {text[:60]!r}")
        return None


def coerce_bool(value):
    """0/1 integer (or None) -> bool/None."""
    if value is None:
        return None
    return bool(int(value))


def transform_row(table: str, row: sqlite3.Row) -> dict:
    """Apply per-column coercions and return a plain dict."""
    out = {}
    json_cols = JSON_COLUMNS.get(table, set())
    bool_cols = BOOL_COLUMNS.get(table, set())
    for key in row.keys():
        val = row[key]
        if key in json_cols:
            obj = coerce_json(val)
            out[key] = Json(obj) if obj is not None else None
        elif key in bool_cols:
            out[key] = coerce_bool(val)
        else:
            out[key] = val
    return out


def migrate_table(sqlite_conn, pg_cur, table: str) -> int:
    sqlite_conn.row_factory = sqlite3.Row
    cur = sqlite_conn.cursor()

    # Skip tables that don't exist in the source (schemas may differ).
    exists = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    if not exists:
        print(f"  {table}: not present in source SQLite (skipped)")
        return 0

    rows = cur.execute(f"SELECT * FROM {table}").fetchall()
    if not rows:
        print(f"  {table}: 0 rows (skipped)")
        return 0

    # Only migrate columns that exist in BOTH source and target so that a
    # source schema that differs slightly still imports what overlaps.
    pg_cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
        (table,),
    )
    target_cols = {r[0] for r in pg_cur.fetchall()}
    source_cols = list(rows[0].keys())
    columns = [c for c in source_cols if c in target_cols]
    dropped = [c for c in source_cols if c not in target_cols]
    if dropped:
        print(f"  {table}: source columns not in target, skipped -> {dropped}")
    if not columns:
        print(f"  {table}: no overlapping columns (skipped)")
        return 0

    col_list = ", ".join(columns)
    transformed = [transform_row(table, r) for r in rows]
    values = [[row[c] for c in columns] for row in transformed]

    execute_values(
        pg_cur,
        f"INSERT INTO {table} ({col_list}) VALUES %s ON CONFLICT DO NOTHING",
        values,
    )
    print(f"  {table}: {len(rows)} rows inserted")
    return len(rows)


def reset_sequence(pg_cur, table: str, id_column: str) -> None:
    """Bump the identity sequence to max(id) so new inserts don't collide."""
    pg_cur.execute(
        f"""
        SELECT setval(
            pg_get_serial_sequence(%s, %s),
            COALESCE((SELECT MAX({id_column}) FROM {table}), 1),
            true
        )
        """,
        (table, id_column),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate SQLite -> PostgreSQL")
    parser.add_argument("--sqlite", default="./mv_desktop.db", help="Path to SQLite DB")
    parser.add_argument("--pg", default=None, help="Postgres connection URL")
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="TRUNCATE target tables before loading (fresh import)",
    )
    args = parser.parse_args()

    pg_url = args.pg or os.getenv("DATABASE_URL")
    if not pg_url:
        print("ERROR: provide --pg or set DATABASE_URL", file=sys.stderr)
        return 1
    # psycopg2 wants a plain URL, not the SQLAlchemy "+psycopg2" variant.
    pg_url = pg_url.replace("postgresql+psycopg2://", "postgresql://")

    if not os.path.exists(args.sqlite):
        print(f"ERROR: SQLite file not found: {args.sqlite}", file=sys.stderr)
        return 1

    sqlite_conn = sqlite3.connect(args.sqlite)
    pg_conn = psycopg2.connect(pg_url)
    pg_conn.autocommit = False

    try:
        with pg_conn.cursor() as cur:
            if args.truncate:
                names = ", ".join(t for t, _ in TABLE_ORDER)
                print(f"Truncating: {names}")
                cur.execute(f"TRUNCATE {names} RESTART IDENTITY CASCADE")

            print("Migrating tables:")
            total = 0
            for table, _ in TABLE_ORDER:
                total += migrate_table(sqlite_conn, cur, table)

            print("Resetting identity sequences:")
            for table, id_col in TABLE_ORDER:
                reset_sequence(cur, table, id_col)
                print(f"  {table}.{id_col} sequence reset")

        pg_conn.commit()
        print(f"\nDone. {total} rows migrated and committed.")
        return 0
    except Exception as exc:  # noqa: BLE001
        pg_conn.rollback()
        print(f"\nMigration FAILED, rolled back: {exc}", file=sys.stderr)
        return 1
    finally:
        sqlite_conn.close()
        pg_conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
