"""paperloom — CLI entry point.

    paperloom ocr <input> [-o OUT] [--pages SPEC] [--include-images]
    paperloom anonymize <input> [-o OUT] [--preset balanced|recall|precision]
    paperloom chain --steps slug1,slug2,... [--params key=value,...] <input>
    paperloom doctor
    paperloom version

Headless wrapper around the same library functions; no FastAPI server
needed. Use the MCP server (`paperloom-mcp`) for agent integrations.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from importlib import util
from pathlib import Path

import httpx

from paperloom import (
    Chain,
    PaperloomError,
    __version__,
    anonymize,
    ocr_to_markdown,
)
from paperloom.config import settings


def _cmd_ocr(args: argparse.Namespace) -> int:
    try:
        md = ocr_to_markdown(
            args.input,
            pages=args.pages,
            include_images=args.include_images,
            image_strategy=args.image_strategy,
        )
    except PaperloomError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if args.output:
        Path(args.output).write_text(md, encoding="utf-8")
        print(f"wrote {args.output} ({len(md)} chars)")
    else:
        sys.stdout.write(md)
    return 0


def _cmd_anonymize(args: argparse.Namespace) -> int:
    try:
        clean = anonymize(args.input, preset=args.preset)
    except PaperloomError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if args.output:
        Path(args.output).write_text(clean, encoding="utf-8")
        print(f"wrote {args.output} ({len(clean)} chars)")
    else:
        sys.stdout.write(clean)
    return 0


def _parse_params(spec: str | None) -> dict[str, object]:
    if not spec:
        return {}
    out: dict[str, object] = {}
    for chunk in spec.split(","):
        if "=" not in chunk:
            continue
        k, v = chunk.split("=", 1)
        k, v = k.strip(), v.strip()
        if v.lower() in {"true", "false"}:
            out[k] = v.lower() == "true"
        else:
            try:
                out[k] = int(v)
            except ValueError:
                try:
                    out[k] = float(v)
                except ValueError:
                    out[k] = v
    return out


def _cmd_chain(args: argparse.Namespace) -> int:
    slugs = [s.strip() for s in args.steps.split(",") if s.strip()]
    params = _parse_params(args.params)
    steps: list[tuple[str, dict[str, object]]] = [(slug, params) for slug in slugs]
    try:
        result = Chain(steps).run(args.inputs)
    except PaperloomError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    out_dir = Path(result["root"]) / "out"
    print(f"job_id: {result['job_id']}")
    print(f"output: {out_dir}")
    if args.output:
        dest = Path(args.output)
        dest.mkdir(parents=True, exist_ok=True)
        for f in out_dir.iterdir():
            if f.is_file():
                shutil.copy2(f, dest / f.name)
        print(f"copied {len(list(dest.iterdir()))} files to {dest}")
    return 0


def _cmd_version(_: argparse.Namespace) -> int:
    print(__version__)
    return 0


def _check_ollama() -> tuple[bool, str]:
    base = settings.ollama_url
    try:
        r = httpx.get(f"{base}/api/tags", timeout=2.0)
        r.raise_for_status()
        models = [m.get("name") for m in r.json().get("models", [])]
        target = settings.ollama_model.split(":", 1)[0]
        has_glm = any(target in (m or "") for m in models)
        if not has_glm:
            return (
                False,
                f"Ollama up at {base}, but {settings.ollama_model} not pulled — "
                f"run: ollama pull {settings.ollama_model}",
            )
        return True, f"Ollama up at {base}, {settings.ollama_model} ready"
    except httpx.HTTPError as exc:
        return False, f"Ollama unreachable at {base} ({exc.__class__.__name__}) — start with `ollama serve`"


def _check_opf() -> tuple[bool, str]:
    if util.find_spec("opf") is None:
        return False, "OPF not installed — `pip install paperloom[anonymizer]` for the anonymize tool"
    return True, "OPF installed"


def _check_weasyprint() -> tuple[bool, str]:
    if util.find_spec("weasyprint") is None:
        return False, "WeasyPrint not installed — `pip install paperloom[pdf]` for markdown→pdf and html→pdf"
    return True, "WeasyPrint installed"


def _check_allowlist() -> tuple[bool, str]:
    raw = settings.mcp_allowed_dirs or ""
    dirs = [Path(d.strip()).expanduser() for d in raw.split(",") if d.strip()]
    if not dirs:
        return False, "PAPERLOOM_MCP_ALLOWED_DIRS empty — MCP register_file will reject everything"
    missing = [str(d) for d in dirs if not d.is_dir()]
    if missing:
        return False, f"allowlist dirs missing: {missing}"
    return True, f"allowlist: {[str(d) for d in dirs]}"


def _cmd_doctor(_: argparse.Namespace) -> int:
    print(f"paperloom {__version__} — environment check\n")
    checks = [
        ("Ollama + glm-ocr", _check_ollama()),
        ("MCP allowlist", _check_allowlist()),
        ("OPF (anonymizer)", _check_opf()),
        ("WeasyPrint (pdf)", _check_weasyprint()),
    ]
    fail = 0
    for name, (ok, msg) in checks:
        flag = "OK  " if ok else "FAIL"
        print(f"  [{flag}] {name}: {msg}")
        if not ok and name == "Ollama + glm-ocr":
            fail += 1
    print()
    print(
        "Hardware: GLM-OCR is RAM-bound. Recommended ≥ 24 GB unified RAM "
        "(Apple Silicon Pro) or 24 GB+ GPU VRAM. Minimum 16 GB. Below that the "
        "OS may freeze hard during OCR — see README."
    )
    print()
    if fail:
        print("FAIL — some hard requirements missing. Fix the items above.")
        return 1
    print("OK — paperloom ready.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="paperloom", description=__doc__)
    parser.add_argument("--version", action="version", version=f"paperloom {__version__}")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_ocr = sub.add_parser("ocr", help="OCR a PDF or image to Markdown")
    p_ocr.add_argument("input")
    p_ocr.add_argument("-o", "--output")
    p_ocr.add_argument("--pages", help='page spec, e.g. "1,3-5"')
    p_ocr.add_argument("--include-images", action="store_true")
    p_ocr.add_argument(
        "--image-strategy", choices=["auto", "objects", "llm"], default="auto"
    )
    p_ocr.set_defaults(func=_cmd_ocr)

    p_anon = sub.add_parser("anonymize", help="Redact PII from a markdown/text file")
    p_anon.add_argument("input")
    p_anon.add_argument("-o", "--output")
    p_anon.add_argument(
        "--preset", choices=["balanced", "recall", "precision"], default="balanced"
    )
    p_anon.set_defaults(func=_cmd_anonymize)

    p_chain = sub.add_parser("chain", help="Run a comma-separated tool pipeline")
    p_chain.add_argument(
        "--steps", required=True, help="e.g. pdf-to-images,ocr-to-markdown,anonymize"
    )
    p_chain.add_argument(
        "--params", help="e.g. dpi=200,preset=recall (applied to every step)"
    )
    p_chain.add_argument("-o", "--output", help="copy outputs to this directory")
    p_chain.add_argument("inputs", nargs="+")
    p_chain.set_defaults(func=_cmd_chain)

    p_doctor = sub.add_parser("doctor", help="Check Ollama, allowlist, and optional extras")
    p_doctor.set_defaults(func=_cmd_doctor)

    p_version = sub.add_parser("version", help="Print version and exit")
    p_version.set_defaults(func=_cmd_version)

    args = parser.parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
