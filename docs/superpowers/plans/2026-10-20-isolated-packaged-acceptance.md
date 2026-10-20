# Isolated packaged Electron acceptance

User contract: Safe Isolated Packaged Electron Acceptance. Baseline HEAD
16e7487, branch feat/google-analytics-4-source-v1; 15 modified tracked and six
untracked files precede this task. Preserve all WIP and private reports; never
access the separate checkout or real RoofRoom state. Existing ad-hoc signing is
explicitly authorized. No providers, OAuth, release gates, make/publish or Git index/commit writes.

## Bounded design

The current startup creates application directories and opens SQLite using default
Electron userData. Add an explicit QA-only marker/token contract for a private,
canonical disposable root directly under the system temporary directory. The
launcher creates it, validates the expected packaged executable and invokes that
executable directly with the environment intact. No arbitrary production path
override, HOME replacement, normal-launch fallback or existing-state deletion.

An early side-effect import precedes other main-process application imports. It
requires a packaged executable, validates ownership/permissions/marker/root and
rejects symlinks/conflicting flags before assigning Electron appData, userData,
sessionData, logs, crashes, temp and downloads. Chromium cache is explicitly inside
the root. Existing database/credentials/browser profiles/exports then derive from
isolated userData. Diagnostics contain effective paths only. Ordinary launches
perform no QA filesystem/path work. QA renderer requests to external sites are
blocked; no collection is initiated in the packaged application.

## Scope and sequence

- [x] RED/GREEN safety tests exercising the actual compiled entrypoint's early
  import, real QA hook and directory resolver, including failure before bootstrap.
- [x] Small startup hook/helper and Node launcher; leave Forge/signing/IPC unchanged.
- [x] Focused startup/file-access/security regressions, TypeScript, lint and diff.
- [x] Only after safety passes, check fresh package output, preserve existing .vite
  generated files, run existing npm package command and launch the exact executable.
- [x] Verify real renderer IPC and isolated database; attempt existing synthetic
  native evidence fixture + real UI export if runtime automation is available.
- [x] Record exact evidence and remaining boundaries; update handoff from results.

Expected touched boundaries: src/main.ts early import, new QA isolation/startup
helpers, a narrow scripts/qa launcher, focused tests/runner, this plan and current
handoff. Reuse existing raw-evidence fixtures only if packaged launch succeeds.

Acceptance is separate for implementation, deterministic safety, packaged runtime,
packaged export and live providers. A failed runtime probe is not a passing export.

## Verified outcome

Implemented and deterministically verified isolation; packaged runtime and synthetic
raw export verified. No live-provider or production/release acceptance. Fixture
acquisition/validation runs in compiled Node code using existing mocked transport
and native validators, not in the packaged provider runtime. The packaged app
reads that real accepted SQLite state and exports through actual renderer buttons
and trusted main IPC. No bridge/IPC/export-success mocks are installed in the app.

Final QA root:
`<QA_ROOT>`.
`packaged-acceptance.json` records application identity, bootstrap, exact destinations,
files/hashes and overwrite refusal. `qa-paths.json`, `qa-launch.json`, `runtime.log`,
`packaged-progress.json` and `packaged-export.png` retain diagnostics. Tokens stay
only in the private marker. Root is retained for review, not silently deleted.
An independent post-run audit (`independent-raw-audit.json`) reopened only this
isolated SQLite database read-only and rechecked all eight raw copies, accepted
Job/Artifact/Attempt/Validation associations, bytes, sizes and hashes after the
overwrite attempts: PASS. Original `.vite` files were restored byte-for-byte;
the QA-generated build was retained separately outside the repository.

Application: RoofRoom Data Collector 1.0.0, Electron 43.4.0, darwin arm64.
Renderer loaded from the actual `.app/Contents/Resources/app.asar` file URL.
Real getApplicationInfo/getBootstrapStatus/getDesktopWorkspaces/getDesktopRunState
IPC succeeded. SQLite schema 8, READY, quick_check ok; all bootstrap directories
are inside the QA root. Synthetic credential connections were removed before launch;
no real credential file or source collection was used in the packaged app.

### Exact local packaging and reviewed build

`npm run package -- --platform=darwin --arch=arm64` exited 0. Existing `out/` was
absent, and pre-existing `.vite` was backed up before the build. No Forge config
change. Output:
`out/RoofRoom Data Collector-darwin-arm64/RoofRoom Data Collector.app`.
`codesign --verify --deep --strict 'out/RoofRoom Data Collector-darwin-arm64/RoofRoom Data Collector.app'`
exited 0 with the existing certificate-free ad-hoc signature.

Actual `app.asar/.vite/build/main.js` was byte-equal to the inspected build;
SHA-256 `5e4cf5800010ffc248e18946f4cacc874b2c81e1fd0f245bd00a6016038f3cb2`.
Its isolation call is at byte offset 3483, before bootstrap at offset 860475.
After this independent inspection, a private build receipt was recorded alongside
the `.app`; the launcher never creates/refreshes that receipt. Pinned executable
SHA-256 `cee4faf6db00cb26c7d1e9a296581888ae6330bd76cbfb0f557c3fd7b0aa9ce5`;
`app.asar` SHA-256 `a40faefc83c0ab8320561add1d495cd9ab16da4e2048f71fadce3a06d966826f`.
Missing receipt, changed archive or changed executable reject before spawn.

### Packaged export results

| Run | Mode | Actual raw / normalized | Outcome |
| --- | --- | --- | --- |
| rr_20261019T233904680Z_b133e7 | ALL | 3 / 3 | One FAILED Job, one unavailable raw file; collection incomplete |
| rr_20261019T233904680Z_b133e7 | SUCCESSFUL_ONLY | 3 / 3 | Same whole-Run failure/unavailable counts; collection incomplete |
| rr_20261019T233904715Z_9080a0 | ALL | 1 / 1 | Accepted NO_DATA; collection completed with warnings |
| rr_20261019T233904723Z_5ef1a2 | ALL | 1 / 1 | Accepted LOW_DATA; collection completed with warnings |

Each destination is `<QA root>/user-data/app-data/data/runs/<run>/exports/<mode>`;
the UI displayed that exact path. Eight raw file copies across four exports match
five accepted original artifacts. Native filename/media type, size, SHA-256,
Workspace/Run/Source/Job/Attempt/Artifact/Validation identity, acquisition time and
persisted metadata checksum were asserted. Existing raw files and Attempt evidence
were not regenerated. All four repeat exports were refused with the real UI error
`Data Package export exists; refusing overwrite.` and unchanged raw indexes.
No Blog readiness evaluator or analytical field requirement gates this export.

| Raw file | Bytes | SHA-256 |
| --- | ---: | --- |
| gsc-query.json | 194 | fa09b49f6129c2d34d52ff90ffe87c1e6201a2452e451cc8639aa97077d7d8ee |
| ikas-products.xlsx | 605 | 1521fa6319bd8d5b34c417d73029c0e00c2fae54660ffd3bb9ad56530dc90beb |
| bitkimark-sitemap-812437a5e621.xml (VALID) | 177 | cdf17293261a509c8e7dcb180513a4ef87493cd909377cbcd7c7ce9518c3d910 |
| bitkimark-sitemap-812437a5e621.xml (NO_DATA, separate Run) | 61 | 035ada9515dd09b4656fa951d9f2849c407ff159aeeb1829c8cfa7cc53df27d6 |
| GT01_TR_24M_interest_over_time.csv (LOW_DATA) | 2370 | ef2363a95477fec7c5d1fe3c7aeea29223a90e20a693dc192104180ddd0238d9 |

The existing workbook fixture timestamps its ZIP; its checksum varies between
preparations. Input/persisted/exported equality is verified within each preparation.

### Focused verification

- `bash tests/integration/app/run-packaged-qa-isolation-test.sh`: 5/5 PASS, including
  actual compiled startup ordering, normal resolution, 20 invalid QA configurations,
  native directory containment and missing/stale build receipt before-spawn checks.
  RED first failed for the missing hook; additional expected-path and stale-build
  tests failed before their corrections and passed afterward.
- `bash tests/integration/export/run-general-raw-evidence-export-test.sh`: 10/10 PASS
  after extracting the same native fixture generator for manual acceptance reuse.
- `bash tests/integration/app/run-packaged-raw-export-acceptance.sh`: exit 0 with the
  final receipt-enforcing launcher; all four real packaged export cases passed.
- `bash tests/integration/app/run-application-file-access-test.sh`: PASS.
- `bash tests/integration/filesystem/run-filesystem-gate.sh boundary`: PASS.
- `bash tests/integration/app/run-desktop-connection-main-ipc-test.sh`: PASS.
- `bash tests/integration/google-trends/run-runtime-packaging-config-test.sh`: PASS.
- `npx tsc --noEmit`: PASS. New isolation/startup modules also pass standalone strict
  TypeScript via `npx tsc src/main/app/packaged-qa-isolation.ts src/main/app/packaged-qa-startup.ts --noEmit --strict --esModuleInterop --module commonjs --target ES2022 --skipLibCheck`;
  the entrypoint runner follows the repository's noImplicitAny settings.
- Targeted TypeScript and all touched CommonJS ESLint: PASS with max-warnings 0.
  CommonJS uses `--no-ignore --env node,es2021 --rule '@typescript-eslint/no-require-imports: off'`.
- `bash -n` for the three new shell runners and `git diff --check`: PASS.

### Reproduced QA corrections and limits

Forge's actual output uses productName; corrected the launcher's expected directory
after RED/GREEN. The first manual harness used a preload polling/navigation sequence
that timed out and left a macOS QA child alive during cleanup. Added load/polling
diagnostics, bounded own-child SIGTERM/SIGKILL cleanup, and the existing Back to Run
History action; final reruns pass. No product UI/source correction was required.
Review found no blocker and prompted the fail-closed digest receipt safeguard.

No general-export-specific open/reveal action exists in the current result UI;
that interaction is NOT VERIFIED. Real provider acquisition, OS credential/OAuth
flows, Developer ID/notarization/distribution and production acceptance remain
unverified. Default-session network blocking is additional QA protection, not a
Node/Playwright network sandbox; the harness never starts packaged collection.

### Task file changes

- `src/main.ts` — first QA startup import, preserving prior raw-export wiring.
- `src/main/app/packaged-qa-isolation.ts` — private-root validation and early path assignment.
- `src/main/app/packaged-qa-startup.ts` — fail-closed hook and default-session network guard.
- `scripts/qa/launch-packaged-qa.cjs` — exact executable, digest receipt, private root and direct launch.
- `scripts/qa/run-packaged-qa.sh` — narrow local launcher entry point.
- `tests/integration/app/packaged-qa-isolation.integration.cjs` — deterministic safety assertions.
- `tests/integration/app/run-packaged-qa-isolation-test.sh` — actual entrypoint compilation/test runner.
- `tests/integration/app/packaged-raw-export.acceptance.cjs` — explicit real packaged UI/IPC acceptance.
- `tests/integration/app/run-packaged-raw-export-acceptance.sh` — manual acceptance runner.
- `tests/integration/export/general-raw-evidence-fixture.cjs` — extracted existing native fixture, with optional QA root/workspace reuse.
- `tests/integration/export/general-raw-evidence-export.integration.cjs` — uses that same extracted fixture; all ten cases retained.
- `TEST_STRATEGY.md` — stable manual QA isolation/receipt/claim boundaries.
- `PROJECT_HANDOFF.md` — current verified state and remaining boundaries.
- This plan — scoped design and acceptance evidence.
