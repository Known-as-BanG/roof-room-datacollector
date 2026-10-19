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

## Approved account/window evidence follow-up — 2026-10-18

Authority: user's Google Ads Search Terms Account Context & Window Evidence task.
The earlier record above describes its historical slice; this follow-up closes
only the dedicated Search Terms acquisition gap under the approved last-30-day
account-calendar requirement. Preserve all prior WIP/reports and mandatory blockers.

Inspected existing capabilities: explicit Job customer ID is checked against the
Workspace connection before collection; native performance validation and raw
storage/accepted loader retain integrity and ownership; JSON publication already
reevaluates Ads windows at its creation timestamp. The missing acquisition fields
were customer.id/time_zone. Campaign reporting already consumes customer timezone;
Google's v25 search_term_view reference permits attributed customer fields without
segmenting metrics: https://developers.google.com/google-ads/api/fields/v25/search_term_view.
This is capability/documentation evidence, not live-provider acceptance.

Bounded implementation: select the two native fields in the dedicated query only;
reuse raw Artifact storage/provenance and the existing Ads readiness check. Keep
requested dates/identity distinct from observed timezone/account/performance dates
in publication context. Do not alter shared reporting queries, normalizers, Core,
native validation outcomes, UI, migrations, other sources or business exports.
Legacy unbound account context stays blocked; no constructor/host timezone backfill.

TDD: the expanded publication suite initially failed 3/26 on missing query fields
and requested/observed inspection context; existing midnight/DST boundary cases
already passed. Minimal production change is in search-terms-request.ts and
search-terms-adapter.ts. Source → native validator → accepted loader → frozen draft
→ actual readiness/publisher is exercised with synthetic provider evidence and a
controlled creation clock. An older source-only validation verdict cannot grant
Blog compliance. Review-runtime persistence also checks native metadata and raw
Artifact checksum without retroactively assigning an account to its legacy Job.
An additional RED case exposed arbitrary customer fields on legacy flat rows being
treated as native metadata. Account inspection now accepts this proof only from
native SearchStream rows; legacy metric normalization/readability is unchanged.

Files changed in this follow-up:

- `src/main/sources/google-ads/search-terms-request.ts`
- `src/main/sources/google-ads/search-terms-adapter.ts`
- `tests/integration/blog-writing-packs/blog-v2-publication.integration.cjs`
- `tests/integration/blog-writing-packs/run-blog-v2-publication-test.sh`
- `tests/integration/google-api/ads-reviewed-quick-run.integration.cjs`
- `DATA_CONTRACTS.md`, `PROJECT_HANDOFF.md`, this plan.

Remaining boundaries: explicitly selected account and matching exact endpoints
are still required; existing desktop paths do not all freeze account identity or
use account-calendar dates. Empty results cannot establish native timezone or
daily zero activity. Current conservative profile decisions/endpoints, multi-Job
coverage and all unrelated mandatory source gaps remain effective. No live calls,
production Runs, real business exports, migration, commit or push are authorized.

Verification (Node 24.19.0, synthetic providers only):

| Command | Result |
| --- | --- |
| `bash tests/integration/blog-writing-packs/run-blog-v2-publication-test.sh` | 26/26 PASS, including 10 new Ads cases |
| `bash tests/integration/google-api/run-ads-reviewed-quick-run-test.sh` | 3/3 PASS; raw account metadata persisted and hash-verified |
| `bash tests/integration/blog-writing-packs/run-blog-v2-readiness-test.sh` | 10/10 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-field-compliance-test.sh` | 13/13 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-selection-test.sh` | 7/7 PASS |
| `bash tests/integration/blog-writing-packs/run-blog-v2-draft-test.sh` | 8/8 PASS |
| `bash tests/integration/google-api/run-google-api-adapters-test.sh` | GOOGLE-API-001 PASS |
| `bash tests/integration/google-api/run-google-ads-keyword-search-term-reporting-test.sh` | GOOGLE-ADS-KEYWORD-SEARCH-TERM-001 PASS |
| `bash tests/integration/export/run-production-data-package-loader-test.sh` | PRODUCTION-DATA-PACKAGE-001 PASS |
| `npx tsc --noEmit` | PASS |
| Targeted TS/CJS ESLint and Bash runner syntax | PASS, zero errors/warnings; CJS uses ES2021 environment and existing require style |
| `git diff --check` and task-file whitespace review | PASS |

The first expanded reviewed-runtime check referenced a loader outside its compile
entry points; it was corrected to inspect the native stored artifact/checksum.
The source-to-accepted-loader assertion is independently covered by the publication
suite. Independent read-only review found no confirmed correctness issue in the
bounded production diff. Real field availability, privacy-limited returned rows,
provider acceptance and full Blog delivery require separate evidence.

## Approved desktop account binding follow-up — 2026-10-18

Authority: user's Google Ads Search Terms Desktop Account Binding task. The prior
follow-up's missing desktop selection wiring is now in scope. Reuse existing
Workspace customer metadata, safe connection view, source configuration, reviewed
draft and native Job persistence. No account-management architecture, Core change,
migration, unrelated provider/UI feature, live API or business export is authorized.

Existing mechanisms: Workspace connection stores customer ID; source configuration
and Job plans already support it; source execution prefers frozen Job customer and
rejects changed connection. Missing wiring: renderer supplied only task/date policy,
Review rebuilt Jobs without an account, and generic execution inferred it from the
active connection. Native validation previously checked performance rows only.

Implemented bounded design:

- Explicit initially blank Search Terms account selector; existing safe account
  view exposes only customer ID. Reuse existing JSON IPC; no new channel or schema.
- Source-owned numeric selection/connection/per-Job checks; controller rejects
  missing, invalid or conflicting account choice at Review/Start and before managed
  task reconstruction. Generic planning freezes selected ID and never fills it
  from the active connection. Existing presets with explicit selection preserve it.
- Existing source requester uses persisted customer ID. Native account inspection
  is shared between validator and Blog inspection; nonempty bound responses require
  matching native account ID and valid consistent timezone. Empty NO_DATA remains
  distinct. Legacy missing selection remains unchanged and cannot prove Blog scope.
- Existing desktop date policies and all publication rules/blockers are preserved.

TDD evidence: initial native/runtime RED 2/4 on missing selection accepted and
provider-account mismatch accepted. Renderer RED reproduced automatic Review without
an account choice. An extra RED caught a different numeric account at initial Review.
Independent review then identified initial per-Job account conflict overwritten by
task reconstruction; regression reproduced it and source-owned checks now reject
it before reconstruction, including Start checks of reusable and resolved scope.

Files changed (12):

- `src/DesktopMultiSourceView.tsx`
- `src/main/app/desktop-multisource-controller.ts`
- `src/main/sources/google-ads/search-terms-request.ts`
- `src/main/sources/google-ads/search-terms-adapter.ts`
- `src/main/sources/google-ads/search-terms-validator.ts`
- `tests/integration/google-api/ads-reviewed-quick-run.integration.cjs`
- `tests/integration/google-api/run-ads-reviewed-quick-run-test.sh`
- `tests/integration/app/desktop-ui-smoke.integration.cjs`
- `tests/integration/app/desktop-multisource-flow.integration.cjs`
- `DATA_CONTRACTS.md`, `PROJECT_HANDOFF.md`, this plan.

Verification (Node 24.19.0, only synthetic providers):

| Gate | Result |
| --- | --- |
| Ads reviewed runtime, SQLite restart, native validation and real Blog loading/readiness | 4/4 PASS |
| Full desktop renderer smoke | PASS; blank selection, explicit account submission, exact reviewed Start |
| Desktop multi-source flow | PASS; account-view fixture updated for explicit nullable customer ID |
| Desktop connection main IPC | DESKTOP-CONNECTION-MAIN-IPC-001 PASS |
| Blog v2 JSON publication / readiness | 26/26 and 10/10 PASS |
| Google API adapters / Ads keyword-search-term reporting | both existing gates PASS |
| `npx tsc --noEmit`, targeted lint, Bash syntax | PASS |
| `git diff --check` and task-file whitespace check | PASS |

The renderer gate required authorized loopback access outside the sandbox; Vite
and Playwright used mocked IPC/providers. Initial default CJS lint exposed the
flow fixture's pre-existing `_missingIncludedSources` unused binding; targeted
fixture lint uses `varsIgnorePattern: ^_`, leaving unrelated code unchanged.
The runtime test verifies all four Search Terms task variants, invalid/missing/
different account rejection, conflicting initial/reviewed Job accounts, changed
connection before Start, immutable persisted customer after SQLite reopen, actual
mocked requester URL, provider metadata validation, and accepted evidence through
real Blog draft/readiness. A 17-day desktop task explicitly retains its 30-day Blog
window blocker. GSC/Planner and other mandatory Blog gaps remain; no live or full
delivery acceptance is claimed. Existing WIP/reports are preserved; no commit/push.

## GSC finality evidence compliance verification — 2026-10-18

Authority: user's GSC Query × Page Finality Evidence Compliance task. Verify the
existing source and publication boundary against Google's official semantics;
implement only a demonstrable gap, otherwise retain the precise unresolved blocker.
The stable interpretation and official documentation links are recorded once in
`DATA_CONTRACTS.md`, Google Search Console → Query × Page finality evidence boundary.

The existing request preserves selected property, exact endpoints, query/page
dimensions and raw response pages. It omits `dataState`; the documented default
finalizes returned observations but does not certify whole-window eligibility.
Native validation accepts supported rows; it is not a Blog coverage verdict.
Accepted loading and frozen membership protect property/date/raw integrity.
Publication already reevaluates the mandatory `gsc_finality` blocker at its actual
UTC creation reference. No production correction is justified by this inspection.

Added ten deterministic characterization cases to the existing publication suite:
request/response fidelity; default-final data without interval evidence; unverified
request claims; incomplete/candidate cutoff metadata without a bound date probe;
legacy context; wrong endpoints/30-day rejection; sparse date-only shape rejection;
two publication clocks without automatic maturation or evidence substitution; and
frozen property/raw metadata tampering. These preserve actual zeros/nulls and
membership, and prevent a misleading completed output. Counterfactual metadata
is explicitly untrusted test input, not evidence of a supported probe protocol.
Existing safeguards passed; no RED production-bugfix claim is made.

Changed files for this follow-up only:

- `tests/integration/blog-writing-packs/blog-v2-publication.integration.cjs`
- `DATA_CONTRACTS.md`, `PROJECT_HANDOFF.md`, this existing plan.

Verification with Node 24.19.0 and synthetic providers:

| Gate | Result |
| --- | --- |
| `run-blog-v2-publication-test.sh` | 36/36 PASS |
| `run-gsc-reviewed-quick-run-test.sh` | 14/14 PASS |
| `run-blog-v2-readiness-test.sh` | 10/10 PASS |
| `run-blog-v2-field-compliance-test.sh` | 13/13 PASS |
| `run-google-search-console-validation-test.sh` | GOOGLE-SEARCH-CONSOLE-VALIDATION-001 PASS |
| `run-google-api-adapters-test.sh` | GOOGLE-API-001 PASS |
| `run-production-data-package-loader-test.sh` | PRODUCTION-DATA-PACKAGE-001 PASS |
| `npx tsc --noEmit` | PASS |
| Targeted publication CJS lint (`es2021`, existing require convention) | PASS |
| `git diff --check`, task-file trailing whitespace check | PASS |

Remaining decision: acceptable property/window-bound native finality and
date-availability evidence, treatment of omitted/no-data dates and provider row
loss, and proof that the interval remains the latest eligible one at publication.
The repository has no approved acceptance protocol or captured probe for this.
Finalized observations do not become unfinalized with age; older cutoff evidence
may no longer prove latest-window eligibility. No arbitrary lag, zero-fill,
aggregate subtraction, legacy backfill or cached draft verdict is accepted.

All prior tracked/untracked WIP and private reports remain. No provider request,
production Run, real export, migration, commit or push occurred. This outcome
verifies the blocker rather than live-provider acceptance or complete delivery.

## Approved conservative date-coverage follow-up — 2026-10-18

Authority: user's explicit conservative date-coverage approval. All 28 dates must
be observed in separately preserved `dataState=final`, date-grouped evidence for
the same property, search type and window. Latest eligible publication interval
remains unresolved; no probe age or lag rule is introduced.

Bounded implementation uses the existing same-Attempt acquisition metadata:
the source acquires a companion date response for explicitly property-bound
28-day Query × Page requests. Metadata identifies both requests and response
receipt; native metadata already binds Run/Job/Attempt/raw artifact. The loader
verifies that binding, and new drafts freeze its path/hash/size/Attempt reference
using the existing SERP pattern. This is an explicit same-Attempt association,
not a join to another Run or an amendment of an existing draft.

- [x] Add focused failing tests in `blog-v2-publication.integration.cjs`; compile
  the GSC source in its existing runner.
- [x] Add source-owned `gsc-date-coverage.ts` acquisition/parser/evaluator; integrate
  Query × Page source, validator and adapter without changing Query acquisition.
- [x] Wire optional GSC metadata provenance through the existing accepted loader,
  v2 selection type/resolver/parser, field inspection/readiness and publisher/
  publication-format integrity checks. Legacy absence stays absence.
- [x] Update the canonical GSC contract, run focused publication/GSC/readiness/
  field/v1/loader regressions, TypeScript, targeted lint and diff checks.
- [x] Record verified results and remaining publication eligibility in this plan
  and current handoff. Preserve all prior WIP/reports; no live calls or commits.

### Verified conservative coverage result

Initial focused RED: the previous 36 publication tests passed and all 16 new
cases failed because no companion request, coverage summary, metadata freeze or
integrity enforcement existed. Final publication suite is 59/59 with additional
country/future/grouping/duplicate/native-validation/legacy and synthetic storage
readback cases. Complete date presence clears only `gsc_date_coverage`;
`gsc_finality` remains a mandatory publication blocker at both tested clocks.
Missing observations are reported explicitly, never manufactured from endpoints.

The real native runtime persistence test initially found no companion metadata:
its default managed desktop configuration did not freeze `site_url` in the Job.
The source correctly retained unbound behavior. The positive test now uses the
existing explicit reusable `site_url` configuration, then actual Review/Start,
mocked HTTP/OAuth, native validation, Attempt metadata persistence and SQLite
reopening. No desktop production change or inferred property was added. This
default managed-configuration binding limit remains explicit in the contract.

Exact changed files in this follow-up (21; earlier WIP preserved):

- `DATA_CONTRACTS.md`
- `PROJECT_HANDOFF.md`
- `docs/superpowers/plans/2026-10-15-blog-writing-pack-v2-ads-gsc-compliance.md`
- `src/main/sources/google-search-console/gsc-date-coverage.ts` (new)
- `src/main/sources/google-search-console/query-page-adapter.ts`
- `src/main/sources/google-search-console/google-search-console-source.ts`
- `src/main/sources/google-search-console/google-search-console-validator.ts`
- `src/main/export/production-data-package-loader.ts`
- `src/shared/blog-writing-pack-v2-selection.ts`
- `src/shared/blog-writing-pack-v2-readiness.ts`
- `src/main/blog-writing-packs/blog-writing-pack-v2-selection-resolver.ts`
- `src/main/blog-writing-packs/blog-writing-pack-v2-draft.ts`
- `src/main/blog-writing-packs/blog-writing-pack-v2-field-compliance.ts`
- `src/main/blog-writing-packs/blog-writing-pack-v2-readiness.ts`
- `src/main/blog-writing-packs/blog-writing-pack-v2-publisher.ts`
- `src/main/blog-writing-packs/blog-writing-pack-v2-publication-format.ts`
- `tests/integration/blog-writing-packs/blog-v2-publication.integration.cjs`
- `tests/integration/blog-writing-packs/run-blog-v2-publication-test.sh`
- `tests/integration/blog-writing-packs/blog-v2-readiness.integration.cjs`
- `tests/integration/blog-writing-packs/blog-v2-field-compliance.integration.cjs`
- `tests/integration/google-api/gsc-reviewed-quick-run.integration.cjs`

Verification with Node 24.19.0; providers synthetic only:

| Gate | Result |
| --- | --- |
| `run-blog-v2-publication-test.sh` | 59/59 PASS |
| `run-gsc-reviewed-quick-run-test.sh` | 15/15 PASS |
| `run-blog-v2-readiness-test.sh` | 10/10 PASS |
| `run-blog-v2-field-compliance-test.sh` | 13/13 PASS |
| `run-blog-v2-selection-test.sh` / `run-blog-v2-draft-test.sh` | 7/7 and 8/8 PASS |
| GSC native validation / Google API adapters / accepted-package loader | all three existing gates PASS |
| `run-blog-writing-pack-gate.sh assembler`, `exporter`, `store` | all scoped v1 gates PASS |
| `npx tsc --noEmit` | PASS |
| Targeted production TS and four CJS test-file lint | PASS |
| Publication runner `bash -n`, `git diff --check`, task-file whitespace | PASS |

The two prior readiness/field assertions expecting legacy GSC coverage were
updated to require its new mandatory missing-date-evidence blocker. Read-only
review found no confirmed implementation issue; current-state claims rely on the
actual gates above. Synthetic storage readback verifies metadata copying/integrity
only, not a successful real-policy publication. No new schema/migration, Core
policy, other source feature, Excel/Electron feature, live provider request, real
export, commit or push. Latest-eligible interval policy and provider Query × Page
row-loss limitations remain unresolved; all earlier mandatory blockers survive.

## Approved desktop Query × Page property binding — 2026-10-18

Authority: user's GSC Desktop Property Binding task. Reuse the existing safe
Workspace connection view, reusable `site_url`, generic IPC, Review/Start and
native Job persistence. The task UI needs an initially blank property selector;
new Jobs must never infer property from the active connection. Source-owned
selection/binding checks guard initial context, reviewed/reusable configuration
and per-Job ranges before managed reconstruction. Preserve exact Domain/URL-prefix
identities and legacy Jobs. Existing native acquisition already uses a frozen
property and matching final/date evidence. Latest-window policy stays blocked.

- [x] Add GSC controller/runtime and renderer explicit-selection tests.
- [x] Extend existing safe connection view with GSC `site_url`; wire blank UI
  selection into task configuration and invalidate Review on selection changes.
- [x] Add local GSC property/binding validation; enforce it in planner/Review/Start
  and skip Query × Page property autofill. Keep Query-only behavior unchanged.
- [x] Verify SQLite persistence, native requests, unchanged date evidence/blockers,
  desktop/IPC regressions, TypeScript, targeted lint and diff checks.
- [x] Update canonical source contract/current handoff and record exact results.

### Verified explicit property binding

The target worktree already contained the bounded selector/controller wiring;
review found that its Query × Page source still allowed a `gsc-*` desktop Job
without frozen `site_url` to fall back to the Workspace property. That fallback
is now rejected. Taskless legacy source contexts retain their configured-property
compatibility, and Query-only acquisition remains unchanged. The renderer also
reads the pre-Review property from selection state rather than dereferencing an
absent review object. Query × Page and companion date requests use the exact
frozen Domain or URL-prefix identity; the companion evidence remains separate and
does not clear `gsc_finality`.

Verification used synthetic providers only:

| Gate | Result |
| --- | --- |
| `run-gsc-reviewed-quick-run-test.sh` | 16/16 PASS |
| `run-desktop-ui-smoke-test.sh` | PASS; explicit property selection, Review/Start and preset property persistence |
| `run-desktop-multisource-flow-test.sh` | PASS; multi-source GSC and safe connection DTO regressions |
| `run-blog-v2-publication-test.sh` / `run-blog-v2-readiness-test.sh` | 59/59 and 10/10 PASS; `gsc_finality` remains blocked |
| GSC validation / Google API adapter gates | PASS |
| `npx tsc --noEmit` | PASS |
| Targeted TypeScript and Node/ES2021 CommonJS ESLint | PASS |
| `git diff --check` | PASS |

Latest-eligible publication interval, complete Query × Page row coverage, other
mandatory Blog v2 source gaps, successful source-policy publication, and live
provider acceptance remain unresolved. No live request, production Run, real
export, migration, commit or push occurred.
