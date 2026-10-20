# General Collector raw evidence export

Authority: user's Raw Evidence Export as the Primary Collector Delivery Path task.
Baseline: 16e7487; preserve the seven readiness changes and private reports.

## Bounded design

Keep existing normalized Data Package v1 files and specialized package writers.
Add `raw/` and `RAW_EVIDENCE.json` only to the general desktop export path.
Reuse the accepted loader's byte/hash checks; additionally bind the actual accepted
Attempt and Validation. The index preserves native filename/media type, Workspace,
Source/Dataset/Run/Job/Attempt/Artifact/Validation, safe requested/acquisition context,
and actual job/attempt outcomes. Missing dataset identity stays null. Normalization
can be unavailable without preventing an otherwise valid raw export. Integrity
and identity failures always abort. No provider acquisition or Blog rules change.

The existing general writer gets an optional raw companion input and publishes
that flow through private staging, a reservation, exclusive raw writes, readback
hash checks and rename; an existing target is refused. Legacy writer calls keep
their format. Native desktop composition uses the loader's combined export method.

## Work and verification

- [x] RED: real SQLite + mocked Sitemap acquisition through the production runtime,
  loader and desktop controller; assert exact XML copy/index, truthful outcomes,
  Blog blocker independence and non-overwrite. Add corrupted/unsafe/secret metadata
  and identity failures, plus raw-only normalization compatibility.
- [x] GREEN: extend existing loader/exporter; wire controller and main composition.
- [x] Verify focused raw flow, existing loader/exporter/desktop export, Blog v1
  compatibility, affected Blog v2 integrity gates, TypeScript, lint and diff checks.
- [x] Update only canonical general-export contract and current handoff from results.

No live requests, production Runs/exports, migrations, packaging, commits or pushes.

## Verified execution

Initial fixture runner needed the assembler compile entry added before meaningful
RED: all five cases then failed because the general desktop path had no combined
raw export loader. Initial GREEN reached 5/5. Runtime HTTP 503 truthfully produces
RETRY_REQUIRED; fixtures verify export is blocked until explicit native cancellation,
then export failed/accepted sibling outcomes without changing terminal-Run policy.

Focused read-only review identified lost GA4 session_filter scope from overly broad
sanitization and cleanup reporting failure after successful rename. Both were
reproduced (6/8 passed, 2 failed), corrected and verified at 8/8. The final suite
also covers concurrent publication, incorrect Attempt/Validation/metadata binding,
raw corruption/missing/unaccepted evidence, path/symlink rejection, secret-context
removal, native NO_DATA bytes and missing optional normalizer. Review follow-up
found no remaining confirmed issue in scope.

The real SQLite-reopened Run, production mocked Sitemap runtime, accepted loader
and DesktopMultiSourceController.exportRun path exported the same 177 XML bytes:
SHA-256 `cdf17293261a509c8e7dcb180513a4ef87493cd909377cbcd7c7ce9518c3d910`.
The actual Blog v2 evaluator independently retained its title/missing-family
blockers; no injected readiness verdict was used. Accepted file bytes and Attempt
records were unchanged. Normalized datasets remained readable.

Commands (all final results PASS, Node v24.19.0):

| Command | Result |
| --- | --- |
| `bash tests/integration/export/run-general-raw-evidence-export-test.sh` | 8/8 |
| `bash tests/integration/export/run-production-data-package-loader-test.sh` | PASS |
| `bash tests/integration/export/run-data-package-exporter-test.sh` | PASS, including CSV/XLSX consumers; rerun after review fixes |
| `bash tests/integration/app/run-desktop-retry-export-test.sh` | PASS |
| `bash tests/integration/blog-writing-packs/run-blog-writing-pack-gate.sh assembler` | PASS |
| `bash tests/integration/blog-writing-packs/run-blog-writing-pack-gate.sh store` | PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-readiness-test.sh` | 11/11 |
| `bash tests/integration/blog-writing-packs/run-blog-v2-publication-test.sh` | 59/59 |
| `npx tsc --noEmit` | PASS after review fixes |
| `npx eslint --max-warnings 0 src/main.ts src/main/app/desktop-multisource-controller.ts src/main/export/data-package-exporter.ts src/main/export/production-data-package-loader.ts` | PASS after review fixes |
| `npx eslint --no-ignore --env node,es2021 --rule '@typescript-eslint/no-require-imports: off' --max-warnings 0 tests/integration/export/general-raw-evidence-export.integration.cjs` | PASS after review fixes |
| `/bin/bash -n tests/integration/export/run-general-raw-evidence-export-test.sh` | PASS |
| `git diff --check` | PASS |

Task files: the four production paths in the lint command above; the new test and
runner; DATA_CONTRACTS.md, PROJECT_HANDOFF.md and this plan. Prior readiness
source/test changes and private reports retain exact hashes; the two shared
documents retain the readiness work with additive raw-export routing/contracts.
The separate root checkout status/diff and feature HEAD/index are unchanged.

Acceptance limits: this proves one production-wired source vertical slice with
mocked HTTP, not live-provider, full multi-source or packaged Electron acceptance.
An existing output directory is deliberately refused. Legacy absent acquisition
context and unavailable dataset identity are explicit nulls; optional normalization
can be absent. The renderer's dataset counter remains the normalized dataset count.
Blog v2 completeness and delivery blockers are unchanged and do not gate Collector
raw export. No release gate or provider request was run.
