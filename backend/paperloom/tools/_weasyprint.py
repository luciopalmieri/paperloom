from __future__ import annotations

import importlib


class WeasyPrintUnavailable(RuntimeError):
    """Raised when WeasyPrint cannot find its native dependencies (cairo,
    pango, glib/gobject). On macOS the typical fix is `brew install pango`.
    """


def html_to_pdf_bytes(html_string: str, base_url: str | None = None) -> bytes:
    try:
        weasyprint = importlib.import_module("weasyprint")
    except (ImportError, OSError) as exc:
        raise WeasyPrintUnavailable(str(exc)) from exc
    try:
        return weasyprint.HTML(string=html_string, base_url=base_url).write_pdf()
    except OSError as exc:
        raise WeasyPrintUnavailable(str(exc)) from exc
