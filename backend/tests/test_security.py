"""Security regression tests: rate limiter, input guards, executor hardening."""
import pytest
from fastapi import HTTPException

from app.rate_limit import check_rate_limit, _windows


def _reset():
    _windows.clear()


def test_rate_limiter_allows_then_blocks():
    _reset()
    for _ in range(5):
        check_rate_limit("test-key", max_requests=5, window_seconds=60)
    with pytest.raises(HTTPException) as exc:
        check_rate_limit("test-key", max_requests=5, window_seconds=60)
    assert exc.value.status_code == 429


def test_rate_limiter_window_resets():
    _reset()
    import time
    check_rate_limit("win-key", max_requests=1, window_seconds=1)
    with pytest.raises(HTTPException):
        check_rate_limit("win-key", max_requests=1, window_seconds=1)
    time.sleep(1.1)
    check_rate_limit("win-key", max_requests=1, window_seconds=1)  # no raise


def test_rate_limiter_is_per_key():
    _reset()
    check_rate_limit("a", max_requests=1, window_seconds=60)
    check_rate_limit("b", max_requests=1, window_seconds=60)  # different key: fine


def test_input_length_guard():
    from app.main import _limit_text, MAX_TEXT_CHARS, MAX_QUERY_CHARS
    assert _limit_text("hello", MAX_TEXT_CHARS, "Text") == "hello"
    with pytest.raises(HTTPException) as exc:
        _limit_text("x" * (MAX_QUERY_CHARS + 1), MAX_QUERY_CHARS, "Query")
    assert exc.value.status_code == 413


def test_code_executor_output_capped():
    from app.tools.code_executor import run_python_code, MAX_OUTPUT_CHARS
    out, chart = run_python_code("print('y' * 200000)")
    assert len(out) <= MAX_OUTPUT_CHARS + 100
    assert "truncated" in out
    assert chart is None


def test_code_executor_basic_still_works():
    from app.tools.code_executor import run_python_code
    out, chart = run_python_code("print(2 + 2)")
    assert out.strip() == "4"


def test_security_headers_present():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as client:
        r = client.get("/api/health")
        assert r.headers["X-Content-Type-Options"] == "nosniff"
        assert r.headers["X-Frame-Options"] == "DENY"
        assert "Referrer-Policy" in r.headers


def test_pypdf_import_migrated():
    """PyPDF2 (abandoned, infinite-loop CVE) replaced by maintained pypdf fork."""
    import app.tools.pdf_parser as pp
    assert pp.PdfReader.__module__.startswith("pypdf")
