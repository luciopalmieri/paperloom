# Release checklist

Pre-flight before publishing a new `paperloom` version to PyPI. Tier 1 is mandatory and automatable — anything failing blocks the release. Tier 2 needs human eyes (real Ollama, real Claude Desktop, real browser). Tier 3 is the dry-run on TestPyPI; recommended for the first release and any release that touches packaging.

> Update `version` in `backend/pyproject.toml`, then `paperloom._api.__version__`, then bump `.claude-plugin/plugin.json` to match. CI will fail later if these drift.

## Tier 1 — automatable (BLOCKER)

```bash
cd backend
rm -rf dist/
uv build                           # 1.1
uv run pytest -q                   # 81 passed, 2 skipped
```

- [ ] **1.1 Build** — `dist/paperloom-X.Y.Z-py3-none-any.whl` + `dist/paperloom-X.Y.Z.tar.gz` produced without warnings.
- [ ] **1.2 Install in clean venv**
  ```bash
  uv venv /tmp/paperloom-rc --python 3.12
  /tmp/paperloom-rc/bin/python -m ensurepip
  /tmp/paperloom-rc/bin/python -m pip install dist/paperloom-X.Y.Z-py3-none-any.whl
  ```
  Both `paperloom` and `paperloom-mcp` land in `/tmp/paperloom-rc/bin/`.
- [ ] **1.3 Smoke CLI**
  ```bash
  /tmp/paperloom-rc/bin/paperloom version    # prints X.Y.Z
  /tmp/paperloom-rc/bin/paperloom status --json   # mode local, components ocr+anonymizer
  /tmp/paperloom-rc/bin/paperloom doctor          # all sections render
  ```
- [ ] **1.4 MCP banner + clean exit**
  ```bash
  echo "" | /tmp/paperloom-rc/bin/paperloom-mcp
  ```
  Banner printed to stderr, server exits with no traceback (a single `JSONRPCMessage` parse error on EOF is expected and fine).
- [ ] **1.5 Wheel cleanliness**
  ```bash
  unzip -l dist/paperloom-X.Y.Z-py3-none-any.whl | grep -iE 'test|__pycache__|/src/'
  ```
  Output empty. No tests, no compiled caches, no leftover `src/` from old layout.
- [ ] **1.6 Extras resolve from PyPI metadata** (not just `tool.uv.sources`)
  ```bash
  /tmp/paperloom-rc/bin/python -m pip install --dry-run \
    "dist/paperloom-X.Y.Z-py3-none-any.whl[pdf]"
  /tmp/paperloom-rc/bin/python -m pip install --dry-run \
    "dist/paperloom-X.Y.Z-py3-none-any.whl[all]"
  ```
  Both succeed. **`[anonymizer]` does NOT exist as a PyPI extra** — OPF auto-installs on first `anonymize` call. Document this; don't try to add the extra back.
- [ ] **1.7 Public API import contract**
  ```bash
  /tmp/paperloom-rc/bin/python -c "from paperloom import \
    ocr_to_markdown, anonymize, Chain, arun_chain, list_tools, \
    PaperloomError, __version__; print(__version__, len(list_tools()))"
  ```
  Prints `X.Y.Z 19`. If the count drifts, audit which tool was added/removed.
- [ ] **1.8 Privacy state honors env**
  ```bash
  OCR_PROVIDER=mistral MISTRAL_API_KEY=fake \
    /tmp/paperloom-rc/bin/paperloom status --json | jq '.privacy.mode'
  ```
  Outputs `"hybrid"`.

## Tier 2 — human-in-the-loop (HIGH RISK)

These need real services or browser tabs. Don't publish to PyPI until they all pass.

### Backend / OCR

- [ ] **2.1 OCR end-to-end via Ollama (web UI)** — `pnpm dev`, drop a real PDF in `/tools/ocr-to-markdown`, watch streaming, verify final Markdown is sensible.
- [ ] **2.2 OCR end-to-end via CLI**
  ```bash
  paperloom ocr ~/some.pdf -o /tmp/out.md
  ```
  Output `.md` is sensible.
- [ ] **2.3 Chain end-to-end** — `/tools/chain` builder with `pdf-to-images → ocr-to-markdown → anonymize`. Verify zip artifact + redactions report.

### Privacy mode

- [ ] **2.4 Privacy badge — local** — `pnpm dev`, badge "Local" green. Click → dropdown shows components + caveat.
- [ ] **2.5 Privacy badge — hybrid** — `OCR_PROVIDER=mistral MISTRAL_API_KEY=fake pnpm dev`. Badge "Hybrid" amber. Caveat list grows by one entry: "Cloud components active: ocr".

### MCP integration

- [ ] **2.6 MCP from Claude Desktop** — wire `uvx paperloom-mcp` into `claude_desktop_config.json`. Restart Claude Desktop. Banner appears in app logs (`~/Library/Logs/Claude/mcp-server-paperloom.log` on macOS). Drive a real OCR with "OCR `~/Downloads/x.pdf`".
- [ ] **2.7 Mistral backend (real API)** — only if you have an API key with budget for the test. `OCR_PROVIDER=mistral MISTRAL_API_KEY=sk-... paperloom ocr small.pdf`. Verify markdown returned, mode reports `hybrid`.
- [ ] **2.8 OPF auto-install** — drop OPF from your venv (`uv pip uninstall opf`), trigger an `anonymize` chain, verify the SSE event sequence emits `installing_opf` and the chain completes after the install. (Not required every release — only after touching `paperloom/anonymizer/_lazy_install.py`.)

## Tier 3 — TestPyPI dry-run (RECOMMENDED for first release / packaging changes)

[TestPyPI](https://test.pypi.org/) is an isolated PyPI clone for testing the publish flow. Costs nothing. Catches metadata/file/permission issues that only show up post-publish.

### One-time setup

- Create a TestPyPI account: <https://test.pypi.org/account/register/>
- Generate an API token (project scope `paperloom`): <https://test.pypi.org/manage/account/token/>
- Store it in your shell or in `~/.pypirc`:
  ```ini
  [testpypi]
    username = __token__
    password = pypi-AgENdGVz...
  ```

### Per-release

- [ ] **3.1 Publish to TestPyPI**
  ```bash
  cd backend
  uv publish --publish-url https://test.pypi.org/legacy/ \
    --username __token__ --password "$TESTPYPI_TOKEN" \
    dist/*
  ```
  Project page becomes visible at `https://test.pypi.org/project/paperloom/`.
- [ ] **3.2 Install from TestPyPI** in another fresh venv. The extra-index is required because TestPyPI doesn't mirror common deps:
  ```bash
  uv venv /tmp/paperloom-testpypi --python 3.12
  /tmp/paperloom-testpypi/bin/python -m ensurepip
  /tmp/paperloom-testpypi/bin/python -m pip install \
    --index-url https://test.pypi.org/simple/ \
    --extra-index-url https://pypi.org/simple/ \
    paperloom==X.Y.Z
  /tmp/paperloom-testpypi/bin/paperloom version
  ```
- [ ] **3.3 `uvx` from TestPyPI**
  ```bash
  uvx --index https://test.pypi.org/simple/ \
      --index https://pypi.org/simple/ \
      paperloom-mcp <<< ""
  ```
  Banner prints, server exits.

If any of 3.1–3.3 fails, fix and re-tag a `rc.N` candidate (`X.Y.ZrcN`) — TestPyPI does not allow re-uploading the same version filename.

## Tier 4 — production publish

Only after Tier 1 + Tier 2 (+ Tier 3 if changing packaging) are all checked.

- [ ] **4.1 Tag the release** — `git tag vX.Y.Z && git push --tags`. Don't tag before all the tiers are green.
- [ ] **4.2 Publish**
  ```bash
  cd backend && uv publish dist/*
  ```
- [ ] **4.3 Smoke `uvx paperloom-mcp` from public PyPI**
  ```bash
  uvx --no-cache paperloom-mcp <<< ""
  ```
- [ ] **4.4 Update Claude Code plugin marketplace** — bump `.claude-plugin/plugin.json` `version`, commit, push to the marketplace repo / branch.
- [ ] **4.5 Announce** — write release notes against the tag on GitHub, link to the new docs (`doc/distribution.md`, `doc/cookbook/`).

## Common pitfalls

- **`[anonymizer]` extra.** Do not re-add it. OPF ships only as a git repo and pip refuses direct-URL deps in published wheels. Auto-install handles it.
- **Drift between `pyproject.toml`, `paperloom._api.__version__`, and `.claude-plugin/plugin.json`.** Bump all three or none.
- **`uv publish` on the same version twice.** PyPI rejects re-uploads. Always bump or use a `rcN` suffix.
- **WeasyPrint native deps.** `[pdf]` extra requires `pango` / `cairo` system libraries. Document for users; don't promise pure-pip install.
- **Cloud-OCR API keys leaking into release notes.** `paperloom doctor` and `paperloom status --json` echo the *provider name* but never the key — keep it that way when adding new providers.
