"""
Sandboxed-ish Python code execution tool used by the Coder agent.

Runs generated code as a *separate subprocess* (not exec() in-process)
with a timeout, its own temp working directory, and no network calls
expected of it. This is a teaching-project level sandbox, not a
production-grade one -- see README "Security notes" for what a real
deployment would add (gVisor/firecracker/Docker isolation, no
filesystem access outside the temp dir, resource limits, etc).

CHART STORAGE: charts are returned as a base64 data URI instead of a
filesystem path. Render's disk is ephemeral -- anything written to
/tmp (or anywhere else on the local filesystem) is wiped on every
restart/redeploy, and Render's free tier also spins the service down
after ~15 min of inactivity, which counts as a restart. A chart saved
to disk and referenced by *path* in the database would 404 the next
time someone opens that report after a restart, even though the
report text itself is fine (it's stored in Postgres). Embedding the
image as a data URI makes it part of the same persisted row, so it
survives restarts exactly like the rest of the report.
"""
import base64
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Tuple, Optional

TIMEOUT_SECONDS = 15
# Hardening for LLM-generated code: kill runaway CPU/memory, cap output.
# (POSIX only -- Windows has no resource module; timeout still applies.)
MAX_CPU_SECONDS = 10
MAX_MEMORY_BYTES = 512 * 1024 * 1024  # 512 MB
MAX_OUTPUT_CHARS = 50000


def _limit_child_resources() -> None:
    """preexec_fn: clamp CPU and address space of the child process."""
    import resource

    resource.setrlimit(resource.RLIMIT_CPU, (MAX_CPU_SECONDS, MAX_CPU_SECONDS))
    resource.setrlimit(resource.RLIMIT_AS, (MAX_MEMORY_BYTES, MAX_MEMORY_BYTES))


def run_python_code(code: str) -> Tuple[str, Optional[str]]:
    """
    Executes `code` in a fresh subprocess.
    If the code saves a file called chart.png in its working directory,
    it's read back and returned as a base64 data URI (not a filesystem
    path) so it can be stored directly in the database and displayed
    with a plain <img src="..."> -- no separate file-serving endpoint,
    no dependency on the chart still being on disk later.

    Returns: (stdout_or_error_text, chart_data_uri_or_None)
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
                preexec_fn=_limit_child_resources if os.name == "posix" else None,
            )
        except subprocess.TimeoutExpired:
            return f"Execution timed out after {TIMEOUT_SECONDS}s.", None

        output = result.stdout
        if result.returncode != 0:
            output += "\n" + result.stderr
        if len(output) > MAX_OUTPUT_CHARS:
            # A script printing megabytes would blow up memory / the DB row.
            output = output[:MAX_OUTPUT_CHARS] + "\n...[output truncated]"

        chart_data_uri = None
        generated_chart = Path(tmpdir) / "chart.png"
        if generated_chart.exists():
            png_bytes = generated_chart.read_bytes()
            b64 = base64.b64encode(png_bytes).decode("ascii")
            chart_data_uri = f"data:image/png;base64,{b64}"

        return output.strip(), chart_data_uri
