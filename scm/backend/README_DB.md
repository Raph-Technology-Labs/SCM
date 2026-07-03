# MV Desktop — Backend DB + AI-model linking (PostgreSQL)

FastAPI + PostgreSQL rebuild of the PyQt/PySide6 app. This layer is the
consolidated final database (equivalent to SQLite migrations v001..v007)
plus the new AI-model registry and linking.

## Structure

```
app/
├── config.py                 # DATABASE_URL, MODELS_DIR, etc.
├── main.py                   # FastAPI app
├── inference.py              # resolve part -> model .pt (+ if/else example)
├── schemas.py                # Pydantic request/response models
├── models/
│   └── db.py                 # engine, session, Base, get_db, ORM models
├── services/
│   ├── model_linking.py      # get_or_create model, resolve ai_model_id
│   └── excel_import.py       # .xlsx dump -> parts + linked models
└── routers/
    └── routers.py            # /parts, /ai-models, /parts/import-excel, /sessions
schema.sql                    # canonical DDL (collapsed v001..v007 + AI models)
migrations/001_add_ai_models.sql  # add AI feature to a pre-existing DB
migrate_sqlite_to_postgres.py     # copy mv_desktop.db data into Postgres
sample_parts_import.xlsx      # example spreadsheet for /parts/import-excel
requirements.txt / .env.example
```

## Tables

`categories`, `users`, `ai_models` (NEW), `parts`, `company_sessions`,
`part_defects`. `parts.ai_model_id` links a part to its model.

## Setup

```bash
# 1. create db + user
sudo -u postgres psql -c "CREATE USER scm_user WITH PASSWORD 'scm_password';"
sudo -u postgres psql -c "CREATE DATABASE mv_desktop OWNER scm_user;"

# 2. create tables (also seeds the two default logins)
psql "postgresql://scm_user:scm_password@localhost:5432/scm" -f schema.sql

# 3. (optional) copy existing data from the SQLite file
pip install -r requirements.txt
python migrate_sqlite_to_postgres.py \
    --sqlite ./mv_desktop.db \
    --pg "postgresql://scm_user:scm_password@localhost:5432/scm"

# 4. run
cp .env.example .env
uvicorn app.main:app --reload
```

Seeded logins (from the original migration): `superadmin / superadmin123`
and `admin / admin123` (sha256, unsalted — rotate for production).

## AI-model linking (the workflow)

- `ai_models` is the registry: `model_name` is the linking name (e.g. `bolt`),
  `model_path` is the weights file in `MODELS_DIR` (e.g. `bolt.pt`).
- Each part points at one model via `parts.ai_model_id`.
- `inference.resolve_model_path_for_part(part)` returns the `.pt` path via the
  relationship. `_legacy_if_else_example()` shows the hard-coded if/else the
  registry replaces (add a row instead of editing code for each new model).

### Add a model
`POST /ai-models  {"model_name": "bolt"}`  → stores `model_path='bolt.pt'`.

### Add a part linked to a model
`POST /parts  {"part_code": "BOLT-001", "part_name": "Hex Bolt", "model_name": "bolt"}`
If the model name doesn't exist yet it is created automatically.

### Excel dump
`POST /parts/import-excel` (multipart file upload). Each row's `model_name`
is resolved (or created) and set as the part's `ai_model_id`. Try it with
`sample_parts_import.xlsx`. Existing `part_code`s are skipped and reported.

Then in the backend, loading the right weights for a part is just:
`from app.inference import get_model_for_part; model = get_model_for_part(part)`
(wire the actual `.pt` loader inside `inference.load_model`).

## Translation notes (SQLite → PostgreSQL)

Identity PKs, `JSONB` for JSON columns, `BYTEA` for image, `BOOLEAN` for 0/1
flags, `DOUBLE PRECISION` for REAL, `CHECK` constraints kept, `TIMESTAMPTZ`
defaults. `parts_metadata` stays `TEXT` (say the word to switch to `JSONB`).
