# LexiCore IDE

React + Vite + TypeScript frontend for the LexiCore compiler IDE. Monaco is bundled locally (no CDN).

## Frontend

```sh
npm install
npm run dev
```

Open **http://localhost:5173/**.

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type check + production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest suite |

Copy `.env.example` to `.env` to change the backend origin (`VITE_API_URL`, default `http://127.0.0.1:8000`).

## Backend

The matching FastAPI backend lives in the **parent folder** (`../lexicore/`) and is already installed in editable mode. Run it from there in a second terminal:

```powershell
cd "C:\Users\CHAUDHARY\Desktop\LexiCore_Ready_for_OpenCode"
python -m uvicorn lexicore.api:app --port 8000
```

Routes:

- `GET /api/health`
- `POST /api/compiler/lex`, `/parse`, `/semantic`, `/compile`, `/optimize`, `/run`
- `POST/GET/DELETE /api/debug/sessions[/...]`

Without the backend the UI still loads, but Compile / Run / Debug show a connection error and the status bar shows "Backend offline". See `../README.md` for the complete quick start.
