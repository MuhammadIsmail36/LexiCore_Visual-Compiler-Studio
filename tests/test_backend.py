"""End-to-end checks for the LexiCore FastAPI service."""

from fastapi.testclient import TestClient

from lexicore.api import app
from lexicore.compiler import compile_source, run_source

client = TestClient(app)

BASELINE = """START
INT a = 10;
INT b = 20;
INT result;
result = a + b;
PRINT result;
STOP
"""

CONTROL_FLOW = """START
INT i = 0;
WHILE i < 3
    IF i == 1
        PRINT "one";
    ELSE
        PRINT i;
    ENDIF
    i = i + 1;
ENDWHILE
STOP
"""

FUNCTIONS = """START
FUNCTION fact(INT n)
IF n <= 1
RETURN 1;
ENDIF
RETURN n * fact(n - 1);
ENDFUNCTION
PRINT fact(6);
STOP
"""

ARRAYS = """START
INT values[3];
values[0] = 10;
values[1] = 20;
values[2] = values[0] + values[1];
PRINT values[2];
STOP
"""

LEXICAL_FEATURES = """// LexiCore lexer regression sample.
/* Block comments
   may span lines. */
START
INT count = 10;
FLOAT price = 12.5;
STRING message = "Line\\nTab\\tQuote\\"Backslash\\\\";
BOOL active = TRUE;
count = count + 2 * 3 - 1;
IF count >= 15 AND active
    PRINT message;
ENDIF
STOP
"""


def test_health() -> None:
    payload = client.get("/api/health").json()
    assert payload["data"]["ready"] is True
    assert payload["data"]["version"] == "1.0.0"


def test_compile_returns_all_phases() -> None:
    payload = client.post("/api/compiler/compile", json={"source": BASELINE}).json()
    assert payload["success"] is True
    data = payload["data"]
    assert set(data["phases"]) == {"lexical", "syntax", "semantic", "intermediate", "optimization"}
    assert data["phases"]["lexical"]["data"]["tokens"]
    assert data["phases"]["syntax"]["data"]["parse_tree"]["symbol"] == "program"
    assert data["phases"]["syntax"]["data"]["ast"]["kind"] == "Program"


def test_run_baseline() -> None:
    result = run_source(BASELINE)
    assert result["compile_success"] is True
    assert result["execution"]["output"] == ["30"]
    assert result["execution"]["steps"] > 0
    assert result["execution"]["halted"] is False


def test_run_control_flow() -> None:
    assert run_source(CONTROL_FLOW)["execution"]["output"] == ["0", "one", "2"]


def test_run_recursive_function() -> None:
    assert run_source(FUNCTIONS)["execution"]["output"] == ["720"]


def test_run_arrays() -> None:
    assert run_source(ARRAYS)["execution"]["output"] == ["30"]


def test_run_lexical_features_with_bool_in_relational_expression() -> None:
    result = run_source(LEXICAL_FEATURES)
    assert result["compile_success"] is True
    assert result["execution"]["halted"] is False
    assert result["execution"]["output"] == ["Line\nTab\tQuote\"Backslash\\"]


def test_semantic_error_is_reported() -> None:
    compiled = compile_source("START\nPRINT missing;\nSTOP\n")
    assert compiled["success"] is False
    assert any(item["code"] == "SEM-003" for item in compiled["diagnostics"])


def test_debug_session_and_step() -> None:
    created = client.post(
        "/api/debug/sessions",
        json={"source": BASELINE, "source_lines": [5]},
    ).json()
    session_id = created["program_id"]
    assert session_id
    assert created["data"]["session"]["snapshots"]
    stepped = client.post(f"/api/debug/sessions/{session_id}/step", json={"action": "step"}).json()
    assert stepped["data"]["session"]["status"] in {"paused", "complete"}
    assert client.delete(f"/api/debug/sessions/{session_id}").status_code == 200
