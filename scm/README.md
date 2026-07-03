# SCM

Machine-vision parts inspection system — proof of concept.
Stack: **React (Vite)** · **FastAPI** · **PostgreSQL**

```
scm/
├── backend/    FastAPI + SQLAlchemy + PostgreSQL
└── frontend/   React (Vite) UI
```

## Install these first
- Python 3.12+  (https://www.python.org/downloads/)  — tick "Add Python to PATH"
- Node.js 18+   (https://nodejs.org/)
- PostgreSQL 14+ (https://www.postgresql.org/download/) — remember the postgres password you set

## 1. Database
```
psql -U postgres -c "CREATE USER scm_user WITH PASSWORD 'scm_password';"
psql -U postgres -c "CREATE DATABASE scm OWNER scm_user;"
psql "postgresql://scm_user:scm_password@localhost:5432/scm" -f backend/schema.sql
```

## 2. Backend
```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```
API: http://localhost:8000/docs

## 3. Frontend  (open a SECOND terminal)
```
cd frontend
npm install
copy .env.example .env
npm run dev
```
UI: http://localhost:5173

## Log in
- admin / admin123        (full access)
- operator / operator123  (read-only)

Put model weight files (e.g. bolt.pt) in backend/models/.
