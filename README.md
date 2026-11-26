
# LexiCore-Visual-Compiler-Studio
# Quick start

You can run every command from **this folder** (`LexiCore_Ready_for_OpenCode`). The root `package.json` forwards npm scripts to the frontend in `LexiCore/`, and the Python package `lexicore/` is installed in editable mode.

## 1. Install (once)

```powershell
cd "C:\Users\CHAUDHARY\Desktop\LexiCore_Ready_for_OpenCode"
npm install
python -m pip install -e ".[dev]"
```

## 2. Start the backend (terminal 1)

```powershell
cd "C:\Users\CHAUDHARY\Desktop\LexiCore_Ready_for_OpenCode"
python -m uvicorn lexicore.api:app --port 8000
```

Health check: http://127.0.0.1:8000/api/health → `{"ready": true, ...}`

## 3. Start the frontend (terminal 2)

```powershell
cd "C:\Users\CHAUDHARY\Desktop\LexiCore_Ready_for_OpenCode"
npm run dev
```

Open **http://localhost:5173/**. The status bar should show **Backend ready**.

## Commands available from this folder

| Command | Purpose |
|---|---|
| `npm run dev` | Frontend dev server (port 5173) |
| `npm run build` | Type check + production build |
| `npm run preview` | Preview production build |
| `npm test` | Frontend Vitest suite (21 tests) |
| `python -m pytest -q` | Backend FastAPI/compiler suite (8 tests) |
| `python -m uvicorn lexicore.api:app --port 8000` | Backend server (port 8000) |

## Layout

- `LexiCore/` — React + Vite + TypeScript IDE (Monaco bundled locally)
- `lexicore/` — FastAPI app + MiniLang lexer/parser/analyzer/TAC/optimizer/interpreter/debugger
- `tests/` — backend tests
- `pyproject.toml` — Python package metadata and dependencies

Frontend API origin is `VITE_API_URL` (default `http://127.0.0.1:8000`; see `LexiCore/.env.example`). CORS is enabled for all origins in the backend.
