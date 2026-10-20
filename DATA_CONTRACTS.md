# RoofRoom Data Collector — Data Contracts

**Status:** Canonical contracts reconciled with schema v8 and current source/package contracts
**Scope:** Persisted IDs/states, null semantics, provenance, source-native meaning, and package evidence rules

---

## 1. Contract principles

1. Preserve source meaning.
2. Missing is not zero.
3. Raw evidence is immutable whenever practical.
4. Requested and observed context remain distinct.
5. Execution and validation are separate domains.
6. Source, dataset, source mode, and acquisition mode are separate.
7. Stable machine IDs and human labels are different concerns.
8. Documentation does not perform a migration.

---

## 2. Serialization

Persisted JSON/database fields use `snake_case`.

Dates:

```text
YYYY-MM-DD
```

Persisted timestamps:

```text
UTC ISO 8601 ending in Z
```

Provider-native calendar dates remain dates unless the provider contract proves otherwise.

---

## 3. Current source identities

Implemented source/module identities include:

| `source_id` | Acquisition | Main dataset(s) |
|---|---|---|
| `google-trends` | `BROWSER_EXPORT` | `INTEREST_OVER_TIME` |
| `google-search-console-query` | `OFFICIAL_API` | `QUERY` |
| `google-search-console-query-page` | `OFFICIAL_API` | `QUERY_PAGE` |
| `google-ads-search-terms` | `OFFICIAL_API` | `SEARCH_TERMS` |
| `google-ads-search-reporting` | `OFFICIAL_API` | six SEARCH reporting datasets |
| `google-keyword-planner` | `OFFICIAL_API` | `KEYWORD_HISTORICAL_METRICS` |
| `google-keyword-planner-csv` | `FILE_IMPORT` | `KEYWORD_HISTORICAL_METRICS` |
| `ikas-products` | `FILE_IMPORT` | `PRODUCTS` |
| `bitkimark-sitemap` | `HTTP_XML` | `SITEMAP_URLS` |
| `serpapi` | `THIRD_PARTY_API` | `GOOGLE_SERP` |

Google Trends query-group IDs match the live implementation contract and remain GT-specific.

Current Run IDs:

```text
rr_<UTC timestamp>_<6 lowercase hex>
```

Current Workspace IDs:

```text
ws_<UTC timestamp>_<6 lowercase hex>
```

---

## 4. Current persisted statuses

### Run

```text
PENDING
RUNNING
MANUAL_ACTION_REQUIRED
RETRY_REQUIRED
COMPLETED
COMPLETED_WITH_WARNINGS
FAILED
CANCELLED
```

### Execution

```text
PENDING
RUNNING
VALIDATING
COMPLETED
FAILED
CANCELLED
MANUAL_ACTION_REQUIRED
RETRY_PENDING
```

### Validation

```text
NOT_RUN
VALID
LOW_DATA
NO_DATA
INVALID_SCHEMA
ERROR_NOT_DATA
DATE_MISMATCH
QUERY_MISMATCH
```

Operational auth/config/quota/provider/import failures are not automatically validation statuses.

---

## 5. Readiness and freshness domains

Source readiness and desktop remediation are separate from freshness.

Safe readiness may represent states such as ready, configuration required, connection required, file required, manual action required, unavailable, or error according to the implemented boundary.

Freshness is source-neutral and conceptually includes:

```text
FRESH
DUE
STALE
IMPORT_NEEDED
ON_DEMAND
UNKNOWN
```

Do not collapse readiness, freshness, execution, and validation into one state.

---

## 6. Workspace / Run / Job / Attempt

```text
Workspace
└── Run
    └── Job
        ├── Attempt 1
        └── Attempt N
```

### Workspace

Stores first-class brand/business identity.

### Run

Requires `workspace_id`.

May contain Jobs from multiple sources.

One Workspace may have at most one active Run in the implemented active-status set.

### Job

Independent execution/resume/retry unit.

Identity within a Run:

```text
source_id + job_key
```

`query_group_id` is nullable and GT/legacy-specific.

Non-GT Jobs use no fake query group.

### Attempt

Immutable execution history.

Retry creates a new Attempt and preserves previous attempts/artifacts/validations/error evidence.

---

## 7. Artifact contract

Current kinds include:

```text
RAW_SOURCE_FILE
METADATA_JSON
VALIDATION_JSON
NORMALIZED_CSV
EXPORT_XLSX
LOG_FILE
```

Current states:

```text
CANDIDATE
ACCEPTED
ACCEPTED_WITH_WARNING
REJECTED
SUPERSEDED
```

Artifact provenance includes Run/Job/Attempt/source identity, path, media type, byte size, SHA-256 where available, and timestamps.

Raw evidence is never rewritten into normalized output.

---

## 8. SQLite boundary

Current schema version:

```text
8
```

Implemented tables:

```text
schema_migrations
workspaces
runs
jobs
attempts
artifacts
validations
saved_collection_presets
workspace_last_run_settings
workspace_source_connections
```

There is no general analytical warehouse.

Credential secrets remain outside SQLite.

Freshness is derived from accepted completed Job history.

---

## 9. Evidence lifecycle

```text
provider/file bytes
→ RAW_SOURCE_FILE / CANDIDATE
→ parse
→ source validation
→ ACCEPTED | ACCEPTED_WITH_WARNING | REJECTED
→ optional deterministic normalization
→ metadata / validation / package / export artifacts
```

Rejected raw evidence remains preserved when practical.

Only eligible accepted evidence enters normal packages/exports.

---

## 10. Provenance baseline

Accepted evidence must remain traceable to relevant:

```text
workspace_id
run_id
job_id
attempt
source_id
source_mode
dataset_type
acquisition mode
raw_artifact_id
raw_relative_path
byte_size / sha256 where available
retrieved_at / imported_at
validation_status
requested context
observed context where proven
application/schema version
```

Provider-specific provenance may add fields required by that source.

Do not force unrelated provider metadata into a generic record.

---

## 11. Requested versus observed

Examples:

```text
requested dates      / observed dates
requested dimensions / returned dimensions
requested country    / observed country
requested mode       / observed mode
requested device     / observed device
```

Requested values must not populate observed fields without provider evidence.

Unavailable observed values remain missing.

---

## 12. Missing and numeric semantics

Canonical missing representations:

```text
JSON   → null or absent optional field
SQLite → NULL
CSV    → blank
XLSX   → empty cell
```

True numeric zero remains zero only when actually returned or deterministically derived under an approved contract.

Do not turn parse failures, blanks, withheld values, absent stock, or unavailable provider metrics into zero.

Provider-native units remain explicit.

---

## 13. Source-native semantics

### Google Trends

`relative_interest` is provider-native 0–100 relative interest.

Comparison-group context remains part of identity/meaning.

Do not convert it to absolute search counts.

### Google Search Console

Keep `QUERY` and `QUERY_PAGE` contracts distinct.

GSC country scope provenance: Newly reviewed `google-search-console-query` and `google-search-console-query-page` executions freeze `country_filter: "TUR"` in the resolved source configuration and each planned Job `source_context`. The provider request uses the corresponding native `country` dimension filter without changing dataset dimensions. Historical Jobs without `source_context.country_filter` remain unfiltered; absence must not be interpreted as `"TUR"` or as a measured value. Unsupported explicit country values are invalid. The reviewed request scope and raw provider responses remain separately traceable.

Preserve clicks, impressions, CTR, position, dimensions, property/search-type/date context, raw response pages, and provider limitations.

#### Query × Page finality evidence boundary

Google documents inclusive Pacific-time request dates and finalized returned data
for `dataState=final` or omission. `first_incomplete_date` is documented for
`dataState=all` with date grouping when the range contains incomplete points;
dates without data are omitted. See the [Search Analytics query reference](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).
Query/page grouping can drop data; see [Google's data limitations](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data).

These guarantees do not independently establish the latest eligible 28-day
interval or complete daily coverage. Absence of `first_incomplete_date` is not
coverage proof. Query × Page requests keep query/page dimensions, use the supported
`web` search type explicitly, and preserve full raw response pages. They continue
to omit `dataState`; that default guarantee is distinct from an explicitly captured
request mode. Historical missing property/type/date evidence is never backfilled.

**Approved conservative date coverage:** a separate date-grouped request must use
`dataState=final` for the same selected property, search type and exact 28-day
window. Every one of the 28 consecutive calendar dates must actually appear in
provider-returned date keys. Missing dates remain unresolved coverage blockers,
including dates with possible zero traffic; requested endpoints never become
observed dates. This establishes observed date presence, not complete website
reporting or complete Query × Page rows. Query × Page observations remain separate.

New source collections with an explicit frozen `site_url` and exactly 28 requested
dates acquire a companion final/date response in the same Attempt. The supported
search type is `web`; unsupported explicit types fail before acquisition. The
companion keeps the same optional country scope, requested property/type/endpoints/
state/grouping, unmodified response body and collector-observed UTC response receipt.
The existing native Attempt metadata stores it as
`acquisition_metadata.gsc_date_coverage`, separate from the Query × Page raw array.
Its envelope binds Run, Job, Attempt, frozen context and raw artifact identity.

Accepted loading checks this envelope and response shape. New drafts freeze the
metadata's Attempt/path/SHA-256/byte-size reference in optional `gsc_date_coverage`;
readiness and publication reverify it without attaching later evidence to older
drafts. Supporting metadata is copied byte-exactly through the existing publication
metadata mechanism if publication otherwise becomes eligible. There is no join to
another Run or automatic evidence selection. Legacy absence stays absence.

Source-owned inspection reports actual observed/missing dates, property/type/window/
country mismatch, or missing evidence; invalid state/grouping/date/receipt or
contradictory incomplete metadata is rejected. Native Query × Page validity remains
distinct from Blog coverage: sparse date responses can be valid provider evidence
and still block Blog readiness. A receipt after the evaluation instant also blocks.
Unbound or non-28-day Jobs retain their acquisition behavior without new date proof.
Supported desktop Query × Page Quick Runs require an explicit property selection
from the safe Workspace connection view. The selector starts blank, Review is
unavailable until selection, and a changed selection invalidates Review. Review
and Start reject missing, invalid, changed, or conflicting property identities;
the exact selected `site_url` is frozen in each Query × Page Job and is used by
both the Query × Page request and its companion date request. URL-prefix paths
and `sc-domain:` identities are not rewritten. Desktop Query × Page Jobs cannot
fall back to the active connection when their frozen property is absent. Taskless
legacy Jobs retain their prior configured-property compatibility, without gaining
a fabricated property observation or Blog coverage proof. Query-only Job behavior
is unchanged.

Blog v2's mandatory `gsc_finality` blocker and
`publication_time_context.finality: NOT_ESTABLISHED` describe the unresolved
**whole reporting-window eligibility**, not unknown finality of returned values.
Exact approved 28-day endpoints alone cannot clear this blocker. Publication
reevaluates it at the actual package UTC timestamp without replacing selected
evidence. Elapsed time cannot supply missing evidence; finalized observations
remain finalized, while an older cutoff may cease to establish the latest interval.

The remaining evidence-policy decision is how the selected interval is established
as the **latest eligible** one at actual package creation. Historical complete
date evidence does not establish that claim. No finalization lag, assumed
availability date, cutoff lifetime or probe freshness threshold is approved.
The Query × Page row-loss limitation remains explicit; date evidence does not
resolve it. Missing support remains blocked; 30-day aggregates cannot be reduced
into unsupported 28-day observations.

### Google Ads SEARCH reporting

Approved SEARCH-only datasets:

```text
CAMPAIGN_PERFORMANCE
AD_GROUP_PERFORMANCE
KEYWORD_PERFORMANCE
SEARCH_TERMS
AD_PERFORMANCE
RSA_ASSET_PERFORMANCE
```

Preserve dataset/resource identity, provider-native units, date/segment context, and raw SearchStream evidence.

Existing `google-ads-search-reporting` tasks acquire dataset schema v2 by default. Historical schema v1 Job contexts remain readable for preserved evidence, but current provider reacquisition must not run under a v1 context. The separate Google Ads — Conversion-Date Performance task explicitly acquires schema v3 only for `CAMPAIGN_PERFORMANCE`, `AD_GROUP_PERFORMANCE`, and `KEYWORD_PERFORMANCE`; other v3 dataset selections fail before provider access.

For `CAMPAIGN_PERFORMANCE`, `AD_GROUP_PERFORMANCE`, and `KEYWORD_PERFORMANCE`, schema v2 additionally preserves provider-native:

- `conversions_from_interactions_rate`
- `cost_per_conversion`
- `conversions_value_per_cost`
- `search_top_impression_share`
- `search_absolute_top_impression_share`

`search_top_impression_share` and `search_absolute_top_impression_share` remain distinct from `top_impression_percentage` and `absolute_top_impression_percentage`.

`cost_per_conversion` preserves the provider field as a numeric value and is not renamed into the `_micros` canonical field family.

Schema v3 retains all standard v2 conversion fields and adds four distinct provider-native numeric fields: `conversions_by_conversion_date`, `conversions_value_by_conversion_date`, `all_conversions_by_conversion_date`, and `all_conversions_value_by_conversion_date`. A provider `null` remains null and a true zero remains zero. A missing selected v3 metric fails validation rather than becoming zero. Raw SearchStream artifacts and immutable Job context preserve the source, account, exact requested dates, and schema version. Accepted v3 rows remain available through the Production Data Package loader; they do not satisfy `ADS_OPTIMIZATION_PACK v2` schema-v2 requirements.

The conversion-date desktop task fixes the three v3 datasets and uses the existing Google Ads reporting connection. Review resolves the connected customer ID and exact dates into its Job plans without changing reusable configuration. Start rejects a changed account. A selection that attempts colliding v2/v3 Jobs under the same `source_id + job_key` is blocked before Run creation.

Legacy `google-ads-search-terms` remains compatible.

The dedicated `google-ads-search-terms` query additionally selects native
`customer.id` and `customer.time_zone` with its existing SEARCH fields and exact
absolute date endpoints. The shared `google-ads-search-reporting` Search Terms
descriptor retains its existing query. This adds no account lookup, calendar
default or reconstructed provider observation. The source retains returned
`customer.id` / `customer.timeZone` in its raw SearchStream artifact; existing
storage and Artifact SHA-256/size, Run/Job/Attempt/Validation identity and frozen
Blog membership bind that observation. No additional acquisition sidecar is needed.

When a Job explicitly freezes `customer_id`, collection already requires it to
match the active Workspace connection. Native validation of nonempty account-bound
responses also requires matching provider account identity and valid, consistent
timezone evidence through the source-owned account inspector. Empty results retain
NO_DATA without inventing account/timezone observations. Legacy Jobs with no
frozen selection retain their existing validation/read behavior and are not
retroactively bound. Native validation is not a Blog reporting-window verdict.
At publication, the Ads inspector requires observed account identity to agree
with that frozen selection and a valid, consistent provider timezone. Missing
metadata, missing explicit selection and conflicting observations block. Legacy
Jobs/artifacts remain readable without assigning account/timezone retroactively.
Only native SearchStream rows establish this metadata; arbitrary customer fields
attached to legacy flat rows do not create supported account observations.
Desktop Search Terms task detail provides an initially blank account selector using
the existing safe Workspace account view. The user explicitly selects the customer;
the connected account only supplies an available choice and never fills request
identity. Quick Run, preset/generic planning and Start require explicit numeric
`customer_id` in source configuration and freeze it in every new Search Terms Job.
Provided per-Job accounts must agree before managed Jobs are reconstructed. Review
and Start verify the supplied account against the Workspace connection, including
unchanged reusable/resolved account scope. Missing/invalid/conflicting selections
block new Job creation; no account is copied from a prior Job or provider response.
Stored presets with explicit selection retain it; older unbound configurations
must receive an explicit selection. Source execution uses the frozen Job customer
and retains its existing changed-connection guard. Historical Jobs are unchanged.
Existing 7/14/17/30-day desktop date policies are unchanged; only exact last-30-day
account-calendar evidence can satisfy the independent Blog publication check.

`publication_time_context` keeps requested account/endpoints marked
`FROZEN_JOB_CONTEXT`, provider customer IDs, original timezone names and actual
performance dates separately. Its canonical `time_zone` and expected `start_date`
/ `end_date` derive from the explicit PACKAGE_CREATED_AT UTC reference in that
account timezone: yesterday through thirty calendar dates before today inclusive.
Calendar-date arithmetic crosses DST independently of elapsed day length. Exact
requested endpoint equality and observed-date bounds are checked independently.
Only actual dated rows appear in `observed_performance_dates`; sparse/missing
dates are never expanded to zero-activity observations or claimed complete daily
coverage. Raw source bytes and normalized performance mappings are unchanged.

Performance Max is outside this contract.

### Google Ads configuration — Negatives v1

`google-ads-configuration` is an `OFFICIAL_API` current-configuration snapshot source.

Approved dataset schema v1 datasets are exactly:

- `CAMPAIGN_NEGATIVE_KEYWORDS`
- `AD_GROUP_NEGATIVE_KEYWORDS`
- `SHARED_NEGATIVE_KEYWORDS`
- `CAMPAIGN_NEGATIVE_KEYWORD_LISTS`
- `ACCOUNT_NEGATIVE_KEYWORD_LISTS`

The immutable Job context contains exactly source identity, dataset type, provider resource mode, customer ID, and `dataset_schema_version: 1`. This source is not date-windowed and does not support custom date ranges.

The adopted v1 boundary is keyword negatives only. Campaign-direct and ad-group-direct negatives preserve provider criterion identity and require SEARCH campaign scope, provider criterion type `KEYWORD`, and `negative: true`. Shared negative keyword members remain separate shared-criterion evidence. Campaign-list and account-list attachments remain separate provider attachment evidence.

Direct criteria, shared members, campaign-list attachments, and account-list attachments are independent evidence datasets. Do not reconstruct one dataset from another. In particular, an account attachment does not prove or reconstruct the members of its referenced shared set.

Raw Google Ads SearchStream response bytes remain authoritative. Provider identities and provider-native status/type values remain evidence; `REMOVED` is preserved. Optional unavailable provider fields normalize to `null`, never empty strings, zero, or synthetic values.

A structurally valid SearchStream response that normalizes to zero rows may validate as `NO_DATA`. Malformed envelopes or semantic normalization failures fail closed and must not be converted into `NO_DATA`. Missing remains distinct from zero.

This source reuses the existing canonical Google Ads Workspace connection and authenticated requester. It does not create a separate `google-ads-configuration` credential or connection record.

Negatives v1 is not part of an adopted package, preset, analysis, recommendation, or export recipe contract.


### Google Ads configuration — Campaign Settings v1

Campaign Settings v1 adds these provider-native snapshot datasets:

- `CAMPAIGN_SETTINGS`
- `CAMPAIGN_BUDGETS`
- `CAMPAIGN_TARGETING_CRITERIA`

They remain under the existing Google Ads configuration source and Workspace Google Ads connection boundary.

CAMPAIGN_SETTINGS grain: one row per Campaign resource.

Scope is Search-only where required by the provider contract.

Preserved provider-native evidence includes campaign identity, status, advertising channel type, keyword match type, bidding configuration, network settings, geo routing, and returned AI Max-related fields.

CAMPAIGN_BUDGETS grain: one row per CampaignBudget resource.

Budget evidence preserves amount micros, delivery method, explicit shared state, reference count, and provider-native resource relationships.

CAMPAIGN_TARGETING_CRITERIA grain: one row per CampaignCriterion resource.

Accepted targeting types:
- LOCATION
- LANGUAGE
- DEVICE
- AD_SCHEDULE

Targeting evidence preserves provider-native criterion identity, negative LOCATION evidence, observed LOCATION references, resolver provenance, and lossless raw evidence bundle contents.

Human-readable geo fields require provider resolver evidence.

Missing raw evidence, malformed evidence bundles, and reconstructed evidence are not accepted.

REMOVED snapshots remain historical provider observations. No effective-current state is synthesized.

### Google Ads configuration — Conversion Configuration v1

`google-ads-configuration` also owns six provider-native Conversion Configuration schema-v1 snapshot datasets:

- `CONVERSION_ACTIONS` → `CONVERSION_ACTION`
- `CUSTOMER_CONVERSION_GOALS` → `CUSTOMER_CONVERSION_GOAL`
- `CONVERSION_GOAL_CAMPAIGN_CONFIGS` → `CONVERSION_GOAL_CAMPAIGN_CONFIG`
- `CAMPAIGN_CONVERSION_GOALS` → `CAMPAIGN_CONVERSION_GOAL`
- `CUSTOM_CONVERSION_GOALS` → `CUSTOM_CONVERSION_GOAL`
- `CUSTOMER_CONVERSION_TRACKING_SETTINGS` → `CUSTOMER`

Together with the five Negatives v1 datasets, the current `google-ads-configuration` family contains exactly eleven independent dataset types.

Conversion Configuration v1 is a current-configuration snapshot contract. It has no requested date window and keeps `supports_custom_date_range: false`.

Raw Google Ads SearchStream response bytes remain authoritative. Normalized rows preserve provider resource identity, lifecycle/status values, real `false` and zero values, and nullable optional evidence without fabricating replacements.

`CONVERSION_ACTIONS` preserves provider-native action identity, status/type/category/origin, ownership, counting and goal flags, lookback settings, attribution settings, default value/currency settings, and Google Analytics 4 linkage where returned. `include_in_conversions_metric` is preserved only as legacy provider evidence; RoofRoom does not reinterpret it as a current effective-goal decision.

`CUSTOM_CONVERSION_GOALS.conversion_action_resource_names` preserves provider-returned membership exactly. A provider-returned empty array remains `[]`; missing or unproven membership must not be normalized into an empty array.

Requested `customer_id` is immutable request context and must not be copied into observed ownership or conversion-customer fields without provider evidence.

RoofRoom does not derive an effective campaign conversion-goal model from these datasets. It does not infer goal precedence, bidding behavior, or optimization intent.

Conversion Configuration v1 is not part of an adopted package, preset, analysis, recommendation, or export recipe contract.

The family reuses the existing canonical Google Ads Workspace connection and authenticated requester. It does not add a configuration-specific credential, connection type, or Developer Token requirement.

### Keyword Planner

Preserve provider-native monthly history.

For API evidence, `change_3_month` and `change_yoy` may be deterministic RoofRoom-derived fields under the locked month-comparison rules.

They remain null if required evidence is missing or baseline is zero.

Do not widen provider requests merely to manufacture YoY.

For manual CSV, provider-exported change fields remain source-native imported evidence.

### İkas

Preserve original XLSX and exact evidence-backed field mapping.

Blank sale price/stock remain missing.

Do not create storefront URLs when unavailable.

### Bitkimark

Preserve request/response metadata, raw XML, sitemap relationships, `loc`, nullable `lastmod`.

### SERP

Preserve request context, raw JSON/provider metadata, organic result evidence, and provider-returned features.

Do not add analysis/recommendation fields.

---

## 14. Workspace configuration contracts

Saved Collection Presets and Last Run Settings are Workspace-owned reusable configuration.

A reviewed Run persists its own immutable resolved snapshot.

Run reservation and Last Run Settings update are atomic under the implemented contract.

Workspace source connections store only safe metadata and opaque credential references.

Secret material remains behind the credential-store boundary.

---

## 15. Package contracts

### Production Data Package

Indexes accepted source datasets separately and preserves exact Run/Job/source/artifact/checksum/request provenance.

No cross-source row join is implied.

The primary general Collector export delivers collected provider evidence. It is
independent of specialized Blog v2 field meanings, mandatory source families,
marketing periods and analytical coverage. Historical approved Blog requirements
remain authoritative for Blog packages; they do not govern this general export.

The general desktop path adds `raw/` and `RAW_EVIDENCE.json` (schema version 1)
alongside the existing `MANIFEST.json`, `FAILURES.json`, `DATASETS.json`, normalized
dataset JSON and applicable Keyword Planner companion files. Existing normalized
and specialized package writer contracts are unchanged. Raw files copy the exact
accepted Artifact bytes, retaining the recorded native filename/extension and
media type; no response is regenerated from normalized rows.

Each raw index entry records a safe package-relative path, actual byte size and
SHA-256, Workspace/Run/Source/Dataset/Job/Attempt/Artifact/Validation identities,
accepted validation status and artifact acquisition time. Dataset identity comes
from frozen source context or the existing native normalizer; unavailable identity
stays null. Requested and existing acquisition contexts are sanitized collector
metadata, separate from raw response bytes. Existing observed receipt timestamps
are preserved when present; artifact acquisition time never supplies a missing
response receipt. The original Attempt metadata hash is recorded when available,
but sanitized context is not claimed to be a byte-exact metadata-file copy.
Credentials, authorization/cookies/session secrets and unrestricted import paths
are excluded from exported context; analytics `session_filter` is retained.

Only completed Jobs with actual VALID/LOW_DATA/NO_DATA accepted raw artifacts and
matching persisted completed Attempt/Validation associations can produce raw
files. Existing metadata, when present, must bind that same evidence. Missing
legacy acquisition context stays null. Corrupt, missing, unaccepted or mismatched
raw evidence fails the export. Missing optional normalization instead records
`normalization_status: UNAVAILABLE` and omits normalized rows without inventing
them. The index separately records every Job's execution/validation outcome and
Attempt identities/error codes, including failures and unfinished/cancelled work;
no missing raw file or zero row is manufactured. `SUCCESSFUL_ONLY` keeps its
existing normalized failure-list behavior; the raw index retains actual outcomes.

The desktop export result reports delivered raw file count first, with optional
normalized dataset file count separately (`dataset_count` remains its compatibility
alias). Failed/cancelled Job and unavailable raw evidence counts reflect the whole
Run in both export modes. Missing optional normalization never counts as missing
raw evidence. Accepted `NO_DATA` and `LOW_DATA` files remain actual delivered files
and are counted separately. Successful filesystem publication is distinct from
collection completeness: a terminal Run with unavailable evidence or a status other
than completed/completed-with-warnings is incomplete; accepted empty/low-data or
persisted completion warnings remain warnings. Legacy results without raw counts
display their count as unavailable, rather than reporting a fabricated zero.

General desktop export still requires a terminal Run. New raw companions are
published through private staging, exclusive file creation, copy hash/size readback,
reservation and rename. Unsafe paths/symlinks and existing output targets are
rejected. Failure before commit removes staging; reservation cleanup failure after
a verified commit does not falsely report export failure. Accepted files and
Attempts are never modified. No source acquisition, Blog rule, migration or new
package architecture is introduced by this additive path.

### `ADS_OPTIMIZATION_PACK v2`

Active recipe version is 2 and requires exactly the six approved Google Ads SEARCH reporting datasets at dataset schema v2.

Historical recipe/schema v1 packages remain readable. They are not compatible CURRENT evidence or PREVIOUS baselines for the active v2 recipe.

Task Package manifest format remains `manifest_version: 1`. Supported recipe/schema pairs are exactly `1/1` and `2/2`; mixed pairs fail closed.

Current window semantics are code-defined and exact.

Evidence reuse is permitted only when compatibility is proven.

A broader populated DAILY artifact may be filtered only using real date rows.

A broader `NO_DATA` result cannot prove a narrower window.

PREVIOUS comes from a verified immutable prior package, never from reconstruction.

No interpolation, subtraction, averaging, allocation, or historical configuration backfill may manufacture evidence.

Package manifests/tables/workbooks are derived outputs; raw artifacts remain canonical.

### `BLOG_WRITING_PACK v1`

Fixed logical families:

```text
INTEREST_OVER_TIME
QUERY_PAGE
SEARCH_TERMS
KEYWORD_HISTORICAL_METRICS
PRODUCTS
SITEMAP_URLS
GOOGLE_SERP
```

Out-of-recipe evidence is excluded before loading.

Zero accepted in-recipe datasets is `NOT_READY`.

Otherwise coverage is truthful per family; overall package is complete only when every expected family is covered.

Verified `NO_DATA` may satisfy coverage without fabricated rows.

Keyword Planner API/manual provenance remains distinct.

Blog packaging is local-only and creates no provider call, retry, Attempt, Run/Job transition, or schema migration.

### `BLOG_WRITING_PACK v2` approved delivery requirements (2026-10-17)

Authority: the user's approved-contract consolidation request. These requirements
define intended Blog v2 delivery semantics; approval is not evidence of source
support, implementation, deterministic verification, or real-provider acceptance.
They supplement the existing approved multi-Run selection/draft contract below.
The repository records that design through the draft/readiness contracts and
completed slice plans; no standalone Blog v2 design file is present at this checkpoint.
Blog v1, Ads Growth and other package/source contracts remain unchanged.

#### Approved source requirements

1. **Google Ads Search Terms:** require the last **30 completed calendar days**
   in the Ads account timezone. Preserve exact requested start/end dates and actual
   observed performance dates separately. Missing days never imply activity or
   synthetic zero rows.
2. **Google Search Console Query × Page:** require the last **28 consecutive days
   whose finality is supported by actual GSC evidence**. Do not invent a fixed
   finalization lag. Preserve exact request dates and supporting finality evidence.
   Existing 30-day aggregate evidence cannot be reconstructed into 28-day evidence.
   The source-owned conservative date-coverage rule above requires separately
   preserved final/date observations for all 28 dates; latest-interval eligibility
   at publication remains independently blocked.
3. **Keyword Planner:** require actual monthly observations for the last
   **12 completed calendar months**. Preserve additional current-month evidence
   only when Google actually provides it, and
   label any available partial-month observation separately. Current-month absence
   does not invalidate supported evidence for the 12 completed months. Never invent
   monthly history from `average_monthly_searches`. Preserve requested versus
   returned keywords, native competition semantics (category versus index), actual
   currency context and bid units (API micros versus manual currency units).
4. **İkas Products:** keep product and variant identity separate; `variant_id`
   never substitutes for `product_id`. Preserve all provider-observed categories.
   A singular `category` is allowed only when uniquely observed or explicitly
   designated primary by the provider. Blog `price` means **verified current sale
   price**. Preserve list price, sale price and variant-level prices separately;
   never choose an arbitrary variant price. Preserve actual provider currency
   context. `availability`, `stock_status` and `product_status` have separate
   meanings; do not derive one from another without an approved provider-supported
   rule. These definitions do not establish such a rule or prove import support.
5. **Sitemap URLs:** `url` comes from observed Sitemap `loc`. `page_type` requires
   observed evidence or a separately approved deterministic mapping; URL patterns
   alone do not approve classifications. `title` requires an observed HTML page
   title. `status` requires that individual page's observed HTTP response status;
   sitemap-document fetch status is not page status. Additional controlled page
   evidence acquisition is approved **in principle only**. Its implementation and
   live execution are outside this task and require a separate scope.
6. **Google SERP snapshot:** `query` is the request dimension verified by the
   provider. `capture_date` is the date derived from actual RoofRoom response
   acquisition time; preserve its original UTC timestamp and keep distinct provider
   timestamps separate. A requested snapshot date does not establish capture time.
   `position` is the provider's **organic position**, never absolute mixed-result
   SERP rank. Preserve provider-observed URLs and titles. `domain` may be derived
   deterministically from an observed URL with explicit derived provenance. Use
   the existing **Google / TR / tr / desktop / first-ten organic results** profile;
   PAA evidence remains separate. Required queries must be explicitly selected,
   never automatically generated. Accepted SERP evidence must be **no more than
   7 days old at package creation**, checked against actual acquisition time.
7. **GA4 Content Performance:** require the last **28 completed calendar days**
   in the explicitly selected GA4 property's timezone. Blog `users` means actual
   GA4 `totalUsers`; `activeUsers` cannot substitute. `average_engagement_time`
   means **engagement seconds per session**, derived as
   `userEngagementDuration / sessions` only when both provider metrics are present
   and `sessions > 0`. Otherwise use null with appropriate evidence and compliance
   semantics; null must not disguise missing provider capability or observations.
   This expression is derived, never a raw GA4 metric. Preserve `keyEvents`,
   `engagedSessions`, `engagementRate` and `sessions` in their native meanings.
   Preserve **all actually returned landing-page rows across complete verified
   pagination**, with no arbitrary top-N limit. Do not invent missing pages or
   zero traffic. Preserve `(not set)` as provider-native evidence while excluding
   it from identified landing pages. Complete returned-row coverage does not prove
   coverage of pages the provider did not return.

Exact dates, timezones, query selections and field observations must remain
traceable to real selected evidence. Calendar policies do not authorize filling
historical request context, changing immutable membership or retargeting evidence.
The SERP acquisition-date basis is approved; no additional display timezone or
provider timestamp substitution is implied.

#### Resolution of earlier contracts and slice-era decisions

These decisions take precedence for Blog v2 over conflicting earlier guidance.
The following identifies the exact conflicts; completed plans remain historical
implementation/verification records rather than being rewritten as new acceptance.

| Earlier authority / assumption | Approved resolution and remaining implementation boundary |
| --- | --- |
| Ads/GSC Slice 3B.2A and readiness: Ads duration unspecified; GSC only exact supplied 28-day endpoints checked | Ads is 30 completed account-timezone days; GSC is 28 consecutive evidence-final days. Existing endpoint equality is insufficient to prove either new policy. |
| Keyword Planner Slice 3B.2B.1: Blog historical duration unapproved and not inherited from acquisition/Ads Growth | Blog independently approves 12 completed months, with separately labeled provider-returned current-month evidence. Actual monthly coverage, keyword completeness and currency still require evidence. |
| İkas Slice 3B.2B.2: category and Blog price meaning unresolved | All observed categories must survive; singular category has the uniqueness/provider-primary rule; Blog price is verified current sale price. Existing native columns/variant rows do not prove those meanings. No stock/lifecycle mapping is approved. |
| Sitemap Slice 3B.2B.3: page evidence/rules require follow-up approval | Page evidence acquisition is now approved in principle; page-type mapping, controlled implementation and live execution remain unresolved or separately scoped. Sitemap fetch status still cannot satisfy page status. |
| SERP Slice 3B.2B.4: capture_date, position_semantics, search_context and freshness always DECISION_REQUIRED | Acquisition-based capture, organic position, existing search profile and maximum 7-day age are approved. Existing request/parser checks enforce the profile and organic ranks; follow-ups enforce receipt provenance, derived capture_date and independent draft/publication freshness. Required-query coverage remains unresolved. |
| GA4 source design `2026-10-03-google-analytics-4-source-design.md` §6: approximately 90-day Blog recommendation and locked activeUsers-based metric list | Blog v2 requires 28 completed property-timezone days and actual totalUsers plus the approved duration/session derivation. The older source metric list describes legacy Content v1; metric completion extends Content v2 while preserving Paid Funnel's metric schema. |
| GA4 Slice 3B.2B.5: users/time/window unapproved; no duration calculation or null placeholder emitted | Those delivery meanings are approved. Follow-ups implement Content v2 metrics and property-timezone calendar checks at immutable draft creation. Legacy missing provenance/metric gaps remain explicit blockers. Historical evidence is not rewritten. |
| GA4 Slice 3B.2B.5: content_coverage decision includes page/property/population scope | Preserve all returned rows and verified pagination; no top-N or invented pages. Legacy missing property context, cross-Job population compatibility and warning/placeholder compliance remain unresolved. |

#### Remaining decisions, source gaps and next implementation boundary

Genuine open product decisions include the required Keyword Planner keyword set
and requested-keyword completeness policy (plus manual structured request scope),
the exact explicitly selected SERP queries, supported İkas availability/stock/
product-status rules and product freshness, Sitemap inventory scope/freshness and
page-type evidence/mapping rules, controlled page acquisition design, and compatible
multi-Job / LOW_DATA / NO_DATA coverage. Legacy GA4 missing frozen property or
provider timezone evidence remains a per-artifact blocker, with no retroactive assignment.
The all-returned-GA4-rows requirement does not resolve those independent policies.
Source feasibility, missing fields and provider acceptance are evidence gaps,
not reasons to reopen the approved field meanings or manufacture observations.

| Family | Current limitation / required separately scoped work |
| --- | --- |
| Ads | Draft inspection compares supplied endpoints. Publication independently checks the completed-30-day window using provider-observed timezone bound to the selected account, preserving requested/observed dates. Missing native account/timezone evidence blocks; no acquisition extension or source-complete claim follows. |
| GSC | Exact 28-day endpoints and finalized returned values do not establish whole-window eligibility. The source-owned finality evidence boundary above defines the remaining blocker; incompatible aggregates cannot be reconstructed. |
| Keyword Planner | Publication checks actual monthly observations for the twelve requested months, but publication calendar timezone and keyword completeness remain unresolved; API account currency is not captured. Manual CSV lacks structured reviewed request scope. Additional observed months stay separate and are never required when absent. |
| İkas | Current parser retains separate product/variant identity and native category/price fields but cannot establish approved singular category or product sale price. Currency is unmapped; availability is legacy variant-derived and can replace a raw availability column; product stock/lifecycle status is unsupported. Extend only from actual supported provider/import evidence. |
| Sitemap | Existing source acquires XML, not individual page title/type/HTTP status. Controlled page evidence implementation and live execution are not authorized here. |
| SERP | Collector response receipt is preserved and revalidated; UTC capture_date is explicitly derived. Draft and publication-time inclusive seven-day checks are deterministic. Legacy receipt absence blocks without backfill. Query/coverage scope and real-provider acceptance remain open. |
| GA4 | Content v2 metrics and conditional derived/null compliance are implemented, with active_users separate. Property binding, provider-timezone consistency and last-28-day checks use draft or independent publication creation time as applicable. Legacy missing provenance/metrics remains blocked; independent coverage and real-provider acceptance remain unresolved. |

`BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS` and source inspectors still represent
the source-policy checkpoint with the GA4 metric/property-window, SERP acquisition/freshness and JSON-publication follow-ups
documented below. Some DECISION_REQUIRED labels still describe
**approved but not yet implemented** requirements. Do not clear lists alone to
claim readiness, mark blocked families COMPLETE, fabricate provider observations,
or promote a draft. Delivery remains NOT_EVALUATED. Provider feasibility, missing
currency acquisition, real-provider acceptance, full real-evaluator publication
success and delivery verification all remain unresolved.

The focused GA4 metric and property/window follow-ups are implemented and
deterministically verified below. Missing legacy provenance is not repaired.
Independent coverage and real-provider acceptance remain later boundaries;
JSON-only publication mechanics are defined below. Deterministic checks do not
authorize live execution.

### `BLOG_WRITING_PACK v2` JSON-only publication (approved 2026-10-18)

Authority: the user's explicit approval of the JSON-only Publication Contract,
including independent reevaluation of every applicable time-dependent requirement
at actual UTC package creation. This is an intermediate publication stage, not
complete Blog v2 delivery. Existing v1 formats/readers/publication are unchanged.

A successful immutable package contains exactly `payload.json`, `manifest.json`
and `evidence/` below its unique output package ID in the existing Blog package
root. The output ID must differ from the frozen draft ID and must not already
exist. Both JSON documents contain `schema_version: "2.0"`,
`recipe_id: BLOG_WRITING_PACK`, `recipe_version: 2`, package/workspace/draft IDs.
No workbook is required. Later Excel support cannot redefine these JSON bytes or
silently change membership; published JSON is immutable.

`payload.json.members` preserves explicit frozen draft order, one entry per
selected Source/Dataset/Run/Job/Attempt/Artifact/Validation identity. Each member
contains its complete `evidence` snapshot, a `raw` file reference, optional
`acquisition_metadata` file reference and separate `normalized` / `derived`
representations. Normalized rows carry their implementation identifier. Derived
rows carry `row_index` and `values`; transformations carry field, expression,
optional unit and explicit approval flag. Source-owned inspectors define those
transformations. Unknown/unapproved mappings cannot be published. No Jobs/rows
are merged, aggregated, reconstructed, deduplicated or silently substituted.

Raw copies use `evidence/<member-index>/raw.bin` with a minimum six-digit zero-padded index; their extension does
not transform provider bytes. Required native acquisition metadata is copied
byte-exactly to `evidence/<index>/acquisition-metadata.json`. Every file reference
contains package-relative path, SHA-256 and byte size. Original Artifact and
acquisition-metadata integrity references stay in frozen membership independently
of the new copy paths. Raw, normalized and derived evidence remain distinguishable.

`manifest.json` records identity, `created_at`, application version, complete
`selected_evidence`, file references for payload and evidence, and a `readiness`
snapshot: `rule_version: blog-v2-publication-1`, evaluation timestamp, SATISFIED
verdict and complete evaluation including requirements/blockers/source contexts.
The manifest never hashes itself. Publication status is JSON_ONLY_PUBLISHED and
delivery status remains INCOMPLETE. These statuses establish neither workbook,
Electron, live-provider nor full delivery acceptance.

`publishBlogWritingPackV2` reads the exact draft, stages verified raw and required
metadata copies, samples its collector clock for creation, and calls the real
readiness evaluator in PUBLICATION phase with that explicit UTC instant. It
accepts no cached verdict or replacement selections. Every mandatory dataset
must be SATISFIED with no mandatory blockers; identity/integrity failures in any
selected member, including optional Trends, also prevent publication. Otherwise
staging is removed and
no completed-package record is created. Source acceptance, Attempts, artifacts
and draft bytes are never changed. Generic JSON store tests may exercise storage
using an explicitly synthetic complete assessment; that is not a real source
policy acceptance result or a production readiness bypass.

Publication-time checks use the same creation timestamp independently of draft
time: SERP uses the inclusive full-UTC seven-day rule; GA4 recalculates the last
28 completed property-calendar days from observed property timezone; Ads checks
the last 30 completed days using provider-observed account timezone and preserves
requested/observed dates separately. Missing/conflicting timezone evidence blocks.
The dedicated Ads query captures native customer ID/timezone as defined in the
Ads source contract above. Legacy contexts without an explicitly frozen customer
ID remain blocked; captured observations never backfill the requested selection.
Planner requires actual monthly observations, preserving missing/null/zero and
additional observed months; its calendar timezone relative to a publication
instant is not established by the current approved evidence/contract and remains
an explicit blocker. Host timezone is never substituted. GSC still requires exact
approved 28-day endpoints plus evidence of whole-window eligibility under the
source-owned finality boundary above; finalized returned values alone do not clear
the publication blocker.
All earlier field, coverage, identity, integrity and unresolved-rule blockers remain.

The v2 store uses private staging, exclusive writes, a publication reservation,
complete JSON/file-set/hash validation and final rename. Readback rejects changed
files, unsafe references, symlinks, unbound identities and invalid readiness.
Failed preparation/validation leaves no completed package; existing exports are
never overwritten. Current source/coverage gaps prevent a full real-evaluator
success path; resolving those gaps is separate from JSON materialization tests.

### `BLOG_WRITING_PACK v2` draft membership (Slice 2)

This additive draft format records explicitly selected accepted evidence from
multiple completed Runs in one Workspace. It does not change the v1 contract.

`assembleBlogWritingPackV2Draft` takes package identity, creation time, application
version, and the Slice 1 selection intent (`recipe_version: 2`, `workspace_id`,
`selections: [{run_id, job_id, artifact_id}]`). Each assembly calls the Slice 1
resolver afresh to verify ownership, completed Run/Job/Attempt state, accepted
artifact identity, Validation association, byte size, and SHA-256. It never selects
a newer Run or repairs changed evidence; resolver blockers propagate to the caller.

`BlogWritingPackStore.saveDraft/readDraft` stores and reads exactly one
`BLOG_DRAFT.json` file under the existing `blog-writing-packs/<package_id>/` root:

```text
draft_version: 1
recipe_id: BLOG_WRITING_PACK
recipe_version: 2
package_id, workspace_id, created_at, application_version
state: DRAFT
readiness_status: NOT_EVALUATED
selected_evidence: [Slice 1 resolved evidence, in explicit selection order]
```

Each membership entry preserves `workspace_id`, `source_id`, `dataset_type`,
`run_id`, `job_id`, the actual `attempt_id` and `validation_id`, validation status,
`artifact_id`, SHA-256, byte size, sanitized requested context, legacy `acquired_at`,
and the resolver's observed context (currently null). `dataset_type` is the
existing dataset identity field; no persisted `dataset_id` is invented.
New SERP memberships additionally freeze optional `serp_acquisition`: the collector
response-receipt UTC instant and origin, actual Attempt ID, and existing metadata
file relative path/SHA-256/byte size. `acquired_at` retains its artifact.created_at
meaning for compatibility; it is not the response-receipt observation. Old drafts
without `serp_acquisition` remain readable and are never backfilled on reload.

Membership is a snapshot: reload validates the stored format without resolving
against current Runs. Newer Runs cannot alter it. Distinct same-family Jobs remain
separate; exact duplicate selections and mixed Workspaces are rejected. Draft
persistence stages and validates the file before rename and refuses existing
package IDs, including existing v1 package IDs. It copies no raw evidence or rows.

A draft has no single Run ID, coverage status, workbook, generic Data Package
manifest, or delivery claim. Extra readiness/coverage fields are rejected. The
v1 published-package reader does not accept drafts. Seven references do not imply
COMPLETE; source field semantics, reporting windows, mandatory coverage, and full
delivery validation remain unevaluated. No SQLite migration or Core lifecycle
change is involved.

### `BLOG_WRITING_PACK v2` explicit readiness evaluation (Slices 3B.1–3B.2B.5)

The slice sections below describe implemented behavior at `6d28411`, with the
GA4 metric/property-window follow-ups explicitly noted below, not automatic
adoption of the 2026-10-17 approved delivery requirements above. Slice-era references
to unapproved meanings/decisions must be read with that resolution table; source
gaps and conservative runtime blockers remain until separately implemented.

`evaluateBlogWritingPackV2Readiness({package_id, workspace_id, requirements, evaluated_at?},
{store, repository, loader})` reads `BLOG_DRAFT.json` through `readDraft` and
returns an in-memory evaluation; it never writes or promotes the draft. The
version-1 requirements profile is explicit input with `recipe_version: 2`,
per-family `open_decisions` / `required_source_changes` lists, and
`gsc_requested_dates: {start_date, end_date} | null` and optional
`ads_requested_dates: {start_date, end_date} | null`. Omitted/null Ads endpoints
remain DECISION_REQUIRED; supplied endpoints must be real, ordered calendar dates.
The current profile supplies neither source's endpoints. Unknown requirement fields
are rejected rather than silently treated as checked. Omitted family policy
produces DECISION_REQUIRED.

The evaluator reuses Slice 1 for each exact selected reference and compares all
resolved provenance with frozen membership. Changed context, IDs, or integrity
references produce MEMBERSHIP_CHANGED. Rejected evidence and byte/checksum
failures are blockers, never grounds to select a newer Run. No raw provider
response or filesystem error path is included in blocker reports.

Seven mandatory dataset types are fixed: SEARCH_TERMS, QUERY_PAGE,
KEYWORD_HISTORICAL_METRICS, PRODUCTS, SITEMAP_URLS, GOOGLE_SERP, and
GA4_CONTENT_PERFORMANCE. INTEREST_OVER_TIME remains optional. Each mandatory
family reports MISSING, BLOCKED, or SATISFIED, selected count, and usable count.
Here usable means exact revalidated identity with a VALID source verdict; it does
not mean all downstream fields have been checked. LOW_DATA/NO_DATA coverage and
multi-Job scope semantics remain DECISION_REQUIRED in this slice.

GSC compares requested start/end dates with explicitly supplied approved
endpoints (exactly 28 inclusive calendar dates). No reference date or timezone
policy is derived. Wrong or missing requested dates produce WINDOW_MISMATCH;
missing approved endpoints produce DECISION_REQUIRED. This date check applies
independently of an accepted empty-result coverage decision. Aggregate rows are
not reconstructed, filtered into daily data, or summed.

Overall coverage is NOT_READY when no mandatory selection is usable, PARTIAL
when some are usable but mandatory blockers remain, and COMPLETE only when all
seven families satisfy the explicit supported requirements with no mandatory
blocker. Every result includes `coverage_scope: EXPLICIT_REQUIREMENTS_ONLY`, the
requirements snapshot and unchanged selected provenance, and
`delivery_readiness: NOT_EVALUATED`. It does not claim full downstream delivery.
All seven mandatory families now have source-backed field inspection. Empty
decision lists cannot approve unresolved meanings, scope or source capabilities;
absent families remain MISSING. Real Blog v2 COMPLETE coverage remains blocked
on the explicit decisions and acquisition gaps documented below.

`BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS` keeps open decisions and source gaps
separate from approved durations. Ads `reporting_window` and Planner
`historical_scope` are no longer blanket product-decision blockers: Ads publication
checks the last 30 completed account-calendar days; Planner API context checks
the twelve-month request shape, while calendar context, exact supplied scope,
actual monthly observations, keyword coverage and currency remain independent
blockers. No date, timezone or metric default is supplied. GA4 metric/window and
SERP receipt/freshness checks remain per artifact. Using this profile cannot
produce real COMPLETE coverage while those blockers remain. Blockers carry a
dataset type, mandatory/optional designation, actual selection IDs, requirement,
expected/actual safe condition, and next action. Supported codes are
DATASET_MISSING, DECISION_REQUIRED, SOURCE_CHANGE_REQUIRED, WINDOW_MISMATCH,
EVIDENCE_INVALID, ARTIFACT_INTEGRITY_FAILED, MEMBERSHIP_CHANGED, FIELD_ABSENT,
FIELD_OBSERVATION_REQUIRED, and FIELD_REPRESENTATION_INVALID.

For implemented families, the evaluator uses the existing loader's verified byte-read
capability (`readAcceptedJobArtifact`) and existing source normalizers with
source-local raw field-presence inspection. The read rechecks accepted ownership,
size, SHA-256 and frozen artifact/context references. Invalid representations
produce safe blockers without copying provider responses into reports.

Ads requires search_term, campaign, ad_group, impressions, clicks, ctr, cost,
conversions and conversion_value. Canonical SearchStream text comes from
searchTermView.searchTerm, campaign.name and adGroup.name; metrics retain
provider meaning, with costMicros divided by 1,000,000 through the existing
normalizer and conversionsValue mapped to conversion_value. Legacy flat raw
rows retain their existing mappings, including cost_micros conversion. Observed
segments.date (or supported legacy performance_date/date) remains performance_date;
no date is invented. Requested Ads endpoints are compared exactly, using the
same endpoint-comparison path as GSC, with no default duration. Open decision
lists remain authoritative and must explicitly be resolved by the caller.

GSC query/page come from query × page row keys; page maps to page_url and
position to average_position. Clicks, impressions, CTR fractions and provider
average position are retained without recalculation. Requested GSC endpoints
remain separate from provider row values; the existing exact 28-day check applies.

Read-only `field_checks` contain per-selection IDs, row counts and field counts
(observed, normalized null from present fields, absent); they contain no business row values. Field
status is OBSERVED, NULL, ABSENT, UNRESOLVED (empty or semantically unresolved),
or UNSUPPORTED (an explicit source capability gap). A missing raw property
cannot become observed merely because normalization emits null. Explicit
source-compatible nulls and zeros remain distinct. Existing legacy/GSC empty-string
to null normalization is retained; it never proves an absent raw property. Incompatible source shapes
or values produce FIELD_REPRESENTATION_INVALID; absent fields produce FIELD_ABSENT;
empty rows produce FIELD_OBSERVATION_REQUIRED. The inspector separately reports
UNSUPPORTED for source families outside its Ads/GSC/Keyword Planner/İkas/Sitemap/SERP/GA4 implementation. NO_DATA and
LOW_DATA retain their original verdict, coverage decision blocker, and independent
window/field checks. Draft bytes, source validators and v1 export behavior are unchanged.


### `BLOG_WRITING_PACK v2` Keyword Planner compliance (Slice 3B.2B.1)

The existing evaluator checks selected `google-keyword-planner` (OFFICIAL_API)
and `google-keyword-planner-csv` (FILE_IMPORT) artifacts through the same frozen
membership and accepted-byte integrity seam. Provider parsing, source-context
validation and raw field presence live in `keyword-planner-field-inspector.ts`;
the Blog helper owns only downstream aliases and the existing field-count summary.
No source acquisition, parser behavior, loader API or draft format is changed.

Required mappings:

| Blog field | Official API | Manual CSV |
| --- | --- | --- |
| keyword | result.text → returned_keyword | Keyword column → returned_keyword |
| average_monthly_searches | keywordMetrics.avgMonthlySearches → avg_monthly_searches | Avg. monthly searches → avg_monthly_searches |
| competition | keywordMetrics.competition (category) | Competition column (native localized category) |
| top_of_page_bid_low | lowTopOfPageBidMicros / 1,000,000 | Top of page bid (low range), already currency units |
| top_of_page_bid_high | highTopOfPageBidMicros / 1,000,000 | Top of page bid (high range), already currency units |

Competition index remains a separate observation and never supplies competition.
Known API LOW/MEDIUM/HIGH categories remain native; other non-null categories
require `competition_semantics` approval, without translating or inventing values.
CSV native categories are preserved without translation. API requested_keyword,
returned_keyword, explicit close variants and matched-request observations remain
separate through the existing normalizer. Missing/null/blank provider identity
produces FIELD_OBSERVATION_REQUIRED (`observed_keyword`), never a request fallback.
Unproven/ambiguous request mappings or unsupported raw shapes fail normalization
and produce FIELD_REPRESENTATION_INVALID. The CSV parser's requested_keyword alias
comes from the provider Keyword cell; it is not proof of a reviewed request set.

API raw presence proves each required metric property independently of normalized
nulls. Absent properties produce FIELD_ABSENT. Explicit nulls remain null; real
zeros remain zero. Successful fixed-header and complete-row CSV parsing proves
column presence, with blank cells retaining existing null semantics. Missing
headers/partial rows fail the existing parser. Original monthly histories remain
unchanged, including missing/null observations; no months, averages or history
are reconstructed. Duplicate provider rows and Jobs are never merged/deduplicated.

Optional `keyword_planner_scope` in the version-1 requirements profile specifies
`requested_date_start`, `requested_date_end`, `country_code`, `language_code`,
and `keyword_plan_network`, or null. Unknown keys/invalid or reversed dates are
rejected. Exact dates are never filled from the approved duration. Missing scope stays
DECISION_REQUIRED even if family decision lists are empty; approved fields are
compared exactly against each verified API Job's requested context, producing
WINDOW_MISMATCH on disagreement. Open decision lists still require explicit
resolution by the caller. The API context's existing 12-complete-month TR/tr/
GOOGLE_SEARCH constraint checks the approved duration's request shape. It does
not prove the latest completed months at publication, actual monthly observations,
keyword completeness or currency. The separate publication calendar-context and
monthly-observation checks remain; no host timezone or synthetic months are used.

Missing/incompatible source request context produces EVIDENCE_INVALID
(`keyword_planner_request_context`). Manual inspection validates sanitized source,
task and FILE_IMPORT mode and reads only accepted bytes, never the original
file_path. The CSV date label/monthly columns do not prove requested geographical,
language or network scope: DECISION_REQUIRED (`manual_csv_scope`) remains. API
artifacts do not capture observed account currency: SOURCE_CHANGE_REQUIRED
(`currency_context`) remains; never infer currency from TR or assume micros
means a particular currency. Manual currency is preserved from each provider row.
No acquisition extension is authorized by this slice.

The required Blog keyword set/completeness policy is unspecified: all selected
KWP evidence retains DECISION_REQUIRED (`keyword_coverage`), including one Job.
Multiple Jobs retain independent selected provenance and field counts plus the
existing `multi_job_coverage` blocker. LOW_DATA/NO_DATA retain their verdict and
coverage decision, with independent scope/field checks; empty rows cannot prove
fields even under VALID. These gaps prevent mandatory KWP coverage from passing
in this slice despite successful field inspection. Delivery stays NOT_EVALUATED;
EXPLICIT_REQUIREMENTS_ONLY and NOT_READY/PARTIAL/COMPLETE remain unchanged.


### `BLOG_WRITING_PACK v2` İkas Products compliance (Slice 3B.2B.2)

The existing evaluator reads selected accepted İkas XLSX bytes through unchanged
Slice 1 identity/integrity and frozen draft checks. İkas-local
`inspectIkasProductsFields` reuses `parseIkasProductsXlsx`. The parser adds
`mapped_fields` metadata identifying actual matched columns, without changing
row normalization, validation, units, header aliases or raw bytes. A null-filled
optional URL is not evidence that a URL column existed. Inspection validates
sanitized source/task/FILE_IMPORT context; it never reopens the original file_path.

| Blog field | Actual supported import/normalization | Compliance and follow-up |
| --- | --- | --- |
| product_id | Product ID / Ürün Grup ID / existing ID aliases → product_id | Actual group identity only; no variant/name/URL fallback. Blank is null and blocked; missing required ID header fails parsing. |
| product_name | Product title / İsim / existing title aliases → product_title | Alias to product_name; blank stays null with observation blocker. No slug/name reconstruction. |
| product_url | Existing URL / Product URL / Ürün URL aliases → url | Alias only when present; no URL construction. Absent header versus blank cell stays distinct. Invalid/non-HTTP(S) URL representations block. Missing source URL requires separate evidence/import support. |
| category | Categories / Kategoriler, Categories / product type / Kategori, Product type / Tip | Native strings remain separate; no category ID/hierarchy interpretation, delimiter splitting, primary-category choice or singular alias. DECISION_REQUIRED. |
| price | Price / Fiyat / Satış Fiyatı → price; Sale price aliases → separate sale_price | Existing numeric parsing and per-variant rows retained, including null/zero; no product-price selection, minimum, aggregation or sale/list equivalence. Runtime retains DECISION_REQUIRED; the approved Blog price meaning above is not implemented. |
| availability | Existing normalized availability derivation from deleted, variant_active, stock and continue_selling | Native derived variant value retained; product-level meaning unresolved. A direct raw availability column is currently replaced by the legacy derivation and cannot be treated as preserved direct product availability. DECISION_REQUIRED. |
| stock_status | Numeric stock is an independent observation; no approved product stock-status mapping | UNSUPPORTED / SOURCE_CHANGE_REQUIRED. Never inferred from availability or fabricated as zero. |
| product_status | Native deleted/variant-active/channel flags remain independent | No approved product lifecycle/publication mapping: UNSUPPORTED / SOURCE_CHANGE_REQUIRED. No fabricated active/draft/archive/publication state. |

Currency is not mapped by the existing import parser. Monetary numbers retain
imported units without scaling, currency conversion or assumed currency.
SOURCE_CHANGE_REQUIRED (`currency_context`) remains. Any supported currency,
stock-status or product-status extension requires a separate source/import-schema
contract; no provider acquisition or import schema extension was made here.

Read-only field reports retain existing observed/null/absent counts and introduce
UNSUPPORTED for known capability gaps. UNRESOLVED distinguishes present native
values from unimplemented or still-unresolved downstream interpretation; no singular category value is emitted.
Native price/availability counts do not claim approved product-level semantics.
Missing required observations use FIELD_OBSERVATION_REQUIRED. Absent supported
columns use FIELD_ABSENT. Invalid workbook, IDs/schema, numeric observations or
URL representations use FIELD_REPRESENTATION_INVALID. Incompatible import context
uses EVIDENCE_INVALID (`ikas_request_context`). Safe messages contain no provider
rows or original import paths. Existing source validator verdicts are not modified.

The artifact's acquired_at remains acquisition provenance. The parser has no
approved provider observation timestamp; created-date-like columns are not a
snapshot timestamp mapping. DECISION_REQUIRED (`freshness`) remains even if a
caller empties decision lists. No maximum age, timezone or reference-date policy
is invented, and acquisition time is never promoted to provider observation time.

Repeated products/variants, duplicate rows and independently selected Jobs stay
separate with exact Run/Job/Attempt/Validation/Artifact references. No merge,
deduplication, newer-Run selection or draft write occurs. Multi-Job coverage stays
explicitly unresolved. Existing LOW_DATA/NO_DATA decisions remain independent;
empty unsupported workbooks fail parsing and cannot prove mandatory fields.

Product coverage remains BLOCKED on these semantic/source gaps. The current
profile records category/price/availability/freshness as open decisions and
stock_status/product_status/currency_context as source changes.
KWP and Ads/GSC behavior is unchanged.
EXPLICIT_REQUIREMENTS_ONLY, NOT_READY/PARTIAL/COMPLETE and delivery
NOT_EVALUATED remain unchanged. No complete Blog v2 readiness is claimed.


### `BLOG_WRITING_PACK v2` Sitemap compliance (Slice 3B.2B.3)

The existing readiness evaluator inspects accepted `bitkimark-sitemap` XML through
unchanged selection/draft/identity/integrity checks. Source-local
`inspectSitemapFields` reuses `createBitkimarkSitemapJobContext` and
`parseBitkimarkSitemap`. The existing parser, request construction, source fetch,
verified host/document allowlist and validator are unchanged. Only selected
accepted bytes are inspected; no discovery, traversal, crawl or page fetch occurs.

| Blog field | Existing raw/normalized evidence | Compliance |
| --- | --- | --- |
| url | Direct loc → url, preserving the parser's raw trimmed loc and existing URL validation | URL_SET/entry_type URL establishes observed webpage URL. Index entry loc identifies a child sitemap, not a webpage. Missing/blank/malformed loc fails parsing; no requested URL substitution. |
| page_type | No normalized classification observation | UNSUPPORTED / SOURCE_CHANGE_REQUIRED; URL patterns, document kind and existing local annotations are not page classification. |
| title | No suitable normalized webpage title observation | UNSUPPORTED / SOURCE_CHANGE_REQUIRED; no slug/product-name reconstruction or promotion of unrelated XML metadata to HTML title. |
| status | Source observes the sitemap document response status only | UNSUPPORTED / SOURCE_CHANGE_REQUIRED for individual-page HTTP status. No copied 200, inferred availability or missing-to-zero conversion. |

A selected URL_SET may pass the url field while the dataset remains BLOCKED.
SITEMAP_INDEX rows retain `entry_type: SITEMAP` and `document_kind: SITEMAP_INDEX`;
url is UNRESOLVED for the Blog webpage requirement, with DECISION_REQUIRED
(`sitemap_document_kind`) plus observation blocker. Index URLs remain visible as
child-document evidence; none are manufactured into pages or fetched automatically.
The existing verified-child allowlist remains enforced.

Per-document duplicate loc rejection is unchanged; no duplicates are silently
removed. Equal URLs in separate Jobs/Runs remain independent rows and field
summaries, with all original Run/Job/Attempt/Validation/Artifact references.
DECISION_REQUIRED (`scope`) remains even with one Job or empty decision lists:
one document or a union of selected documents does not prove complete website
inventory. Existing multi_job_coverage, warning-outcome and real-profile freshness
decisions remain unresolved; no new completeness/freshness policy is invented.

Optional lastmod remains the source-provided validated ISO value or null when
absent/empty. It is not page HTTP status, live update proof or acquisition time.
The existing parser does not normalize changefreq/priority; those XML values
remain only in immutable raw evidence and are not interpreted as observed update
frequency or quality. Existing URL-derived annotations remain local annotations,
not provider page types or titles. XML title-like elements have no approved title
mapping in this source.

Normalized source_url, parent_sitemap_url, document_kind, entry_type and retrieved_at
match the existing accepted loader's representation. The evaluator supplies the
frozen artifact acquired_at as retrieved_at, explicitly acquisition provenance;
no provider page-observation timestamp or current-time fallback is invented.
Frozen requested_context, observed_context and membership remain unchanged.

Existing blocker codes are reused: FIELD_REPRESENTATION_INVALID for unsupported
XML/loc/metadata; EVIDENCE_INVALID (`sitemap_request_context`) for unsupported
source/task/request context; FIELD_OBSERVATION_REQUIRED for empty/unproven URL
observations; SOURCE_CHANGE_REQUIRED for page_type/title/status; DECISION_REQUIRED
for scope/index meaning. Existing integrity/membership/validation-outcome blockers
remain. Empty VALID/NO_DATA/LOW_DATA never prove observed URL or full coverage.
Safe field results contain counts and fixed conditions, without provider rows.

Follow-up needs separately approved page-type evidence/rules, actual page-title
observations and per-page HTTP status acquisition, plus site-scope/completeness
and any required freshness decisions. This slice implements none of those source
extensions. Delivery remains NOT_EVALUATED, with EXPLICIT_REQUIREMENTS_ONLY and
NOT_READY/PARTIAL/COMPLETE unchanged. Full Blog v2 delivery is not established.

### `BLOG_WRITING_PACK v2` SERP snapshot compliance (Slice 3B.2B.4 + acquisition/draft-freshness follow-ups)

Accepted `serpapi` / GOOGLE_SERP bytes pass through unchanged selection, frozen
draft and accepted-artifact integrity checks. SerpApi-local `inspectSerpApiFields`
reuses the existing request validator and `parseSerpApiResponse`. The acquisition
follow-up below adds receipt metadata and accepted loading; provider row parsing,
source validation and v1 export/publication behavior remain unchanged.

| Blog field | Actual evidence and existing normalization | Compliance |
| --- | --- | --- |
| query | Requested query is a source request dimension; provider search_parameters.q must equal it before normalization | Checked with origin REQUEST_DIMENSION_VERIFIED_BY_PROVIDER; never an independent result-text observation or a fallback for missing provider q. |
| capture_date | UTC date derived from the verified serp_acquisition.response_received_at instant, independently preserved with metadata identity/hash/size. Requested snapshot_date, acquired_at (artifact.created_at) and raw provider dates never substitute | DERIVED with derived_count, zero provider-observed count and DERIVED_FROM_COLLECTOR_RESPONSE_RECEIPT origin; absent receipt yields UNRESOLVED / ACQUISITION_UNAVAILABLE and an explicit evidence blocker. |
| position | organic_results[].position → positive integer position | Provider organic position only, never array index or absolute SERP rank. PAA has normalized null position and no supported rank field. The inspector retains DECISION_REQUIRED despite the approved organic scope above. |
| url | organic_results[].link or related_questions[].link → existing validated HTTP(S) url | Provider result link only. Missing property versus explicit null/empty remains distinct in field counts. No construction from query/domain. |
| title | organic_results[].title → nullable title | Provider organic title only. PAA has normalized null title; question text or an unnormalized PAA title property cannot fill it. No slug/query/metadata reconstruction. |
| domain | Existing parser derives lower-case URL.hostname from observed HTTP(S) link | Origin DERIVED_FROM_OBSERVED_URL, not direct provider domain observation. Missing link has no domain; invalid links fail, and unrelated raw domain text is ignored. |

Read-only `field_checks` add source-specific `serp_provenance` with fixed query,
capture_date, position and domain origin labels. They expose counts/conditions,
not provider result rows or raw metadata. Frozen requested_context, acquired_at,
Run/Job/Attempt/Validation/Artifact identity and observed_context (currently null)
remain unchanged; parsed provider context is not written into draft membership.

The locked source requires THIRD_PARTY_API, the existing source/task/dataset/Job
context shape, TR/tr, desktop, google, organic_limit=10 and a valid requested date.
Provider q/gl/hl/device/engine/start=0 must match the source's existing rules.
There is no location observation or historical search-date parameter invented by
this inspector. Incompatible request context yields EVIDENCE_INVALID
(`serp_request_context`); provider mismatches, errors and unsupported shapes yield
FIELD_REPRESENTATION_INVALID with safe messages and no field proof.

Only the existing first-ten organic normalization and separate PAA rows are used.
Paid results and other features remain raw provider observations without a new
normalized ranking model. Organic/PAA result_type, null position/title and native
row order are preserved. No provider results or independent Jobs are merged or
deduplicated. Multiple selected Jobs retain complete independent provenance and
the existing multi_job_coverage decision. A newer Run never replaces membership.

Absent supported raw fields produce FIELD_ABSENT. Present null/empty/blank required
URL/title or a domain unavailable from a present link produces
FIELD_OBSERVATION_REQUIRED; existing parser empty-string-to-null behavior is
retained. Real zero is never substituted for missing: organic position zero is
invalid under the unchanged positive-integer source contract. PAA position/title
are not counted as observed merely because normalized properties exist.
capture_date has zero provider-observed count; verified derived dates have separate
derived_count and DERIVED status. Unknown receipt never receives a fabricated
date. Empty VALID/NO_DATA/LOW_DATA cannot establish fields, while warning verdict/
coverage decisions remain separate.

The current runtime retains DECISION_REQUIRED for query_coverage. The approved
organic-position and Google/TR/tr/desktop/first-ten profile are already enforced
by request-context validation and provider-response parsing, so position_semantics
and search_context no longer create blanket decision blockers. Invalid ranks,
mismatched query/profile, required missing fields and separate PAA limitations
remain checked. Capture/freshness use mandatory per-evidence checks below,
regardless of empty caller decision lists. Source VALID alone cannot satisfy Blog
SERP coverage: the exact required query set/completeness still needs explicit
selection and a coverage rule.
Independent provider timestamps/domains, absolute ranks or additional result
categories would require separately approved
source capabilities if demanded; none are acquired or normalized in this slice.

Coverage states and EXPLICIT_REQUIREMENTS_ONLY are
unchanged, delivery remains NOT_EVALUATED, and no full Blog v2 delivery or new
real-provider acceptance is established.

**Response acquisition provenance (2026-10-17):** the existing HTTP requester
notifies the SERP client immediately after the complete response body has arrived,
before text decoding or JSON parsing. Only that notification records the injected
collector clock as canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ`. Provider request/error
classification and raw response bytes remain separate. A custom requester without
that notification supplies no receipt evidence; promise completion is not a
fallback clock boundary.

The SERP source emits existing `acquisition_metadata` containing
`response_received_at` and `response_received_at_origin:
COLLECTOR_OBSERVED_RESPONSE_RECEIPT`. The unchanged orchestrator/MetadataManager
persists these in its existing attempt-scoped metadata JSON, separately from raw
provider bytes. Native exclusive-create persistence refuses overwrite; retries
retain separate raw files, metadata and timestamps. Artifact registration and
metadata `retrieved_at` are later lifecycle provenance, not replacement clocks.

`readAcceptedJobArtifact` / `verifyAcceptedJobArtifact` validate SERP sidecar
source/Run/Job/raw Artifact/path/Attempt-number/request-context binding and return
optional `serp_acquisition` with the receipt fields, Attempt ID and metadata file
path/hash/size. The v2 resolver additionally verifies the actual accepted Attempt
ID and freezes that provenance. Reevaluation compares the snapshot and rechecks
it at field loading; changed or removed metadata cannot silently change membership.
The metadata hash freezes loaded bytes; it is not a new database artifact or a
provider attestation. Legacy absent sidecars or absent acquisition_metadata remain
readable with no receipt observation. Explicit malformed/incomplete/noncanonical
UTC or conflicting new provenance is rejected, never completed from lifecycle,
request or provider dates. No historical timestamps are reconstructed.

**Capture date and draft-time freshness:** after accepted loading and frozen
provenance comparisons, the SERP inspector derives capture_date from the verified
UTC timestamp's date component. This read-only Blog value is not a native provider
observation or a persisted raw/normalized artifact rewrite. `serp_provenance` marks
the derivation and `serp_freshness.acquisition` preserves the full receipt instant
and its metadata reference; field-check Run/Job/Artifact identity links to the
unchanged selected Attempt/Validation provenance.

The readiness evaluator uses immutable draft.created_at by default. Optional
explicit `evaluated_at` reevaluates this draft's SERP evidence at that UTC instant;
it does not change GA4's draft.created_at reference. Full UTC references include
date, hours, minutes, seconds and Z, with optional millisecond precision. Date-only,
malformed and rolled-over dates are invalid references, never replaced by host
time. `reference_origin` distinguishes DRAFT_CREATED_AT and
EXPLICIT_DRAFT_EVALUATION; no Date.now or cached readiness verdict is used.

The approved maximum seven-day elapsed age is inclusive:
`0 <= age_ms = evaluated_at - response_received_at <= 604800000`.
There is no date-only comparison, calendar rounding, timezone shift or tolerance.
Six days and exactly seven days pass this check; seven days plus one second is
STALE, and negative age is FUTURE. Both produce EVIDENCE_INVALID / serp_freshness.
Missing receipt produces FIELD_OBSERVATION_REQUIRED / serp_acquisition; invalid
reference produces EVIDENCE_INVALID / serp_reference_time. Malformed/conflicting
or unverifiable metadata fails existing accepted-evidence revalidation, while
changed hash/path/size or removed provenance blocks frozen membership checks.
These failures never alter source acceptance, prior Attempts or selected evidence.
The read-only freshness context records age, limit, reference, provenance and
status, independently of other SERP query/scope coverage blockers.

Draft assembly remains membership-only with readiness NOT_EVALUATED; callers
invoke readiness for draft-time compliance. Default reevaluation repeats the
original draft-time check; an explicit later reference can make the same frozen
evidence stale. No result is cached or written back, and newer unselected Runs
never replace membership. Draft-time tests establish no package delivery claim.
The separate v2 JSON-only publisher above independently revalidates freshness at
its actual creation timestamp; a prior draft-time pass is insufficient. The v1
publisher and reader retain their existing formats.

### `BLOG_WRITING_PACK v2` GA4 Content Performance compliance (Slice 3B.2B.5 + metric/property-window follow-ups)

The existing GA4 source acquires Content Performance separately from Paid Funnel.
`inspectGoogleAnalytics4ContentFields` inspects accepted bundle bytes through the
same frozen membership and verified-byte seam. It reuses the source's existing
pure context/bundle validation helpers and normalizer. The metric-completion
follow-up extends new Content requests with `totalUsers` and
`userEngagementDuration`, following the original eleven metrics. New Content raw
bundles use `bundle_schema_version: 2`; legacy Content and Paid Funnel retain
version 1. Each version has exact validated header names, types, order and row
widths; v2 requires `totalUsers / TYPE_INTEGER` and
`userEngagementDuration / TYPE_SECONDS`. Missing/reordered/substituted headers or
mixing legacy and new page schemas fail closed. No provider bytes are rewritten.

| Blog field | Existing requested/returned GA4 field | Mapping / type / limits |
| --- | --- | --- |
| landing_page | landingPage dimension; dimensionHeaders and dimensionValues | Existing landing_page string, preserving exact text including `(not set)`. That placeholder is valid provider evidence, not an identified page. It is the first-pageview path dimension, not landingPagePlusQueryString, pagePath, pageLocation or a fabricated absolute URL. |
| sessions | sessions / TYPE_INTEGER | Native nullable number of sessions; no users-to-sessions inference. |
| users | totalUsers / TYPE_INTEGER → total_users in Content v2 | Blog users aliases total_users only. activeUsers → active_users remains separate. Legacy v1 has no total_users observation and stays UNSUPPORTED for users. |
| engaged_sessions | engagedSessions / TYPE_INTEGER | Native nullable number of engaged sessions; not calculated from a rate. |
| engagement_rate | engagementRate / TYPE_FLOAT | Native nullable fraction, with no scaling to percentage and no recomputation from other metrics. |
| average_engagement_time | userEngagementDuration / TYPE_SECONDS → user_engagement_duration, with native sessions | The source-local inspector derives userEngagementDuration / sessions in seconds per session; it never aliases averageSessionDuration. Legacy v1 lacks duration and remains UNSUPPORTED. |
| key_events | keyEvents / TYPE_FLOAT | Native nullable key-event count, retaining the source's fractional-capable representation. No eventCount/conversions substitute or historical equivalence assumption. |

Provider meanings and units are documented in the
[GA4 Data API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema).
User engagement duration is total seconds; average session duration is a different
metric. Google's [predefined reports](https://developers.google.com/analytics/devguides/reporting/data/v1/predefined-reports)
illustrate distinct engagement-duration expressions per session and per active
user. The 2026-10-17 approval selects engagement seconds per session for Blog v2.
Content v2 acquires the two native metrics and preserves them in source-normalized
`total_users` and `user_engagement_duration`; it adds no derived field to native
source rows. Legacy v1 normalization retains its original row shape and never
backfills these metrics. Paid Funnel's metric schema and row shape remain unchanged.
The shared numeric parser now treats whitespace-only values as null in both
datasets, preserving actual numeric zeros.

The source-local Blog inspector adds `users`, `average_engagement_time` and
`average_engagement_time_reason` separately from native normalized fields. The
derived value requires present non-null duration and positive integral sessions;
real zero duration produces zero. Otherwise the value is null with reason
MISSING_USER_ENGAGEMENT_DURATION, MISSING_SESSIONS, NON_POSITIVE_SESSIONS,
INVALID_SESSIONS or INVALID_USER_ENGAGEMENT_DURATION. Negative duration or invalid
session counts cannot establish Blog time compliance. Absent provider cells remain
ABSENT independently of normalized null; explicit null/blank stays NULL, and
whitespace-only numeric cells cannot become observed zero. Malformed/non-finite
numeric values fail closed. Legacy missing metrics remain SOURCE_CHANGE_REQUIRED;
the approved meanings no longer generate users/time DECISION_REQUIRED defaults.

The existing exact Content header names/types/order, single landingPage granularity,
bundle dataset identity, page offsets and request limit are rechecked. Paid Funnel
bundles, extra date/device/page dimensions, substituted metrics or columns outside
the selected bundle version fail FIELD_REPRESENTATION_INVALID; their original raw
observations remain unchanged. The inspector also requires normalized row count
to equal the bundle's declared total; source validation also rejects incomplete
normalized row counts. No duplicate rows or independent Jobs are
removed, and metrics are never merged across windows/properties/populations.

Presence is inspected at each actual provider cell's `value` property. A missing
value is FIELD_ABSENT even if normalization emits null. Present null and empty
strings retain existing null normalization, while actual numeric zero stays zero.
Malformed numeric values, missing/mismatched headers or incompatible representations
fail safely rather than becoming zero. Blank landing-page observations produce
FIELD_OBSERVATION_REQUIRED; no path reconstruction occurs. Empty accepted
VALID/NO_DATA/LOW_DATA cannot prove required observations, with independent original
source verdict/coverage blockers.

GA4-local inspection marks `(not set)` as an unresolved landing-page observation
without changing its raw or normalized value. The shared helper's source-neutral
per-row unresolved-observation hook excludes marked values from observed_count
without reclassifying them as null/absent. Placeholder-only evidence has zero
identified pages; a placeholder plus one legitimate path has one. Either keeps
landing_page UNRESOLVED and produces FIELD_OBSERVATION_REQUIRED through the
existing evaluator. A legitimate path alone remains OBSERVED. Raw rows, source
validation, blank/null/missing behavior, metadata and independent provenance are
unchanged; another source's identical text receives no GA4 interpretation. This
does not establish full Blog compliance or resolve remaining coverage decisions.

Optional `ga4_requested_dates: {start_date, end_date} | null` adds ordered real
calendar endpoints to the existing version-1 explicit requirements profile.
Missing/null endpoints remain DECISION_REQUIRED (`ga4_requested_dates`) even with
empty decision lists; provided endpoints compare exactly with every verified
Content Job's `start_date`/`end_date`, producing WINDOW_MISMATCH on disagreement.
Endpoint equality is additional to the mandatory property-calendar check below;
supplying matching endpoints cannot bypass it. No Paid Funnel window is inherited.

Bundle dates must match frozen Job context independently of Blog endpoint approval
(`ga4_request_window` / WINDOW_MISMATCH). Request context must be Content Performance
without Paid Funnel filters; supplied property_id must be numeric and match the
bundle's recorded acquisition property (`ga4_request_context` / EVIDENCE_INVALID).
Source validation now also accepts optional numeric property_id and compares it
with the raw acquisition request; absent legacy identity remains absent.
Legacy Jobs without frozen property_id remain usable for inspection but retain
DECISION_REQUIRED (`property_scope`); raw acquisition identity does not retroactively
freeze a reviewed property or establish independent provider identity observation.

Draft readiness evaluates the last 28 completed calendar days at the stored
immutable `draft.created_at` instant. PUBLICATION evaluation instead uses its
explicit package-creation UTC instant, independently of the draft result. Neither
uses host timezone, an implicit Date.now or artifact acquisition time.
This is an evaluation reference, never a provider reporting observation. The
GA4-local calculation obtains that instant's calendar date in the property timezone,
then requires yesterday through 28 days before today, inclusive. It uses calendar
date arithmetic independent of daylight-saving day length. Invalid or ambiguous
reference timestamps fail with EVIDENCE_INVALID (`ga4_reference_time`).

Timezone comes only from actual accepted response `metadata.timeZone`. At least
one nonblank observation is required; every supplied nonblank timezone must be
valid and agree after canonicalizing supported aliases. Missing timezone produces
FIELD_OBSERVATION_REQUIRED (`ga4_timezone`); invalid/conflicting observations produce
EVIDENCE_INVALID (`ga4_timezone`). No default, Workspace configuration or other
artifact supplies missing observations. Legacy v1 uses only its own existing
metadata and frozen property context; it is never upgraded or rewritten.

Requests outside the calculated window produce WINDOW_MISMATCH
(`ga4_completed_days`) even when explicit endpoints match caller requirements or
decision lists are empty. Read-only `ga4_context.reporting_window` records the
expected start/end, reference instant with DRAFT_CREATED_AT origin, and canonical
timezone with PROVIDER_RESPONSE_METADATA origin. Original requested dates remain
separate; no observed reporting dates, daily rows or zero-activity days are invented.
Selected Jobs with different acquisition properties produce EVIDENCE_INVALID
(`ga4_property_scope`); conflicting observed timezones across selected Jobs produce
EVIDENCE_INVALID (`ga4_timezone`). Existing multi-Job population blockers remain.

Read-only `field_checks.ga4_context` preserves the bundle's recorded property,
requested endpoints, validated response header names and existing normalized
provider currency/timezone metadata per Job. Its additive `metric_provenance`
describes the totalUsers alias, native engagement duration in seconds and the
derived expression/unit. These are mapping definitions, not proof that legacy
artifacts contain the metrics; presence/field checks establish actual observations.
It contains no business row values.
These are requested/acquisition fields and provider metadata, not an invented
observed reporting period. Acquisition time and every original membership/context/
Run/Job/Attempt/Validation/Artifact reference remain unchanged. No current Workspace
connection, newer Run or inferred property timezone repairs historical evidence.

The runtime checks users/time capability per artifact rather than globally blocking
new supported Content evidence. DECISION_REQUIRED (`content_coverage`) remains
independent of the all-returned-row policy. Missing legacy provenance and population/
warning coverage remain independent blockers, even when decision lists are empty. Multiple legitimate
Jobs remain independent with existing multi_job_coverage blockers; there is no
one-Job restriction.
All seven families now have inspection, but their documented gaps still prevent
real COMPLETE readiness. NOT_READY/PARTIAL/COMPLETE, EXPLICIT_REQUIREMENTS_ONLY and
delivery NOT_EVALUATED remain unchanged. No live GA4 or delivery acceptance is claimed.

---

## 16. Validation findings

Structured findings include:

```text
check_id
severity
passed
message
expected
actual
```

Severity:

```text
INFO
WARNING
ERROR
```

Prefer source-specific findings/operational codes over unnecessary global validation-status expansion.

---

## 17. Contract-change gate

Any change to persisted IDs, statuses, SQLite schema/constraints, artifact paths, TypeScript interfaces, IPC contracts, or serialization meaning requires:

```text
inspect live implementation and compatibility
→ add deterministic failing coverage
→ design migration/compatibility if needed
→ implement explicitly
→ verify affected boundaries
→ document the adopted contract
```

Documentation alone never performs a migration.

---

## 18. Governing data rule

> **If provider evidence does not prove a value, RoofRoom must not invent it, infer it as source fact, copy it from the request into observation, or replace it with zero.**
