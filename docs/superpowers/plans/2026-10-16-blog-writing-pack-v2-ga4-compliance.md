# Blog v2 Slice 3B.2B.5 — GA4 Content Performance compliance

## Follow-up plan — Property/timezone/window compliance (2026-10-17)

Authority: user's focused Property & Date Window Compliance task. Preserve the
sixteen existing modified files and reports/. No live provider call, production
Run, migration, export, commit, push, new Core architecture or publication.

Already present: explicit frozen property versus acquisition-request equality in
the inspector; exact absolute request-date equality, immutable membership/integrity,
provider timezone preservation, versioned native metrics, full row-count checks and
placeholder handling. Gaps: source validation rejects the otherwise supported
property_id context; provider timezone is not validated across pages; no completed-
28-day calculation exists; multi-Job property/timezone conflicts are only generic.

Reference decision: use the existing immutable draft.created_at instant to evaluate
the package's last 28 completed property-calendar days. It is an evaluation
reference, not provider observation time. Use accepted response metadata.timeZone
only, validate all supplied timezone observations and reject missing/invalid or
conflicting evidence. Never consult host timezone, current connections or Date.now.
Frozen Job property_id is the existing explicit selection; do not invent a second
property selector or repair legacy missing context. Preserve raw/requested dates.

Affected paths: existing GA4 validator and field inspector; existing Blog v2 field
helper/evaluator and shared readiness types/profile; existing GA4 compliance and
validation tests plus readiness fixture/assertions; canonical DATA_CONTRACTS.md and
PROJECT_HANDOFF.md. No new plan tree or helper module.

- [x] RED: explicit property validation, provider timezone provenance/absence/
  conflict, calendar month/year/leap/DST/midnight boundaries, wrong endpoints,
  invalid reference, cross-Job conflicts, legacy non-repair and unchanged evidence.
- [x] GREEN: small GA4-local calendar calculation; reuse existing property checks;
  add read-only expected-window provenance and per-evidence blockers. Resolve only
  the now-implemented reporting_window profile decision; preserve coverage blockers.
- [x] Verify focused GA4 compliance, full GA4 source gate, affected Blog v2 suites,
  loader, TypeScript, scoped lint and diff check; review and document actual results.

Acceptance: supported explicit property + trustworthy timezone + exact last-28-day
request is deterministically checked; missing/conflicting inputs cannot pass by
clearing decision lists. No reconstructed dates, missing-day zeros, metric changes,
historical assignments, raw/draft mutation or provider/delivery acceptance claim.

Property/window execution evidence (Node 24.19.0; synthetic fixtures only):

- Initial RED: five new cases failed while all previous 24 metric/pagination cases
  passed. The source validation test also reproduced explicit property context
  being rejected as QUERY_MISMATCH. Final GA4 compliance: 29/29 PASS.
- Calendar assertions cover month/year boundaries, leap February, explicit instant
  offsets, LA midnight and both NY daylight-saving transitions. Wrong shifted,
  27/29-day or today-including requests, missing/invalid timezone, ambiguous draft
  timestamp, cross-page/cross-Job conflicts and legacy non-repair are covered.
- Full GA4 source gate PASS. Other Blog v2 suites: readiness 10/10, field compliance
  13/13, selection 7/7, draft 8/8, KWP 14/14, İkas 13/13, Sitemap 12/12 and SERP
  14/14 PASS. The intentionally stale synthetic GA4 request adds a calendar-window
  blocker: its total is now 22 instead of 21; the exact WINDOW_MISMATCH is asserted.
- Accepted-artifact loader PASS; full `npx tsc --noEmit` PASS; scoped worktree-local
  ESLint (`--no-eslintrc --config .eslintrc.json`) on all five changed TS files PASS.
  Final focused/static checks also passed after reusing parsed pages and clarifying
  safe blocker messages. Independent read-only review found no actionable issues.
- Task-start snapshots confirm seven other files of previous metric/compliance
  WIP remain byte-identical; twelve existing files changed in this follow-up.
  No reports/ access, new Markdown file, acquisition/request/metric change, Core
  change, real-provider call, production access, export, migration, commit or push.

Supported evidence now has deterministic property/timezone/window compliance.
Missing legacy identity or timezone remains blocked rather than reconstructed.
Coverage/population and real-provider/delivery acceptance remain separate.

## Follow-up plan — Content metric completion (2026-10-17)

Authority: user's GA4 Content Performance Metric Completion request and the approved
delivery requirements in DATA_CONTRACTS.md. Implement this focused follow-up inline;
no new architecture, Core change, migration, live request, export, commit or push.
Preserve prior DATA_CONTRACTS.md/PROJECT_HANDOFF.md changes and reports/.

Inspected: the Content request has eleven metrics; the normalizer is header-driven;
the validator locks exact headers/types/order and bundle version 1; the source-local
inspector always blocks users/time. Paid Funnel is independent. Existing source,
Blog compliance and accepted-loader tests provide the relevant verification seams.

Compatibility decision: new Content acquisition uses raw bundle version 2 with
the existing eleven metrics followed by totalUsers (TYPE_INTEGER) and
userEngagementDuration (TYPE_SECONDS). Version 1 retains its exact legacy schema
and normalized row shape; Paid Funnel remains version 1. No historical metric is
relabeled. Versioned exact validation prevents truncated new reports being mistaken
for legacy evidence. Source-normalized total_users/user_engagement_duration remain
separate from downstream users and derived average_engagement_time.

Affected files: shared/google-analytics-4.ts, GA4 request/parser/validator/field
inspector, the existing Blog requirements profile, existing GA4 request/runtime/
compliance tests and runner/fixtures only as needed. Canonical contracts and handoff
will record actual verified progress without deleting earlier approved requirements.

- [x] RED: request the two real metrics; inspect new accepted bundles and prove
  totalUsers alias, seconds/session derivation, null reasons, invalid input rejection,
  raw/native/derived separation, legacy strictness and complete pagination.
- [x] GREEN: extend only these existing source paths; expose fixed metric provenance
  in the existing read-only GA4 context. Remove obsolete users/time decision defaults;
  keep missing legacy capability and independent property/window/coverage blockers.
- [x] Regress: full deterministic GA4 gate, affected Blog v2 suites and accepted
  loader, TypeScript, scoped lint and git diff --check. All fixtures synthetic.
- [x] Review exact diff and update this execution record/contracts/handoff.

Acceptance: new metrics acquired and normalized without activeUsers substitution;
time is derived only from present numeric duration and positive integral sessions,
otherwise null with a reason; invalid numeric input fails closed. Missing versus
present-null versus real zero remain distinct. Legacy artifacts stay readable,
all rows and `(not set)` behavior survive, and delivery remains NOT_EVALUATED.

Metric-completion execution evidence (Node 24.19.0, synthetic fixtures only):

- Initial RED: Content request lacked the two metrics; new compliance cases were
  0/5 while all previous 18 cases passed. Implementation GREEN reached 23/23.
- Additional RED: whitespace duration became zero (23/24), and source validation
  accepted fewer rows than rowCount. The shared parser now treats whitespace-only
  metric cells as null; source validation rejects incomplete normalized row counts.
- Final GA4 compliance: 24/24, including 250,001 rows over two verified pages,
  old/new placeholders, native versus derived fields, null reasons, exact schema
  versions, missing values, malformed numeric data and unchanged raw/draft bytes.
- Full `bash tests/integration/google-analytics-4/run-google-analytics-4-gate.sh`:
  all connection/contract/desktop/parser/request/source-runtime/validation cases PASS.
- Blog v2 runners: readiness 10/10, Ads/GSC field compliance 13/13, selection 7/7,
  draft 8/8, KWP 14/14, İkas 13/13, Sitemap 12/12, SERP 14/14 PASS. The earlier
  readiness total of 23 blockers is now 21 because the two users/time semantic
  decisions are resolved; legacy missing-source blockers remain asserted.
- Accepted-artifact loader PASS; `npx tsc --noEmit` PASS; worktree-local ESLint
  (`--no-eslintrc --config .eslintrc.json`) on all six changed TS files PASS.
- Independent read-only review: no actionable findings. Exact diff and
  `git diff --check` reviewed at final verification.

No source-family COMPLETE, live GA4, packaged-runtime or Blog delivery acceptance
is inferred. Property-timezone window binding, legacy property handling and
independent coverage rules remain open. No production Run/export, migration,
historical evidence change, report access, commit or push.

Authority: user's focused implementation request; approved GA4 source design and
plan (2026-10-03), DATA_CONTRACTS.md, current Blog v2 evaluator and TEST_STRATEGY.md.
Baseline abb8be3 with preserved uncommitted SERP work. No commit/push/live requests.

## Inspected seam and scope

Content Performance already exists: landingPage and eleven locked metrics include
activeUsers/sessions/engagedSessions/engagementRate/keyEvents. It is separate from
Paid Funnel. The existing parser preserves landingPage text and nullable numbers;
the source validator checks exact headers/types/order, bundle dates/property,
pagination and dimensions. totalUsers and engagement durations are not acquired.
Blog users and average engagement time meanings are unapproved; no aliases or
calculations may satisfy them. The source's suggested window is not Blog approval.

## Sequence

- [x] Add synthetic bundle fixture and focused failing tests: native landingPage,
  active/total users separation, missing/null/zero cells, rate units, missing time
  capability, keyEvents identity, Content versus Paid schema, request/window/property
  compatibility, unsupported headers, pagination, empty/warning outcomes, independent
  Jobs, integrity and immutable provenance. Observe RED before production edits.
- [x] Reuse the existing pure source validator helpers and normalizer in a small
  GA4-local field inspector. Export the two existing pure helpers without changing
  their behavior; add no acquisition or source-validation policy. Preserve actual
  raw-value presence and safe per-Job report context, not provider row values.
- [x] Integrate GA4 into the existing Blog helper/evaluator and read-only field
  result. Add optional explicit ga4_requested_dates, validating real ordered calendar
  endpoints without a default duration. Preserve non-bypassable users/time semantic
  and source gaps, missing frozen-property context and unresolved content coverage.
  Adapt only affected shared fixtures/assertions; preserve SERP-specific files.
- [x] Run focused GREEN, affected GA4 and all Blog v2 regressions, v1, loader,
  TypeScript, lint, shell syntax and diff checks. Document actual results, remaining
  approval/source gaps, final Git scope and before/after preservation hashes.

Acceptance: all seven Blog fields are honestly checked or explicitly blocked.
No users/time synthesis, relative-path URL construction, rate scaling, metric
aggregation, cross-window merging, source requests, draft/raw mutation or new Core
abstraction. Delivery stays NOT_EVALUATED; real readiness cannot become COMPLETE.

## Verified result

Implemented the source-local inspector above existing requireJobContext,
requireRawBundle and normalizeGoogleAnalytics4Rows. Validator changes are precisely
two export keywords; no parser/request/source/validator behavior is changed.
The inspector additionally rejects incomplete normalized row coverage. Actual
provider value-property presence distinguishes absent values from present nulls;
unsupported users/time fields receive no fabricated normalized properties.

Content Performance exists and uses landingPage alone, with activeUsers, sessions,
engagedSessions, engagementRate, keyEvents and six existing ecommerce metrics.
No totalUsers or engagement-duration metric is acquired. users and time retain
both DECISION_REQUIRED and SOURCE_CHANGE_REQUIRED. Unsupported extra metric or
dimension headers fail the existing exact source contract; raw observations are
preserved without interpreting them as new capabilities. Native fractions, nulls,
zeros, key-event counts and `(not set)` path observations remain unchanged.

Optional ga4_requested_dates is additive to the existing requirements input;
real ordered endpoints compare exactly per selected Job. No default duration or
observed period is invented. Current real profile remains unresolved. Raw bundle
dates/property must match available frozen context. Legacy missing property binds
no new identity and retains property_scope. Read-only ga4_context contains only
recorded request/property provenance, header names and normalized provider metadata.
content_coverage and existing multi_job_coverage remain decisions; rows and Jobs
are never merged, deduplicated or rewritten. No draft writes occur.

TDD: initial RED 0/14 before production changes, exposing unsupported inspection
and missing requirements-input support. First implementation GREEN 14/14; the
fresh regression run also passed 14/14. One existing Ads/GSC regression initially
failed 12/13 because it used GA4 as its unsupported-source example; changing that
example to unknown-source restored 13/13 without weakening empty-evidence checks.
Shared fixtures now use actual synthetic Content bundle shape/context. All seven
families are inspected, but explicit source/semantic gaps still block real COMPLETE.

Fresh verification used Node 24.19.0 on PATH. Each path below was invoked as
`bash tests/integration/<path>`:

| Path / command | Result |
| --- | --- |
| blog-writing-packs/run-blog-v2-ga4-compliance-test.sh | 14/14 PASS |
| blog-writing-packs/run-blog-v2-serp-compliance-test.sh | 14/14 PASS |
| blog-writing-packs/run-blog-v2-readiness-test.sh | 10/10 PASS |
| blog-writing-packs/run-blog-v2-selection-test.sh | 7/7 PASS |
| blog-writing-packs/run-blog-v2-draft-test.sh | 8/8 PASS |
| blog-writing-packs/run-blog-v2-field-compliance-test.sh | 13/13 PASS after stale unsupported-source fixture correction |
| blog-writing-packs/run-blog-v2-keyword-planner-compliance-test.sh | 14/14 PASS |
| blog-writing-packs/run-blog-v2-ikas-compliance-test.sh | 13/13 PASS |
| blog-writing-packs/run-blog-v2-sitemap-compliance-test.sh | 12/12 PASS |
| google-analytics-4/run-google-analytics-4-gate.sh parser | GA4-PARSER-001 PASS |
| google-analytics-4/run-google-analytics-4-gate.sh request | GA4-REQUEST-001 PASS |
| google-analytics-4/run-google-analytics-4-gate.sh source-runtime | GA4-SOURCE-RUNTIME-001 PASS |
| google-analytics-4/run-google-analytics-4-gate.sh validation | GA4-VALIDATION-001 PASS |
| blog-writing-packs/run-blog-writing-pack-gate.sh | Full deterministic v1 gate PASS, including desktop smoke |
| export/run-production-data-package-loader-test.sh | PRODUCTION-DATA-PACKAGE-001 PASS |
| npx tsc --noEmit | PASS |
| npm run lint | PASS |
| bash -n tests/integration/blog-writing-packs/run-blog-v2-ga4-compliance-test.sh | PASS |
| git diff --check | PASS |

Independent focused read-only review found no important issues. The other six
family checks and v1 interfaces remain compatible. Source-native original metadata
and raw provider pages are retained; no business data was added to fixtures.
Real accepted-artifact/provider acceptance still requires separate authorization
and does not follow from these fixture gates. Delivery remains NOT_EVALUATED.

Separate approval is needed for users meaning (including whether to acquire
totalUsers), the engagement-time numerator/denominator and units, exact Blog
window, property/page/population completeness and legacy unbound-property handling.
Only after those decisions should a separate source change add the required
request metrics/expressions, normalized fields, exact validation headers and tests.
No such acquisition change, production access, provider API request, export,
publication, migration, Core/UI change, commit or push occurred in this slice.

## Follow-up — placeholder correction and conditional checkpoint

Authority: user's focused GA4 placeholder fix plus conditional SERP/GA4 Git checkpoint.
Confirmed defect: `(not set)` survives source normalization but is counted as an
identified landing page because presence/non-null alone establishes OBSERVED.

Plan:
1. Add RED regressions for placeholder-only and mixed rows with exact raw/normalized
   preservation and explicit landing_page blocker assertions. Retain legitimate-path,
   blank/null/missing and Paid Funnel behavior; prove another source's same literal
   is not reinterpreted.
2. Mark unresolved observations in the GA4 inspector and let the existing shared
   helper exclude those observations from identified counts with a small source-neutral
   hook. Preserve values, rows, source validation, acquisition and existing policies.
3. Observe GREEN, then run all requested deterministic source/Blog/loader/static
   gates. Stop on a relevant verification failure or blocking review finding.
4. Review every candidate file and staged content, preserve reports/hashes, and
   conditionally commit/push only the approved feature branch without force/merge.

Verified correction: the source-local inspector now marks `(not set)` as an
unresolved observation without rewriting any raw/normalized value. The shared
helper excludes marked observations from observed_count and retains UNRESOLVED
field status, using no GA4 literal or provider policy. Existing evaluator handling
produces FIELD_OBSERVATION_REQUIRED; its generic condition text now covers mixed
evidence rather than incorrectly saying that no rows establish observations.
No public field type, Core abstraction, source validation or acquisition changed.

RED was 16/18, with the two new count regressions failing 1 versus 0 and 2 versus 1.
GREEN is 18/18. Tests prove exact normalized-row equality with the unchanged source
normalizer, exact raw artifact bytes, unchanged draft membership and row order,
zero identified pages for a placeholder-only selection, one identified page for
placeholder plus `/blog/example`, and explicit blockers for both. Blank/null/missing
behavior, legitimate paths, Paid Funnel separation and another source's identical
literal remain covered. Mixed sets do not establish full page/website coverage.

Fresh conditional-checkpoint verification reran every command in the preceding
GA4 verification table after the fix: GA4 compliance is now 18/18; all other counts
and gate results remain PASS. It additionally ran both existing SERP source gates:
`bash tests/integration/serpapi/run-serpapi-source-test.sh` (SERPAPI-001 PASS) and
`bash tests/integration/serpapi/run-serpapi-reviewed-on-demand-test.sh` (1/1 PASS).
Both new shell runners passed `bash -n`. The independent focused review of the
correction and combined SERP/GA4 production diff found no blocking issue.

Checkpoint scope is the 19 directly related source/test/contract/plan files.
They share readiness/helper/types/fixtures, so one coherent commit is appropriate;
no artificial intermediate implementation is introduced. Reports remain excluded.
All fixtures are synthetic. No live-provider, packaged-runtime or delivery acceptance
is inferred. Unresolved users/time, reporting, property/coverage and SERP decisions
remain blockers; this correction does not approve them.
