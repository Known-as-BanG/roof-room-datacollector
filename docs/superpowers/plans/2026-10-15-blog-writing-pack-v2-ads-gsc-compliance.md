# Blog v2 Slice 3B.2A — Ads/GSC field compliance

Implement the approved attachment contract within the existing read-only readiness evaluator.

Inspected: frozen membership resolver, accepted-artifact loader, Ads legacy/SearchStream and GSC page normalizers, Slice 3B.1 requirements and tests. Normalized nulls alone cannot prove raw field presence.

Scope: source-local field presence inspection alongside existing normalization; a verified byte-read seam in the existing loader; Blog-only downstream aliases and field summaries; explicit Ads endpoints and existing GSC 28-day check. Other five families remain unresolved. No Core policy, acquisition, draft writes, publication, UI, database, credentials or live providers.

Steps:
1. Add failing synthetic field-compliance tests (including raw absent versus explicit null, date and units, incompatible/empty evidence, exact windows).
2. Reuse accepted-artifact integrity and source normalization, add safe per-field counts/blockers; retain frozen provenance and existing validation outcomes.
3. Adapt readiness fixtures to actual supported raw representations; retain selection/draft/v1 behavior.
4. Run new suite, readiness/selection/draft, adapter, v1 and loader gates, TypeScript, lint and diff check.
5. Record verified results in this plan, DATA_CONTRACTS and current handoff. No commits or pushes.

Acceptance: no normalized default can prove an absent raw field; aliases/units/nulls/dates remain faithful; empty/warning outcomes and other families cannot produce false compliance; requirements do not infer dates; all focused gates pass.

## Verified result

Implemented read-only checks in `evaluateBlogWritingPackV2Readiness`. The existing
loader now exposes `readAcceptedJobArtifact` with the same accepted ownership and
size/SHA-256 checks used by `verifyAcceptedJobArtifact`; the latter retains its
public result shape. Source-local inspectors reuse existing normalizers and inspect
raw presence before normalized nulls can hide absent properties. The Blog helper
owns only downstream required-field summaries and GSC aliases. No migration needed.

Changed in this slice (relative to pre-existing WIP):
- `src/main/blog-writing-packs/blog-writing-pack-v2-readiness.ts`
- `src/main/blog-writing-packs/blog-writing-pack-v2-field-compliance.ts`
- `src/shared/blog-writing-pack-v2-readiness.ts`
- `src/main/export/production-data-package-loader.ts`
- `src/main/sources/google-ads/search-terms-adapter.ts`
- `src/main/sources/google-search-console/query-page-adapter.ts`
- `tests/integration/blog-writing-packs/blog-v2-readiness.integration.cjs`
- `tests/integration/blog-writing-packs/blog-v2-readiness-fixture.cjs`
- `tests/integration/blog-writing-packs/blog-v2-field-compliance.integration.cjs`
- `tests/integration/blog-writing-packs/run-blog-v2-field-compliance-test.sh`
- `DATA_CONTRACTS.md`, `PROJECT_HANDOFF.md`, this plan.

Ads mappings: legacy flat fields and canonical searchTermView.searchTerm,
campaign.name, adGroup.name, metrics.impressions/clicks/ctr/conversions and
metrics.conversionsValue → conversion_value; existing costMicros/cost_micros
conversion to currency units; existing segments.date and legacy date aliases
preserved as performance_date without inference. GSC keys → query/page,
page → page_url, position → average_position; provider metrics unchanged.

Per-field statuses OBSERVED/NULL/ABSENT/UNRESOLVED retain counts and no row values.
Unsupported inspector sources return UNSUPPORTED. Legitimate explicit nulls,
existing legacy/GSC empty-string-to-null behavior, and actual zeros remain distinct.
A null legacy search-term identity cannot pass through an empty-string fallback.
New blockers: FIELD_ABSENT, FIELD_OBSERVATION_REQUIRED,
FIELD_REPRESENTATION_INVALID. Existing identity/integrity/membership, missing,
decision/source-change, warning-outcome, multi-Job and window blockers remain.
NO_DATA/LOW_DATA never bypass window/field checks; empty VALID is also blocked.

Ads endpoints are optional for backwards-compatible input shape but mandatory
for coverage; missing/null stays DECISION_REQUIRED. Supplied dates must be valid
and ordered, with exact requested-context agreement and no assumed duration.
GSC reuses the existing exact inclusive-28-day validation and endpoint comparison.
Callers must explicitly resolve open decision lists as well as supply endpoints.
No current-period reference date or timezone was chosen. Five other mandatory
families stay DECISION_REQUIRED when selected, MISSING when absent; clearing the
profile lists cannot grant unimplemented compliance. COMPLETE remains in the
coverage contract but cannot be established by this two-family slice. Trends optional.

TDD evidence: initial new suite RED 0/10 before production changes; then GREEN
10/10. Added edge-case regressions reproduced null-identity fallback (11/12 RED)
and supported empty-string null compatibility (12/13 RED). Final GREEN 13/13.
The readiness fixture now uses actual supported synthetic Ads/GSC raw shapes.
Its former reduced-profile COMPLETE assertion was strengthened to require five
unimplemented-family blockers; identity, provenance, warning, date and draft
immutability regressions remain passing.

All commands below ran with Node v24.19.0 on PATH, synthetic fixtures only:

| Command | Result |
| --- | --- |
| `bash tests/integration/blog-writing-packs/run-blog-v2-field-compliance-test.sh` | 13/13 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-readiness-test.sh` | 10/10 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-selection-test.sh` | 7/7 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-draft-test.sh` | 8/8 PASS |
| `bash tests/integration/google-api/run-google-api-adapters-test.sh` | GOOGLE-API-001 PASS |
| `bash tests/integration/google-api/run-google-search-console-validation-test.sh` | GOOGLE-SEARCH-CONSOLE-VALIDATION-001 PASS |
| `bash tests/integration/google-api/run-google-ads-keyword-search-term-reporting-test.sh` | GOOGLE-ADS-KEYWORD-SEARCH-TERM-001 PASS |
| `bash tests/integration/export/run-production-data-package-loader-test.sh` | PRODUCTION-DATA-PACKAGE-001 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-writing-pack-gate.sh` | Full deterministic v1 gate PASS, including its existing desktop smoke checks |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS |

Remaining five-family semantics: KWP keyword identity/historical scope; Products
category/price/availability/stock/status/freshness; Sitemap scope/freshness plus
page_type/title/status source changes; SERP capture date/freshness; GA4 users,
average engagement time/window and engagement-time source capability. Their field
compliance remains outside this slice. Ads period approval and GSC exact endpoints
remain necessary; multi-Job and warning-outcome coverage decisions also remain open.

No live providers, production Runs, production database/evidence/export changes,
credentials, publication, UI implementation, commit or push. Existing unrelated
WIP and reports preserved. No packaged/live acceptance claimed. Baseline remains
218d56c on feat/google-analytics-4-source-v1; all work remains uncommitted.
