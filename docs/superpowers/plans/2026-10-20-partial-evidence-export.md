# Approved partial evidence export

## Goal and approved contract

Implement the user's approved partial general Data Package export decision from
`/Users/furkan/.codex/attachments/089d327f-8533-408e-a11e-be2e176faa1f/Pasted text.txt`.
Stable RETRY_REQUIRED Runs with accepted, validated evidence may export without
changing collection state. Active acquisition, missing provenance, corruption,
unsafe paths and overwrite remain blocked. This approved contract needs no renewed
product/architecture approval. Execute inline with focused deterministic TDD.

## Inspected evidence and design

HEAD a1015a4, existing 11 tracked WIP files, explicit-scope plan and private reports
are preserved. Controller, loader and renderer currently require terminal Runs.
The real GT01 audit identifies rr_20260820T155929999Z_fc40cf; its original CSV's
2691-byte size and 0e1a57f12fb5473854d35cee6a1227fb4f52a06d0127bbf2e95aa1fb88834787
SHA-256 were independently rechecked read-only. No production writes/acquisition.

Use a small source-neutral eligibility predicate shared by controller and loader.
Require idle execution and settled Jobs/Attempts for partial export. The loader
captures and clones Run/Job/Attempt/Artifact/Validation records before asynchronous
file reads and compares them afterward. Controller blocks same-Run mutations while
exporting, builds from the captured snapshot and checks state again before writing.
Existing raw writer preserves verified in-memory bytes with atomic publication.
Partial destinations use an evidence snapshot digest under exports/partial; repeat
snapshots refuse overwrite and later histories get distinct destinations. Terminal
destinations stay unchanged. Manifest/index expose INCOMPLETE and snapshot identity;
all Job/Attempt outcomes remain present in RAW_EVIDENCE in both modes.

## Affected interfaces and files

- Core: `src/main/core/run-export-eligibility.ts`, settled evidence predicate.
- Loader: `src/main/export/production-data-package-loader.ts`, captured export snapshot.
- Controller: `src/main/app/desktop-multisource-controller.ts`, active/mutation guards,
  frozen package construction and deterministic partial destination.
- Contracts/writer: `src/shared/data-package.ts`, `src/shared/desktop-multisource.ts`,
  `src/main/export/data-package-exporter.ts`, additive completeness/snapshot metadata.
- Renderer: `src/DesktopMultiSourceView.tsx`, privileged can_export and partial label.
- Tests: existing general-raw fixture/suite, desktop retry/export and renderer smoke.
- Canonical rule: `DATA_CONTRACTS.md`; verified checkpoint only in PROJECT_HANDOFF.
- Real acceptance: new private isolated QA records copied exactly from target history,
  original file inspection/read-only copy, production loader/controller/raw writer.

## Steps and checks

- [x] RED: stable partial export in both modes, actual histories, incomplete metadata,
  repeated/later snapshots, active/no-evidence rejection and mutation/changed-state guards.
- [x] GREEN: minimum implementation through existing paths; preserve raw safety tests.
- [x] Renderer RED/GREEN: partial controls only with privileged stable eligibility.
- [x] Run focused general raw, loader, exporter, retry/export and renderer regressions;
  TypeScript, scoped lint and diff check. No broad gates or live providers.
- [x] Isolated real GT01 export in both modes; independently compare original/export
  bytes/hash, five Jobs, two GT01 Attempts, completeness, redaction and immutability.
- [x] If claiming packaged UI, preserve existing packages/receipts and use existing
  isolated packaged QA flow with a separately built package; otherwise label limits.
- [x] Review final diff, record exact results and final Git state. No commit/push.

## Acceptance

Stable partial evidence is deliverable and INCOMPLETE; active/retry execution,
unaccepted/tampered/provenance-invalid evidence, changing snapshots and overwrites
fail closed. Failed Jobs get no files/rows. Published snapshots never change after
a later retry. Terminal exports retain their existing destinations and mode behavior.
Production records, source artifacts, prior WIP and private reports remain untouched.

## Verified outcome

- RED: general raw suite 10/13 passed; stable RETRY_REQUIRED hit the old terminal
  rejection and same-Run mutation exclusion was absent. Renderer RED showed no
  partial export controls. Both became GREEN (13/13 plus full renderer smoke).
- Independent review found the expanded UI wrapper also exposed terminal-only
  Blog Build. A new assertion failed (1 button versus 0); terminal guarding fixed
  it and full renderer smoke passed. No other blocking review finding.
- Loader, writer/Keyword Planner companions and desktop retry/export regressions
  passed. Final TypeScript, scoped TypeScript/CommonJS lint and diff check passed.
- Existing QA isolation suite passed 5/5. A private copy of the project and cloned
  dependencies was built with unchanged Forge/ad-hoc signing. Original out/.vite
  files and receipts were preserved; the sandboxed first package attempt lacked
  GitHub DNS, and the authorized build outside that restriction succeeded.
- Local compiled acceptance copied exact target historical records into disposable
  schema-8 SQLite and read-only native files. Both modes delivered only GT01;
  2691 bytes and its original SHA-256 match. Run remains RETRY_REQUIRED; package
  INCOMPLETE, five Jobs/four failures, GT01 Attempts 1 and 2 retained. No providers.
- Separate guarded packaged acceptance used the same historical records and actual
  renderer/IPC/writer. Both buttons exported exact CSV, showed incomplete counts
  and destination, and refused repeat exports. Normalized values preserve all
  525 observations and 205 zeros. The current production app was not replaced.
- Independent Python reopening verified all four exports, the production and both
  QA record sets, four historical files and 277 original generated/package files.
  Details and exact paths: reports/qa/partial-evidence-export-2026-10-20.md.
- Private evidence root: /private/tmp/roofroom-partial-export-zhqpyu2f.
  No production write, acquisition, retry/resume, commit, push or old-report edit.
