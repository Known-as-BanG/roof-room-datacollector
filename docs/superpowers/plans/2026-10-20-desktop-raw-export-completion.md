# Desktop raw export completion

Authority: user's Desktop Raw Export Completion and Multi-Source Evidence
Verification request. HEAD 16e7487; preserve existing readiness/raw-export work,
private reports and root checkout. No providers, business exports, commits or pushes.

## Bounded design

Add optional raw/normalized/unavailable/warning counts and a collection status to
the existing shared desktop export result. Keep dataset_count as its normalized
compatibility alias. Derive counts from the verified raw export and persisted Job
outcomes, independently of ALL versus SUCCESSFUL_ONLY failure-list filtering.
The renderer leads with actual raw files and successful export, separately showing
optional normalization, failed/cancelled Jobs, missing evidence, warnings, collection
completeness and destination. Legacy responses must not invent a raw count.

Reuse the existing general raw fixture and production runtime: add mocked official
GSC API JSON and an actual native İkas XLSX import to the HTTP/XML Run. Reopen
SQLite, export through the actual loader/controller/writer and verify all bytes,
hashes, sizes, filenames/media types and persisted identities. Use native Google
Trends validation for a genuine LOW_DATA fixture, without seeding accepted artifacts.

- [x] RED: result-count/status assertions and renderer assertions, including raw-only
  normalization and SUCCESSFUL_ONLY with failed evidence.
- [x] GREEN: shared result contract, controller result and renderer only.
- [x] Verify native XML/API JSON/XLSX and warning/failure outcomes, existing safety
  cases, focused UI/general-export/v1 gates, TypeScript/lint/diff.
- [x] Record exact results and update canonical export contract/current handoff.

No provider implementation, Blog contract, source-neutral Core or storage change.

## Verification evidence (2026-10-20)

RED: existing raw suite had three missing result-count failures (5/8 passed);
renderer smoke failed its raw-file display assertion. GREEN: expanded raw suite
10/10, renderer smoke passed. Native multi-source complete and mixed-failure Runs
are reviewed/started normally, acquired with mocked HTTP/API or the selected native
file importer, validated and reopened from SQLite before export. No accepted
artifact/validation status is seeded. LOW_DATA uses mocked Trends CSV acquisition
with the production validator; normalizer absence is independently simulated on
genuinely accepted XML. HTTP 503 Jobs remain FAILED with their original Attempt
error, even after terminal Run cancellation. Both modes report incomplete evidence.

| Native raw file | Bytes | SHA-256 (input = persisted = exported) | Media type |
| --- | ---: | --- | --- |
| bitkimark-sitemap-812437a5e621.xml | 177 | cdf17293261a509c8e7dcb180513a4ef87493cd909377cbcd7c7ce9518c3d910 | application/xml |
| gsc-query.json | 194 | fa09b49f6129c2d34d52ff90ffe87c1e6201a2452e451cc8639aa97077d7d8ee | application/json |
| ikas-products.xlsx | 605 | ad4a54520a02016e65188e1f4e2bcf41538d61152437f39d4002b675067c3f16 | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet |

The existing XLSX fixture generator timestamps its ZIP, so its checksum can differ
between test executions; equality within each acquisition/persistence/export is
asserted. Each exported entry retains native filename, media type, byte size,
Workspace/Run/Source/Job/Attempt/Artifact/Validation associations, acquisition time
and the exact persisted metadata checksum. No source bytes or Attempt records change.

Commands completed successfully:

- `bash tests/integration/export/run-general-raw-evidence-export-test.sh` — 10/10,
  including the prior eight raw-export cases, multiple native sources, LOW_DATA,
  NO_DATA, missing normalization, corrupt/missing/unaccepted/mismatched evidence,
  unsafe paths/symlinks, destination overwrite/concurrency and cleanup failure.
- `bash tests/integration/app/run-desktop-ui-smoke-test.sh` — PASS, including raw-only,
  incomplete, warning, both export modes and legacy-result rendering.
- `bash tests/integration/export/run-production-data-package-loader-test.sh` — PASS.
- `bash tests/integration/export/run-data-package-exporter-test.sh` — PASS, including
  existing Keyword Planner CSV/XLSX companions.
- `bash tests/integration/app/run-desktop-retry-export-test.sh` — PASS, including
  accepted-evidence identity, restart/retry/cancel and both physical export modes.
- `bash tests/integration/blog-writing-packs/run-blog-writing-pack-gate.sh assembler`
  and the same command with `store` — PASS (existing v1 contracts).
- `npx tsc --noEmit` — PASS.
- `npx eslint src/shared/data-package.ts src/shared/application-info.ts src/main/app/desktop-multisource-controller.ts src/DesktopMultiSourceView.tsx --max-warnings 0` — PASS.
- `npx eslint tests/integration/export/general-raw-evidence-export.integration.cjs tests/integration/app/desktop-ui-smoke.integration.cjs --no-ignore --env node,es2021 --rule '@typescript-eslint/no-require-imports: off' --max-warnings 0` — PASS.
- `git diff --check` — PASS.

Scoped independent code review found no blocking issue. No live provider request,
business export, release/package test, commit or push was performed. Packaged
Electron startup, real packaged IPC/filesystem interactions and live-provider
acceptance remain separate unverified boundaries. Existing unrelated readiness
changes, raw-export implementation, private reports and root checkout are preserved.
