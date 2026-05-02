"""CI lint: paperloom/anonymizer/** must NEVER import network clients.

Per doc/rules/anonymizer.md "Privacy guarantees": no outbound HTTP from the
anonymizer code path. This test AST-walks every .py file under
backend/paperloom/anonymizer/ and fails the build if it finds any of the
banned imports.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1] / "paperloom" / "anonymizer"

BANNED = {"httpx", "requests", "urllib", "urllib3", "socket", "aiohttp"}


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                out.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.module:
            out.add(node.module.split(".")[0])
    return out


@pytest.mark.parametrize("path", sorted(ROOT.rglob("*.py")), ids=lambda p: p.name)
def test_no_network_imports(path: Path) -> None:
    found = _imports(path)
    leaks = found & BANNED
    assert not leaks, f"{path.relative_to(ROOT.parent.parent)} imports {leaks}"
