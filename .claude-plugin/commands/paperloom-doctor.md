---
name: paperloom-doctor
description: Run paperloom's environment check — verifies Ollama is up, glm-ocr is pulled, MCP allowlist is configured, and reports OPF / WeasyPrint extras status.
---

Run `uvx paperloom doctor` and surface the result. If any line says FAIL, suggest the fix it provides verbatim — don't try to repair the user's environment without confirmation.
