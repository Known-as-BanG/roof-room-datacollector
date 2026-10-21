# Google Trends Explicit Scope Implementation Plan

> For agentic workers: use superpowers:executing-plans for the inline implementation; user authorizes implementation, packaging and one exact-scope live Run.

**Goal:** Let the existing Trends task select trusted groups and explicit dates before Review, then execute only the frozen approved scope.
**Architecture:** Extend the existing Trends branch of DesktopMultiSourceController and existing task UI. Core, CSV validation, credentials and export infrastructure stay unchanged. Omitted group selection and date mode retain legacy all-groups rolling24M semantics.
**Tech stack:** Existing TypeScript/React, controller integration tests, renderer smoke, Forge and guarded packaged QA.
**Spec:** User task pasted at /Users/furkan/.codex/attachments/4e57a8c7-fb7f-4842-ba54-1d151c639148/Pasted text.txt.

## Constraints and review focus

- Preserve the seven previous modified files and two private QA reports; no commits/pushes or historical evidence changes.
- Select IDs only; resolve names/terms from trusted configuration, never renderer query text.
- Reject empty/unknown/duplicate IDs, bad dates/modes and contradictory explicit/rolling inputs before reservation.
- Freeze selected groups and dates through Review/Start, including clock drift and altered reviewed artifacts.
- Keep omitted-input rolling/multi-group compatibility; no generic configuration system.

## Task 1 — Source-specific resolution and tests

Files: src/main/app/desktop-multisource-controller.ts; tests/integration/app/desktop-multisource-flow.integration.cjs.
Interface: Trends source configuration accepts optional query_group_ids:string[], date_mode:EXPLICIT with requested_date_start/end; absence retains the existing date_policy. Resolve trusted groups and exact dates into existing reviewed/reserved snapshots.
- [x] Add failing tests for GT01-only explicit2024-08-20–2026-08-19, no clock drift/re-expansion, and invalid/forged scope before reservation.
- [x] Run existing controller flow entrypoint and observe RED.
- [x] Implement minimal Trends resolution and reviewed-scope consistency checks; preserve source-neutral Core.
- [x] Run controller flow and observe GREEN, including existing default rolling and multi-group cases.

## Task 2 — Existing task controls and renderer tests

Files: src/DesktopMultiSourceView.tsx; tests/integration/app/desktop-ui-smoke.integration.cjs.
Interface: bootstrap.query_config supplies configured groups; checkboxes send IDs only. Default rolling policy remains; explicit date mode sends exact dates. Review displays frozen IDs, trusted terms and window.
- [x] Add renderer assertions for group controls, no-selection gate, explicit mode/dates, exact outgoing source configuration and reviewed terms.
- [x] Observe RED, implement controls/review display, then GREEN.
- [x] Run TypeScript, relevant lint and diff checks. Independent focused review.

## Task 3 — Corrected package and authorized acceptance

- [x] Preserve current out/.vite/receipt and QA evidence; build/sign through unchanged Forge configuration.
- [x] Inspect ASAR/current runtime changes and early isolation; verify hashes/signature and fresh receipt.
- [x] Desktop worker launches fresh guarded QA, configures GT01 and exact approved dates through UI; parent independently verifies Review and zero pre-start records.
- [x] Only exact Review permits the one authorized Run. No retries/refreshes/other providers; stop on provider challenge/block.
- [x] Preserve actual terminal outcome, original/raw/export bytes and source provenance where available; independently audit. Attempt normal Quit after writes end.
- [x] Record actual statuses/limits and final Git state. No live PASS without real evidence; no commit/push.

**Actual bounded outcome:** exact packaged Review and frozen persisted scope verified; one Run/Job/Attempt ended RATE_LIMITED. No retry, CSV, Artifact, Validation or export. Normal Quit exited0. Live-provider CSV/export acceptance remains blocked. Evidence: /private/tmp/roofroom-trends-scope-ei7xyqrj/acceptance-report.md.
