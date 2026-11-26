"""FastAPI HTTP layer for the LexiCore compiler IDE."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .compiler import Lexer, Parser, compile_source, build_parse_tree, run_source

app = FastAPI(
    title="LexiCore API",
    version=__version__,
    description="Compiler pipeline and debugger service for the LexiCore IDE.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: dict[str, dict[str, Any]] = {}
PHASES = ["lexical", "syntax", "semantic", "intermediate", "optimization"]


def response(
    data: Any,
    phase: str,
    *,
    status: str = "ok",
    diagnostics: list[dict[str, Any]] | None = None,
    message: str | None = None,
    program_id: str | None = None,
) -> dict[str, Any]:
    return {
        "success": status != "error",
        "status": status,
        "phase": phase,
        "diagnostics": diagnostics or [],
        "data": data,
        "message": message,
        "program_id": program_id,
    }


def source_of(payload: dict[str, Any]) -> str:
    source = payload.get("source")
    if not isinstance(source, str):
        raise HTTPException(status_code=400, detail="Request body must contain a string 'source'.")
    return source


def inputs_of(payload: dict[str, Any]) -> list[str]:
    raw = payload.get("inputs")
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw]


@app.get("/health")
@app.get("/api/health")
def health() -> dict[str, Any]:
    return response(
        {
            "ready": True,
            "version": __version__,
            "compiler": "LexiCore",
            "language_version": "1.0",
            "phases": PHASES,
        },
        "health",
    )


@app.post("/api/compiler/lex")
def lex(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    tokens, diagnostics = Lexer(source_of(payload)).tokenize()
    status = "error" if any(item["severity"] == "error" for item in diagnostics) else "ok"
    return response({"tokens": [token.as_dict() for token in tokens]}, "lexical",
                    status=status, diagnostics=diagnostics)


@app.post("/api/compiler/parse")
def parse(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    tokens, _ = Lexer(source_of(payload)).tokenize()
    parser = Parser(tokens)
    program = parser.parse_program()
    diagnostics = parser.diagnostics
    status = "error" if any(item["severity"] == "error" for item in diagnostics) else "ok"
    return response(
        {"parse_tree": build_parse_tree(program), "ast": program.to_dict()},
        "syntax", status=status, diagnostics=diagnostics,
    )


@app.post("/api/compiler/semantic")
def semantic(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    compiled = compile_source(source_of(payload))
    phase = compiled["phases"]["semantic"]
    return response(phase["data"], "semantic",
                    status="error" if phase["status"] == "error" else "ok",
                    diagnostics=phase["diagnostics"])


@app.post("/api/compiler/compile")
def compile_endpoint(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    compiled = compile_source(source_of(payload))
    data = {key: value for key, value in compiled.items() if key not in {"ast", "optimized_tac"}}
    status = "ok" if compiled["success"] else ("blocked" if compiled["blocked"] else "error")
    return response(data, "compile", status=status, diagnostics=compiled["diagnostics"])


@app.post("/api/compiler/optimize")
def optimize(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    compiled = compile_source(source_of(payload))
    phase = compiled["phases"]["optimization"]
    return response(phase["data"], "optimization",
                    status="ok" if phase["status"] == "success" else "blocked",
                    diagnostics=phase["diagnostics"])


@app.post("/api/compiler/run")
def run(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    result = run_source(source_of(payload), inputs_of(payload))
    status = "ok" if result["execution"]["success"] else "error"
    return response(
        {
            "execution": result["execution"],
            "compile": result["compile"],
            "compile_success": result["compile_success"],
        },
        "run", status=status, diagnostics=result["execution"]["diagnostics"],
    )


def public_session(session: dict[str, Any]) -> dict[str, Any]:
    return {
        "snapshots": session["snapshots"],
        "final_result": session["final_result"],
        "status": session["status"],
        "breakpoints_hit": session["breakpoints_hit"],
    }


def get_session(session_id: str) -> dict[str, Any]:
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Debug session not found.")
    return session


@app.post("/api/debug/sessions")
def create_debug_session(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    result = run_source(source_of(payload), inputs_of(payload))
    raw_lines = payload.get("source_lines", payload.get("breakpoints"))
    breakpoint_lines = {int(line) for line in raw_lines} if isinstance(raw_lines, list) else set()
    hits = sum(
        1 for snap in result["snapshots"]
        if snap.get("span") and snap["span"].get("start_line") in breakpoint_lines
    )
    session_id = uuid4().hex
    sessions[session_id] = {
        "snapshots": result["snapshots"],
        "final_result": result["execution"],
        "status": "paused" if hits else "ready",
        "breakpoints_hit": hits,
        "cursor": 0,
        "breakpoints": breakpoint_lines,
    }
    return response({"session": public_session(sessions[session_id])}, "debug", program_id=session_id)


@app.get("/api/debug/sessions/{session_id}")
def get_debug_session(session_id: str) -> dict[str, Any]:
    session = get_session(session_id)
    return response({"session": public_session(session)}, "debug", program_id=session_id)


def advance(session: dict[str, Any], action: str, breakpoints: set[int]) -> None:
    snapshots = session["snapshots"]
    cursor = session["cursor"]
    if action == "run_to_end":
        cursor = len(snapshots)
    elif action == "continue":
        cursor += 1
        while cursor < len(snapshots):
            span = snapshots[cursor].get("span") or {}
            if span.get("start_line") in breakpoints:
                session["breakpoints_hit"] += 1
                break
            cursor += 1
    elif action in {"step_over", "step_out"} and cursor < len(snapshots):
        depth = snapshots[cursor]["call_depth"]
        cursor += 1
        while cursor < len(snapshots):
            next_depth = snapshots[cursor]["call_depth"]
            if (action == "step_over" and next_depth <= depth) or (action == "step_out" and next_depth < depth):
                break
            cursor += 1
    else:
        cursor += 1
    session["cursor"] = min(cursor, len(snapshots))
    session["status"] = "complete" if session["cursor"] >= len(snapshots) else "paused"


@app.post("/api/debug/sessions/{session_id}/step")
def debug_step(session_id: str, payload: dict[str, Any] = Body(default={})) -> dict[str, Any]:
    session = get_session(session_id)
    action = str(payload.get("action", "step"))
    if action not in {"step", "step_over", "step_out", "continue", "run_to_end"}:
        raise HTTPException(status_code=400, detail=f"Unknown debug action '{action}'.")
    advance(session, action, session["breakpoints"])
    return response({"session": public_session(session)}, "debug", program_id=session_id)


@app.post("/api/debug/sessions/{session_id}/continue")
def debug_continue(session_id: str) -> dict[str, Any]:
    session = get_session(session_id)
    advance(session, "continue", session["breakpoints"])
    return response({"session": public_session(session)}, "debug", program_id=session_id)


@app.post("/api/debug/sessions/{session_id}/breakpoints")
def add_breakpoint(session_id: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    session = get_session(session_id)
    if payload.get("source_line") is not None:
        session["breakpoints"].add(int(payload["source_line"]))
    if payload.get("pc") is not None:
        session["breakpoints"].add(int(payload["pc"]))
    return response(
        {
            "breakpoints": sorted(session["breakpoints"]),
            "source_lines": sorted(session["breakpoints"]),
        },
        "debug", program_id=session_id,
    )


@app.delete("/api/debug/sessions/{session_id}/breakpoints")
def remove_breakpoint(session_id: str, source_line: int | None = None, pc: int | None = None) -> dict[str, Any]:
    session = get_session(session_id)
    for value in (source_line, pc):
        if value is not None and value in session["breakpoints"]:
            session["breakpoints"].discard(value)
    return response(
        {
            "breakpoints": sorted(session["breakpoints"]),
            "source_lines": sorted(session["breakpoints"]),
        },
        "debug", program_id=session_id,
    )


@app.delete("/api/debug/sessions/{session_id}")
def delete_debug_session(session_id: str) -> dict[str, Any]:
    get_session(session_id)
    del sessions[session_id]
    return response({"deleted": True}, "debug", program_id=session_id)
