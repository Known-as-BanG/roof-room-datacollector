# Blog v2 Slice 3B.2B.4 — SERP snapshot field compliance

## Capture date and draft-time freshness follow-up (2026-10-17)

Authority: the user's SERP Capture Date & Draft-Time Freshness Compliance task.
Verified collector receipt provenance now exists; reuse it after the accepted
loader and immutable membership checks. The approved maximum age from actual UTC
receipt is inclusive: 0 <= evaluated_at - response_received_at <= 604800000 ms.
There is no calendar-date rounding, timezone adjustment or tolerance.

Design: the existing SERP inspector derives UTC capture_date from the verified
full receipt instant, with explicit derived provenance. It returns a read-only
freshness check and deterministic issues. The Blog helper/evaluator forwards the
revalidated acquisition and uses draft.created_at unless an explicit evaluated_at
is supplied for draft reevaluation. GA4 retains its existing draft-time reference.
Capture-date fields report derived counts, not provider-observed counts. Remove
only obsolete capture/freshness decision blockers; retain other scope decisions.
Membership, raw evidence, source acceptance and v1 publication are unchanged.
The future v2 publisher must check freshness independently at actual publication.

- [x] RED: fixed-clock boundaries (six days, seven inclusive, plus one second,
  future, zero age), UTC midnight derivation, missing/malformed/unverifiable and
  legacy evidence, invalid references, reevaluation becoming stale, metadata drift
  and immutable membership/newer Run safeguards in the existing SERP suite.
- [x] GREEN: change only SERP inspector/shared types, existing Blog field helper,
  evaluator/shared readiness types/defaults and directly affected test fixtures.
  No publisher, acquisition changes, general Core work or other provider changes.
- [x] Verify SERP, accepted loading, draft/readiness/GA4 and relevant regressions,
  TypeScript, targeted lint and diff check; update owning contracts and handoff.

Observed RED: original 21 SERP tests passed and all 11 initial new policy tests
failed before implementation. Policy implementation passed those new cases;
six old assertions describing superseded decision messages were updated to the
actual missing-acquisition blocker. A further full-UTC-reference precision test
failed (32/33) before accepting complete Z references at seconds or 1–3 fractional
digits; incomplete references remain invalid and no acquisition time is changed.

Verified using Node 24.19.0:

| Check | Result |
| --- | --- |
| blog-writing-packs/run-blog-v2-serp-compliance-test.sh | 33/33 PASS |
| blog-writing-packs/run-blog-v2-readiness-test.sh | 10/10 PASS |
| blog-writing-packs/run-blog-v2-draft-test.sh | 8/8 PASS |
| blog-writing-packs/run-blog-v2-selection-test.sh | 7/7 PASS |
| blog-writing-packs/run-blog-v2-field-compliance-test.sh | 13/13 PASS |
| blog-writing-packs/run-blog-v2-ga4-compliance-test.sh | 29/29 PASS |
| serpapi/run-serpapi-source-test.sh | SERPAPI-001 and SERPAPI-ACQUISITION-001 PASS |
| serpapi/run-serpapi-reviewed-on-demand-test.sh | 1/1 PASS |
| export/run-production-data-package-loader-test.sh | PRODUCTION-DATA-PACKAGE-001 PASS |
| npx tsc --noEmit | PASS |
| Targeted ESLint on the five changed TS files and three CJS files (existing CommonJS imports allowed) | PASS |
| git diff --check | PASS |

Independent read-only review found no important code issues. The implemented
enforcement boundary is invocation of evaluateBlogWritingPackV2Readiness;
current callers are integration tests, with no automatic assembly/UI flow.
Assembly still persists membership only, never a cached readiness pass. Explicit
later references recompute age against unchanged verified receipt provenance.
No unresolved capture/age-boundary meaning remains in this slice; existing other
SERP coverage/scope decisions are retained. Real v2 publication must independently
check its current timestamp; these tests establish no package-time enforcement,
live-provider acceptance or complete Blog v2 delivery. All earlier WIP and private
reports are preserved; no live calls, production Runs, migrations, real exports,
commits or pushes were performed.

## Response acquisition timestamp follow-up (2026-10-17)

Authority: the user's SERP Response Acquisition Timestamp & Provenance task.
Reuse existing acquisition_metadata, immutable attempt-scoped metadata files and
accepted-artifact loading. No freshness policy, v2 publication, migration or live
provider calls. Preserve all preceding WIP and reports.

Design: add an optional receipt notification to the existing HTTP requester, after
the complete response bytes arrive and before decoding/parsing. The SERP client
records its controlled-clock UTC instant only on that notification; a requester
without receipt evidence cannot manufacture it at promise resolution. The source
passes explicit collector-origin metadata through the unchanged orchestrator.
The accepted loader validates the selected SERP sidecar's raw/Job/Attempt binding
and returns its timestamp plus file path/hash/size. Blog v2 freezes that optional
provenance separately from legacy acquired_at and revalidates it. Missing legacy
metadata stays unknown; malformed new metadata fails rather than being repaired.

- [x] RED: source tests for bytes-received-before-parsing capture, no timestamp
  fallback, distinct acquisitions; real synthetic runtime persistence/loading,
  independent attempt files, legacy compatibility and frozen provenance checks.
- [x] GREEN: minimal edits to api-helpers, SERP client/source/parser/shared types,
  existing storage filename helper, accepted loader and v2 selection/draft checks.
  No normalized capture_date is produced in this task.
- [x] Verify focused source/runtime, accepted loader and affected v2 regressions,
  TypeScript, targeted lint and diff check. Update canonical contracts/handoff
  with results and remaining draft/package-time freshness prerequisites.

Observed RED: the controlled-clock source assertion received undefined metadata;
the Blog SERP suite failed the new accepted-loading assertion and invalid-metadata
rejection assertion (18 pass / 2 fail). The minimal implementation made these
green. Additional checks cover malformed frozen provenance, metadata changes
between the two readiness reads, native overwrite refusal and a rejected first
Attempt followed by a distinct successful retry through production orchestration.

Verified with Node 24.19.0:

| Check | Result |
| --- | --- |
| serpapi/run-serpapi-source-test.sh | SERPAPI-001 and SERPAPI-ACQUISITION-001 PASS |
| serpapi/run-serpapi-reviewed-on-demand-test.sh | 1/1 PASS, including real synthetic retry/persistence/loading/draft reload |
| blog-writing-packs/run-blog-v2-serp-compliance-test.sh | 21/21 PASS |
| blog-writing-packs/run-blog-v2-selection-test.sh | 7/7 PASS |
| blog-writing-packs/run-blog-v2-draft-test.sh | 8/8 PASS |
| blog-writing-packs/run-blog-v2-readiness-test.sh | 10/10 PASS |
| blog-writing-packs/run-blog-v2-field-compliance-test.sh | 13/13 PASS |
| blog-writing-packs/run-blog-v2-ga4-compliance-test.sh | 29/29 PASS |
| export/run-production-data-package-loader-test.sh | PRODUCTION-DATA-PACKAGE-001 PASS |
| google-api/run-google-api-adapters-test.sh | GOOGLE-API-001 PASS |
| npx tsc --noEmit | PASS |
| Targeted ESLint on changed TS and CJS (existing CommonJS imports allowed) | PASS |
| bash -n changed runtime test runner; git diff --check | PASS |

Independent read-only review found no important issues. The loader validates
sidecar bindings; the v2 resolver separately authenticates its Attempt ID against
the accepted repository Attempt. Native metadata hash/size freezes the snapshot
on selection, not a provider attestation or new database metadata Artifact.
No provider rows/capture_date mapping, freshness age policy, publisher, Core
lifecycle, database schema or other provider module behavior changed. Legacy
receipt evidence remains absent, not reconstructed from acquired_at/created_at.
Prior WIP and reports are preserved; no live calls, production Runs, exports,
migrations, commits or pushes were performed.

## 2026-10-17 freshness verification follow-up

Authority: the approved user requirement now defines actual response-acquisition
UTC time and a maximum age of seven days at package creation; frozen draft
membership must not change. The original slice below records earlier assumptions.

Inspected evidence: the SERP client/source preserves provider bytes but records no
RoofRoom response-acquisition timestamp. Frozen `acquired_at` comes from artifact
`created_at`, not that missing observation. Draft assembly saves membership with
NOT_EVALUATED; readiness has no SERP reference-time input or age comparison.
The publisher/store only supports the v1 delivery manifest, not v2 publication.

- [x] Add focused characterization checks to the existing SERP suite: artifact
  ages at six days, seven days, seven days plus one second, future and UTC date
  crossings cannot establish response age; provider timestamps cannot substitute;
  repeated evaluation at controlled times preserves bytes, identities and membership.
- [x] Run SERP compliance, readiness, draft, GA4 compliance and existing SERP source
  regressions, TypeScript and diff check. Preserve all prior WIP and private reports.
- [x] Correct the owning contract's timestamp provenance wording and record the
  source/publishing blockers in the current handoff from actual results.

Observed result: blocked; the requested freshness acceptance remains unmet.
No production fix is included. A reliable end-to-end fix requires actual response
time in accepted, verifiable provenance and enforcement in real v2 publication;
neither boundary currently exists. The existing acquisition_metadata capability
can persist a source timestamp, but the accepted-artifact loader does not expose
verified sidecar provenance for frozen membership. An unused age calculator or
reinterpretation of artifact time would not satisfy the requirement. The requested
fresh/expired assertions and draft-to-package expiry remain pending;
characterization checks cannot stand in for those missing acceptance tests.

Verified result: no production code changed. SERP compliance/characterization
17/17, readiness 10/10, draft 8/8, GA4 compliance 29/29, SERPAPI-001 and reviewed
on-demand source 1/1 passed with Node 24.19.0. `npx tsc --noEmit`, CJS syntax
check, scoped CJS lint (existing CommonJS import style allowed), and
`git diff --check` passed. Direct CJS lint first reported the eight pre-existing
require-import style violations; no lint configuration was changed. The first
reviewed-source invocation used Node 22 without node:sqlite; the isolated rerun
with Node 24 passed. These are synthetic regressions and missing-boundary
characterization, not actual UTC acquisition, age-policy or publication acceptance.
The approved policy is retained; missing implementation, rather than a new product
decision, blocks delivery. Existing stale runtime semantic-decision messages are
also retained and must be reconciled when those boundaries are implemented.
Independent read-only review confirmed these findings and found no critical or
important defects in the bounded documentation/test change.

## Original completed slice

Authority: the user's focused implementation request. Baseline abb8be3;
preserve reports and all accepted evidence; no commits, pushes or live requests.

## Inspected contract and seam

The existing SerpApi parser verifies provider search_parameters against the locked
request: query, TR/tr, desktop, google and start=0. It normalizes at most ten organic
results and separate PAA rows. Organic position is provider-supplied, never an
absolute SERP rank. Domain is the existing lower-case hostname derivation from
observed HTTP(S) link. Query is a request dimension verified against provider q.
snapshot_date is requested context, artifact acquired_at is local provenance;
raw provider metadata is preserved but no capture timestamp is normalized.
Blog v2 approves no capture basis, ranking/result scope, query coverage or freshness
policy. Report these as decisions even if callers clear profile decision lists.

## Scope and sequence

- [x] Add synthetic SERP fixtures, a focused runner and failing tests through the
  existing field helper/evaluator. Prove mappings, origins, invalid/empty evidence,
  missing versus null, context mismatch, mixed result types, immutable multi-Job
  provenance and mandatory decision blockers. Observe RED before production edits.
- [x] Add a SerpApi-local inspector reusing the unchanged request validator/parser.
  Retain rows and raw field presence. Expose fixed origin labels in read-only field
  checks; never label requested query or derived domain as independent observations.
  capture_date stays unresolved; no timestamp fallback or new date policy.
- [x] Extend the existing Blog helper/evaluator and its field-check type only.
  Reuse accepted-byte integrity and blocker conventions; explicitly block blank
  required URL/title/domain and unsupported positional meaning for PAA rows.
  Update only affected readiness fixtures/assertions for GA4 remaining unchecked.
- [x] Run new suite GREEN; existing source/reviewed source, all v2 suites, v1 gate,
  accepted loader, TypeScript, lint and diff check. Update canonical contract and
  handoff from observed results, verify report hashes and final Git scope.

## Acceptance

Actual accepted bytes establish supported fields only. Requested/observed query,
timestamps and result categories stay distinct. No rows are merged/deduplicated;
no draft or raw mutation, no invented rankings/titles/domains/timestamps. Coverage
states and EXPLICIT_REQUIREMENTS_ONLY remain, delivery stays NOT_EVALUATED.
No acquisition/parser/validator/Core/UI/other-source/publication changes.

## Verified result

Implemented `inspectSerpApiFields` in the SERP module, integrated through the
existing Blog field helper/evaluator and optional read-only serp_provenance labels.
Shared types add no new requirements input, persisted draft fields or blocker codes.
Accepted bytes are re-parsed, not trusted because a dataset name/type matches.
Supported raw-property presence distinguishes missing fields from parser-produced
nulls. Null/empty/blank required URL/title/domain observations block without fills.
PAA rank/title are not observed fields; paid/other features stay raw only.

All five unresolved decisions (capture_date, position_semantics, search_context,
query_coverage, freshness) remain non-bypassable. The slice does not approve new
capture semantics or expose a policy override. These require separate approval;
new acquisition is needed only if that future contract demands observations the
current source does not support. All provider metadata remains in raw evidence.
Independent rows/Jobs and every selected provenance reference remain intact.

TDD: initial RED was 12 failures / 2 passes across 14 tests. Failures showed missing
SERP inspection, context/field guards and mandatory decisions; integrity/current
profile safeguards already passed. Minimum implementation GREEN: 14/14. Fresh
regression after updating synthetic shared fixtures also passed 14/14. Existing
readiness expectations now distinguish unchecked GA4 from real SERP decisions,
without weakening coverage, immutable membership or other-source checks.

Fresh verification used Node 24.19.0 on PATH. Every script below was invoked as
`bash tests/integration/<path>`:

| Path / command | Result |
| --- | --- |
| blog-writing-packs/run-blog-v2-serp-compliance-test.sh | 14/14 PASS |
| blog-writing-packs/run-blog-v2-readiness-test.sh | 10/10 PASS |
| blog-writing-packs/run-blog-v2-selection-test.sh | 7/7 PASS |
| blog-writing-packs/run-blog-v2-draft-test.sh | 8/8 PASS |
| blog-writing-packs/run-blog-v2-field-compliance-test.sh | 13/13 PASS |
| blog-writing-packs/run-blog-v2-keyword-planner-compliance-test.sh | 14/14 PASS |
| blog-writing-packs/run-blog-v2-ikas-compliance-test.sh | 13/13 PASS |
| blog-writing-packs/run-blog-v2-sitemap-compliance-test.sh | 12/12 PASS |
| serpapi/run-serpapi-source-test.sh | SERPAPI-001 PASS |
| serpapi/run-serpapi-reviewed-on-demand-test.sh | 1/1 PASS |
| blog-writing-packs/run-blog-writing-pack-gate.sh | Full deterministic v1 gate PASS, including desktop smoke |
| export/run-production-data-package-loader-test.sh | PRODUCTION-DATA-PACKAGE-001 PASS |
| npx tsc --noEmit | PASS |
| npm run lint | PASS |
| bash -n tests/integration/blog-writing-packs/run-blog-v2-serp-compliance-test.sh | PASS |
| git diff --check | PASS |

Focused independent read-only review reported no important findings. Deterministic
verification is not real SERP acceptance: separately authorized accepted-artifact/
provider QA is still required after the relevant contract decisions. Delivery stays
NOT_EVALUATED. No real provider data was used in fixtures, no live site/provider
was called, and no production Runs/imports/databases/exports or accepted artifacts
were changed. No broad release or packaging gates, commits or pushes were run.
