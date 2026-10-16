# Blog v2 Slice 3B.2B.4 — SERP snapshot field compliance

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
