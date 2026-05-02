"""paperloom — local-first document toolkit.

Public API:
    paperloom.ocr_to_markdown(path) -> str
    paperloom.anonymize(text_or_path, preset=...) -> str
    paperloom.Chain([(slug, params), ...]).run(inputs) -> dict
    paperloom.arun_chain(chain, inputs) -> coroutine
    paperloom.list_tools() -> list[str]

Lower-level access (FastAPI app, MCP server, internal modules) is
available via `paperloom.main`, `paperloom.mcp_server`, etc., but those
surfaces are not covered by SemVer compatibility.
"""

from paperloom._api import (
    Chain,
    PaperloomError,
    __version__,
    anonymize,
    arun_chain,
    list_tools,
    ocr_to_markdown,
)

__all__ = [
    "Chain",
    "PaperloomError",
    "__version__",
    "anonymize",
    "arun_chain",
    "list_tools",
    "ocr_to_markdown",
]
