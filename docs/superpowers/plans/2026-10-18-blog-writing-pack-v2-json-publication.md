# Blog v2 JSON-only publication implementation plan

Authority: the user's explicit approval on 2026-10-18 of schema 2.0 JSON-only
publication and independent publication-time evaluation of all time requirements.
Preserve all WIP/reports; no live calls, business exports, migrations, commit/push.

## Design and inspected boundaries

Existing v1 store publishes single-Run packages with a required workbook; v2
membership is immutable and readiness is read-only. Extend the existing store with
version-specific JSON methods; do not change v1 serialization or readers. Add a
v2 publisher and shared v2 publication types. Reuse existing native hash checks,
draft parser, provider inspectors and staging/exclusive-create/rename mechanics.

The caller supplies a draft and distinct output package ID, never replacement
membership. Stage verified raw/required metadata bytes, then sample the collector
clock for package creation and call the actual readiness evaluator in PUBLICATION
mode. No injectable approval or cached verdict in the public publisher. Revalidate
identities and staged hashes before commit. Output contains schema_version 2.0,
recipe v2, complete membership, per-member normalized/derived evidence, explicit
transformation provenance, file hash/size references and a versioned readiness
snapshot. Publication status JSON_ONLY_PUBLISHED; delivery INCOMPLETE. Manifest
never hashes itself. Strict readback checks the complete file set before rename.

Current source/coverage gaps make a full real policy pass unavailable. Positive
store tests use an explicitly synthetic complete assessment; real evaluator
integration must retain all blockers. No source extension or policy bypass is
authorized merely to create a positive test. GSC finality and any unsupported
calendar context remain explicit publication blockers.

## Steps / files

- [x] RED: new publication test/runner for schema/provenance, multi-Run members,
  non-overwrite, corrupt/unsafe files, cleanup/failures, real mandatory blockers,
  publication clock and SERP/GA4/Ads/monthly time boundaries; preserve v1.
- [x] GREEN: shared blog-writing-pack-v2-publication.ts; version-specific publisher
  and format validator; additive store methods; loader metadata-byte access.
  Existing field helper/source-owned derivation labels separate representations.
- [x] Add PUBLICATION evaluation phase without changing draft defaults. GA4 uses
  publication property-calendar reference; Ads uses observed customer timezone;
  Planner checks real monthly observations and blocks unknown calendar context;
  GSC finality remains blocked rather than inferred from request dates/lag.
- [x] Update DATA_CONTRACTS.md with approved output plus exact implemented encoding.
  Run focused publication, readiness/provenance, source, v1 store, TS/lint/diff gates;
  inspect results, independent review, preserve unrelated diffs and update handoff.

Success claims distinguish atomic JSON storage/publication mechanics, actual
source-policy acceptance, Excel/Electron and live-provider acceptance. No complete
Blog v2 delivery claim is permitted.

## Execution evidence (2026-10-18)

Observed RED before implementation: seven publication cases failed on missing v2
store/publisher, missing representations and GA4 still using draft time. Additional
RED cases caught account/timezone binding, extra empty directories, optional Trends
serialization and optional membership failures wrongly allowed by format validation.
All are fixed without changing provider acquisition or v1 behavior.

Final checks under Node 24.19.0:

- `run-blog-v2-publication-test.sh`: 16/16. Positive tests exercise synthetic
  complete storage, seven independent Runs, exact raw and bound metadata copies,
  hash/size readback, frozen provenance and status/schema separation. Failures
  cover mandatory/optional identity blockers, corruption, non-overwrite/concurrency,
  staging cleanup, unsafe/symlink/extra files and directories. Real publisher tests
  retain actual policy blockers, sample the clock after staging, independently
  check seven-day/+one-second SERP age and never select a newer unselected Run.
- Existing Blog v2 gates: selection 7/7, draft 8/8, readiness 10/10, field 13/13,
  SERP 33/33, GA4 29/29, Planner 14/14, İkas 13/13, Sitemap 12/12 (139/139 total).
- `run-production-data-package-loader-test.sh`, `run-google-api-adapters-test.sh`,
  `run-google-ads-keyword-search-term-reporting-test.sh` and
  `run-blog-writing-pack-gate.sh store`: PASS.
- `npx tsc --noEmit`: PASS. Targeted TS/CJS ESLint: zero errors/warnings (CJS
  follows existing require style). `/bin/bash -n` on new runner: PASS.
- `git diff --check` and six new-file whitespace checks: PASS. Focused canonical
  review reconciled the obsolete absent-publisher statements and distinguishes
  default draft clocks from independent PUBLICATION evaluation.
- Independent read-only review identified the Trends and optional-identity gaps;
  follow-up review found no remaining confirmed correctness issue in scope.

Publication clock checks cover Ads/GA4 year and UTC/timezone boundaries, stale
windows, Planner real/null/missing/duplicate monthly history, missing/conflicting
account evidence and native metadata/raw integrity failures. Existing SERP gates
also cover six days, exactly seven days, future/invalid/missing UTC receipts and
UTC midnight. No result establishes a full real-evaluator success: current GSC
finality, Planner calendar/currency/keyword coverage and other mandatory family
capability/coverage blockers remain. No live calls, business exports, migrations,
commit or push; prior WIP and private reports remain untouched.

## Files changed in this task (21)

Canonical routing/contract and this execution record:
`DATA_CONTRACTS.md`, `PROJECT_HANDOFF.md`,
`docs/superpowers/plans/2026-10-18-blog-writing-pack-v2-json-publication.md`.

Package/store boundaries under `src/main/blog-writing-packs/`:
`blog-writing-pack-store.ts`, `blog-writing-pack-v2-field-compliance.ts`,
`blog-writing-pack-v2-readiness.ts`, `blog-writing-pack-v2-publication-format.ts`,
`blog-writing-pack-v2-publisher.ts`.

Verified byte access: `src/main/export/production-data-package-loader.ts`.

Source-owned inspection/derivation metadata under `src/main/sources/`:
`google-ads/search-terms-adapter.ts`,
`google-ads/keyword-planner-field-inspector.ts`,
`google-analytics-4/google-analytics-4-field-inspector.ts`,
`google-search-console/query-page-adapter.ts`,
`ikas/ikas-products-field-inspector.ts`, `serpapi/serpapi-field-inspector.ts`.
Acquisition behavior is unchanged.

Shared types under `src/shared/`: `blog-writing-pack-v2-publication.ts`,
`blog-writing-pack-v2-readiness.ts`, `serpapi.ts`.

Deterministic tests under `tests/integration/blog-writing-packs/`:
`blog-v2-publication.integration.cjs`, `run-blog-v2-publication-test.sh`,
`blog-v2-readiness-fixture.cjs`.
