"""
Sandboxed-ish Python code execution tool used by the Coder agent.

Runs generated code as a *separate subprocess* (not exec() in-process)
with a timeout, its own temp working directory, and no network calls
expected of it. This is a teaching-project level sandbox, not a
production-grade one -- see README "Security notes" for what a real
deployment would add (gVisor/firecracker/Docker isolation, no
filesystem access outside the temp dir, resource limits, etc).
"""
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Tuple, Optional

CHARTS_DIR = Path(tempfile.gettempdir()) / "agentic_assistant_charts"
CHARTS_DIR.mkdir(exist_ok=True)

TIMEOUT_SECONDS = 15


def run_python_code(code: str) -> Tuple[str, Optional[str]]:
    """
    Executes `code` in a fresh subprocess.
    If the code saves a file called chart.png in its working directory,
    that file is moved to CHARTS_DIR and its path is returned so the
    frontend can display it alongside the report.

    Returns: (stdout_or_error_text, chart_path_or_None)
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        script_path = Path(tmpdir) / "snippet.py"
        # encoding="utf-8" is required -- on Windows, write_text() defaults to
        # the system locale codepage (often cp1252 "charmap"), which raises
        # UnicodeEncodeError if the LLM-generated code contains any Unicode
        # character outside that codepage (e.g. an en-dash or non-breaking
        # hyphen), even though the same code would run fine if saved by hand.
        script_path.write_text(code, encoding="utf-8")

        # Force the child process itself to use UTF-8 for its own stdout/
        # stderr too -- otherwise a print() inside the generated script can
        # hit the same cp1252 encoding error on Windows, from the other side.
        child_env = os.environ.copy()
        child_env["PYTHONIOENCODING"] = "utf-8"
        # Headless deploy servers (Render, etc.) have no display -- force
        # matplotlib's non-interactive backend so chart-saving code doesn't
        # crash trying to open a GUI window that doesn't exist.
        child_env["MPLBACKEND"] = "Agg"

        try:
            result = subprocess.run(
                [sys.executable, str(script_path)],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=TIMEOUT_SECONDS,
                env=child_env,
            )
        except subprocess.TimeoutExpired:
            return f"Execution timed out after {TIMEOUT_SECONDS}s.", None

        output = result.stdout
        if result.returncode != 0:
            output += "\n" + result.stderr

        chart_path = None
        generated_chart = Path(tmpdir) / "chart.png"
        if generated_chart.exists():
            dest = CHARTS_DIR / f"{uuid.uuid4().hex}.png"
            dest.write_bytes(generated_chart.read_bytes())
            chart_path = str(dest)

        return output.strip(), chart_path
