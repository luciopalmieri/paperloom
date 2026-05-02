"""On-demand install of the OPF anonymizer.

Triggered the first time `anonymize` runs without `opf` importable. Keeps
the default `pip install paperloom` payload small while still letting the
chain `... → anonymize` Just Work — at the cost of a one-time install pause
the first time a user touches PII redaction.

Disable via env var `PAPERLOOM_AUTO_INSTALL_OPF=0` if you want the explicit
two-step flow (`pip install paperloom[anonymizer]`).
"""

from __future__ import annotations

import importlib
import os
import shutil
import subprocess
import sys
from collections.abc import Callable

from paperloom.anonymizer import detect

_OPF_GIT = "opf @ git+https://github.com/openai/privacy-filter.git@main"


def auto_install_enabled() -> bool:
    return os.environ.get("PAPERLOOM_AUTO_INSTALL_OPF", "1") not in {"0", "false", "False"}


def _installer_argv() -> list[str] | None:
    """Pick the best installer reachable from this Python env.

    Prefers `uv pip install` when `uv` is on PATH (matches the repo's dev
    workflow). Falls back to `python -m pip install`. Returns None if no
    installer is reachable — caller should surface the manual command.
    """
    if shutil.which("uv"):
        return ["uv", "pip", "install", "--python", sys.executable, _OPF_GIT]
    if importlib.util.find_spec("pip") is not None:
        return [sys.executable, "-m", "pip", "install", _OPF_GIT]
    return None


def install_opf(emit: Callable[[str], None] | None = None) -> bool:
    """Run the installer in a blocking subprocess. Returns True on success.

    `emit(line)` is called with each non-empty stderr/stdout line so the
    caller can stream progress to the UI / SSE client.
    """
    argv = _installer_argv()
    if argv is None:
        if emit:
            emit("no installer found (uv or pip); install manually: pip install paperloom[anonymizer]")
        return False
    if emit:
        emit(f"installing OPF via: {' '.join(argv)}")
    try:
        proc = subprocess.Popen(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
    except OSError as exc:
        if emit:
            emit(f"installer failed to start: {exc}")
        return False
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.rstrip()
        if line and emit:
            emit(line)
    rc = proc.wait()
    # `find_spec` caches per process — reload importlib internals so a
    # subsequent `importlib.util.find_spec("opf")` actually sees the new pkg.
    importlib.invalidate_caches()
    if rc != 0:
        if emit:
            emit(f"installer exited with code {rc}")
        return False
    # Final guard: reload the detect module so its `_opf_available()` cache
    # of `find_spec` returns True.
    return importlib.util.find_spec("opf") is not None


def opf_present() -> bool:
    return detect._opf_available()
