# Blog v2 Slice 3B.2B.1 — Keyword Planner field compliance

Authority: focused user implementation request; existing multi-Run draft and explicit readiness contracts. No acquisition changes.

Inspected API normalizer/context, manual UTF-16LE tab export parser/context, accepted loader, existing field inspector/evaluator and deterministic fixtures. API uses provider text, avgMonthlySearches, categorical competition and bid micros; manual imports preserve native category/currency and currency-unit bids. Normalized null alone cannot prove raw presence. API context supports only its existing 12 complete months/TR/tr/GOOGLE_SEARCH contract; this is not automatic Blog approval. API currency is not captured; manual request context lacks structured historical/geographic/language/network scope.

Scope and sequence:
1. Add synthetic failing integration tests using the existing isolated readiness fixture and a focused runner: API/CSV mappings, identity, raw absence/null/zero, category/index separation, units, multiple Jobs, empty/warning evidence, scope/context and unsupported shapes.
2. Add source-local Keyword Planner inspection reusing existing normalizers/parsers, with safe typed context/identity failures and unresolved source-capability issues. No fetches or changed parsing/acquisition behavior.
3. Extend the existing Blog field helper and evaluator, retaining exact revalidated membership and independent Job summaries. Add optional explicit keyword_planner_scope input (ordered dates, country/language/network; no default period). CSV cannot prove missing requested scope from a label or monthly columns. Preserve source-native observations, history and currency.
4. Keep API missing currency, manual missing structured scope, open approval lists, empty/warning outcomes and multi-Job completeness as explicit blockers. Other four mandatory families remain outside implementation.
5. Run new suite, Keyword Planner reviewed API/close variants/manual import/adapter suites, v2 regressions, v1 gate, loader regression, TypeScript, lint and diff check. Update canonical contracts/handoff from results.

Acceptance: five downstream fields are source-backed, no requested-to-observed fallback or index-to-category substitution, no row aggregation/deduplication, no invented data/months/currency/scope. No real data, providers, production mutations, migration, publication, commit or push. Preserve reports.

## Verified implementation result

Implemented in `inspectKeywordPlannerFields` (new source-local module), the
existing `inspectBlogWritingPackV2Fields`, and `evaluateBlogWritingPackV2Readiness`.
The accepted-artifact loader, selection resolver, draft schema/store, existing
API adapter/request builder and CSV parser/acquisition remain unchanged.

Files changed:
- `src/main/sources/google-ads/keyword-planner-field-inspector.ts` (new)
- `src/main/blog-writing-packs/blog-writing-pack-v2-field-compliance.ts`
- `src/main/blog-writing-packs/blog-writing-pack-v2-readiness.ts`
- `src/shared/blog-writing-pack-v2-readiness.ts`
- `tests/integration/blog-writing-packs/blog-v2-keyword-planner-compliance.integration.cjs` (new)
- `tests/integration/blog-writing-packs/run-blog-v2-keyword-planner-compliance-test.sh` (new)
- `tests/integration/blog-writing-packs/blog-v2-readiness-fixture.cjs`
- `tests/integration/blog-writing-packs/blog-v2-readiness.integration.cjs`
- `tests/integration/blog-writing-packs/blog-v2-field-compliance.integration.cjs`
- `DATA_CONTRACTS.md`, `PROJECT_HANDOFF.md`, this plan.

API provider text remains returned_keyword and supplies Blog keyword; requested
keywords stay separate and only existing explicit exact/close-variant mappings
are accepted. avgMonthlySearches supplies average_monthly_searches; categorical
competition stays distinct from competitionIndex. Existing bid micros conversion
is reused, with null/zero preserved. Manual observed Keyword, Avg. monthly searches,
Competition and low/high bid columns use existing parser output, with native
localized category, currency and currency-unit bids. Required CSV header/full-row
validation proves column presence; API property presence is checked independently
of nullable normalized output. No rows or monthly history are aggregated,
reconstructed or deduplicated. Field reports contain counts, not business rows.

The optional version-1 requirements field keyword_planner_scope has explicit
ordered calendar endpoints and country/language/network strings. It has no default
period and does not import Ads Growth's 12-month policy. Context compatibility
still uses the existing source validator. Manual label/month columns cannot
establish requested scope. Open profile decisions remain explicit. The current
profile no longer lists keyword_identity as globally unresolved: actual observed
identity is now checked. Missing identity remains a per-evidence blocker.

Existing blocker codes reused:
- FIELD_ABSENT for absent API metric properties.
- FIELD_OBSERVATION_REQUIRED for missing/null/blank observed keyword or empty rows.
- FIELD_REPRESENTATION_INVALID for unsupported/malformed/ambiguous evidence.
- EVIDENCE_INVALID (keyword_planner_request_context) for invalid source context.
- WINDOW_MISMATCH (keyword_planner_scope) for approved/requested scope disagreement.
- DECISION_REQUIRED for unapproved scope, unknown API category meaning, manual CSV
  scope, single-Job keyword completeness and multi-Job coverage.
- SOURCE_CHANGE_REQUIRED (currency_context) because API artifacts omit observed
  account currency. No assumption of TRY from TR or conversion of currencies.
- Existing membership/integrity and LOW_DATA/NO_DATA coverage blockers unchanged.

Four other mandatory families remain unchecked and blocked/missing as appropriate.
Successful KWP field checks do not establish mandatory KWP coverage: approved Blog
historical scope, required keyword set/coverage policy and missing source context
still need resolution. API currency and manual structured scope would need a
separately authorized evidence/acquisition extension. No such extension was made.

TDD: initial RED had 11/12 failures (unsupported KWP inspection/missing guards).
Initial implementation GREEN 12/12. A further single-Job completeness regression
was RED at 13/14, then GREEN 14/14 after an explicit keyword_coverage blocker.
Regression fixtures now contain valid synthetic KWP provider shape/context.
The previous five unchecked-family assertion now distinguishes four unimplemented
families from actual KWP currency and keyword-coverage gaps, without weakening
identity, integrity, date, null/zero, immutable membership or delivery checks.

Fresh deterministic verification used Node 24.19.0 on PATH:

| Command | Result |
| --- | --- |
| `bash tests/integration/blog-writing-packs/run-blog-v2-keyword-planner-compliance-test.sh` | 14/14 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-readiness-test.sh` | 10/10 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-selection-test.sh` | 7/7 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-draft-test.sh` | 8/8 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-field-compliance-test.sh` | 13/13 PASS |
| `bash tests/integration/google-api/run-keyword-planner-reviewed-api-test.sh` | 3/3 PASS |
| `bash tests/integration/google-api/run-keyword-planner-close-variants-test.sh` | KWP-CLOSE-VARIANT-001 PASS |
| `bash tests/integration/file-import/run-keyword-planner-manual-csv-test.sh` | 4/4 PASS |
| `bash tests/integration/google-api/run-google-api-adapters-test.sh` | GOOGLE-API-001 PASS |
| `bash tests/integration/export/run-production-data-package-loader-test.sh` | PRODUCTION-DATA-PACKAGE-001 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-writing-pack-gate.sh` | Full deterministic v1 gate PASS, including its desktop smoke checks |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS |

Acceptance boundary: implemented and deterministically verified only. No real
CSV import or provider request occurred; this slice has no new real-provider or
delivery acceptance. A separate authorized real-artifact/provider QA would be
needed to claim it, after contract/source gaps are addressed. Existing historical
live verification does not establish this new evaluator's real acceptance.
No credentials, production Runs/databases/evidence/exports, other source families,
migrations, publication, commits or pushes changed. Baseline remains a99beaf.
