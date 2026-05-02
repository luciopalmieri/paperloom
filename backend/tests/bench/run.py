"""Benchmark runner: per-fixture × per-tool × per-metric.

Run paperloom and (optionally) marker / docling / MinerU over every fixture
and dump per-run JSON into `results/`. Each tool is invoked in its own
subprocess so we never have to import them in the same Python.

This is scaffolding — most of the comparator branches are no-ops until
you set up the corresponding venvs (see README.md). A run with only
paperloom installed is the minimum useful invocation.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "fixtures"
RESULTS = ROOT / "results"
RESULTS.mkdir(exist_ok=True)


def _list_fixtures() -> list[Path]:
    return sorted(p for p in FIXTURES.glob("*.pdf"))


def _run_paperloom(pdf: Path, out_md: Path) -> dict[str, object]:
    """Run paperloom CLI in the current venv. Assumes `paperloom` on PATH."""
    if not shutil.which("paperloom"):
        return {"skipped": "paperloom CLI not on PATH"}
    t0 = time.perf_counter()
    proc = subprocess.run(
        ["paperloom", "ocr", str(pdf), "-o", str(out_md)],
        capture_output=True,
        text=True,
    )
    dt = time.perf_counter() - t0
    return {
        "tool": "paperloom",
        "wall_seconds": round(dt, 2),
        "ok": proc.returncode == 0,
        "stderr_tail": proc.stderr[-400:] if proc.returncode != 0 else None,
        "out_md": str(out_md) if out_md.is_file() else None,
    }


def _run_marker(pdf: Path, out_md: Path) -> dict[str, object]:
    """Stub: invoke marker-pdf in a sibling venv if installed."""
    venv_python = Path(".bench-marker/bin/python")
    if not venv_python.is_file():
        return {"skipped": "no .bench-marker venv (see README.md)"}
    t0 = time.perf_counter()
    proc = subprocess.run(
        [
            str(venv_python),
            "-m",
            "marker.scripts.convert_single",
            str(pdf),
            "--output_dir",
            str(out_md.parent),
        ],
        capture_output=True,
        text=True,
    )
    dt = time.perf_counter() - t0
    return {
        "tool": "marker",
        "wall_seconds": round(dt, 2),
        "ok": proc.returncode == 0,
        "stderr_tail": proc.stderr[-400:] if proc.returncode != 0 else None,
        "out_md": str(out_md) if out_md.is_file() else None,
    }


def _run_docling(pdf: Path, out_md: Path) -> dict[str, object]:
    venv_python = Path(".bench-docling/bin/python")
    if not venv_python.is_file():
        return {"skipped": "no .bench-docling venv (see README.md)"}
    return {"tool": "docling", "skipped": "docling runner not implemented yet"}


RUNNERS = {
    "paperloom": _run_paperloom,
    "marker": _run_marker,
    "docling": _run_docling,
}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--tool", choices=[*RUNNERS.keys(), "all"], default="paperloom")
    p.add_argument("--fixture", default="all", help='fixture stem or "all"')
    args = p.parse_args(argv)

    fixtures = _list_fixtures()
    if args.fixture != "all":
        fixtures = [f for f in fixtures if f.stem == args.fixture]
    if not fixtures:
        print("no fixtures matched", file=sys.stderr)
        return 1

    tools = list(RUNNERS) if args.tool == "all" else [args.tool]

    for pdf in fixtures:
        for tool in tools:
            run_dir = RESULTS / pdf.stem / tool
            run_dir.mkdir(parents=True, exist_ok=True)
            out_md = run_dir / f"{pdf.stem}.md"
            print(f"[{tool}] {pdf.name}…", flush=True)
            result = RUNNERS[tool](pdf, out_md)
            (run_dir / "result.json").write_text(json.dumps(result, indent=2))
            print(f"   {result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
