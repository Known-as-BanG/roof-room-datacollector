# Google Trends final review and controlled local checkpoint

## Authority and scope

User explicitly authorized review, minimal documentation/corrective edits and
controlled local commits. No push, PR, provider request, retry/new Run, production
mutation, package overwrite, deployment or installed-app update.

Worktree: `/Users/furkan/Projects/roofroom-data-collector/.worktrees/google-analytics-4-source-v1`.
Initial branch: `feat/google-analytics-4-source-v1`; HEAD `a1015a489bb6fa1b190ba997eeefb2456f9492dc`.
Initial index empty; 18 modified tracked files, two relevant untracked approved
implementation plans, one Core helper and four private QA reports.

AGENTS.md, scoped Core instructions, PROJECT_HANDOFF.md, TEST_STRATEGY.md, both
implementation plans and the accepted-evidence/partial-export QA reports were
reviewed. GIT_WORKFLOW.md is absent from the worktree/tracked inventory and root
checkout; the earlier authorized development-checkpoint plan also records its
absence. No replacement workflow policy was invented. The user's explicit
staging and commit restrictions govern this checkpoint.

## Branch and change separation

The GA4-named branch already contains the general Collector checkpoint a1015a4
and earlier Blog/Core work. Every pending source/test change was inspected: none
adds GA4 implementation. Keeping this continuation on the existing branch with
explicit scopes is consistent with that established lineage. Do not change,
merge, rebase or push any other branch.

Coherent commit groups (each index inventory and complete staged diff is reviewed):

1. `fix(google-trends): accept observed Turkish weekly CSV labels`
   - Google Trends parser + validator and their two focused integration tests.
   - Only the locale-compatibility paragraph in DATA_CONTRACTS.md is staged here;
     remaining scope/export contract changes stay unstaged until group 3.
2. `fix(runtime): preserve SQLite import in packaged main`
   - vite.main.config.ts + the actual Forge-build runtime packaging test only.
3. `feat(collector): freeze Trends scope and partial evidence exports`
   - Controller, renderer, scope/UI tests, source-neutral eligibility helper,
     production loader/writer, shared package/desktop types and raw fixture/tests.
   - Remaining canonical contract, concise current handoff, both approved
     implementation plans and this review/verification record.

Private reports, raw provider files, databases, receipts, screenshots and temporary
QA scripts/packages are excluded. Existing report contents and historical evidence
are preserved. No unrelated tracked change was identified or silently absorbed.

## Review finding and narrow correction

An independent read-only review found a material scope-check bypass: clearing both
source configuration task IDs skipped the trusted-scope guard even while the root
reviewed task still identified Google Trends. A modified query was reserved in an
in-memory reproduction. This was reported before any staging/commit.

Added the exact regression: retain the root Trends task, remove both source task
IDs and change reviewed query text. RED: missing expected rejection. The minimum
correction includes `reviewedDraft.task_id` in the existing guard; genuine taskless
legacy input remains compatible. GREEN: full controller gate, including unchanged
reservation count for this rejected input. No new provider behavior or abstraction.
No additional material finding was identified in the connected parser/validator,
packaging, provenance, redaction, partial snapshot or filesystem publication paths.

## Verification and acceptance boundaries

Focused commands (all local fixtures/mocks, no provider calls):

- `bash tests/integration/google-trends/run-interest-over-time-parser-validator-test.sh`
- `bash tests/integration/google-trends/run-collection-validator-adapter-test.sh`
- `bash tests/integration/google-trends/run-runtime-packaging-config-test.sh`
- `bash tests/integration/app/run-desktop-multisource-flow-test.sh` (RED then GREEN for correction)
- `bash tests/integration/export/run-general-raw-evidence-export-test.sh`
- `bash tests/integration/export/run-production-data-package-loader-test.sh`
- `bash tests/integration/export/run-data-package-exporter-test.sh`
- `bash tests/integration/app/run-desktop-retry-export-test.sh`
- `bash tests/integration/app/run-desktop-ui-smoke-test.sh`
- `npx tsc --noEmit`; scoped source/test ESLint with the worktree's isolated config;
  working/staged `git diff --check`.

Prior QA isolation (5/5), packaged scope/runtime and real-evidence partial delivery
are reused from the existing immutable QA reports; no full rebuild or packaged/live
re-run is needed for this review's pure guard correction. The new adversarial guard
case is deterministically verified only; existing packaged receipts predate it.

GT01 historical Attempt 2 is completed/valid, 15/15 checks; accepted native CSV
size/hash and 525/525 derivative values (205 zeros) were verified in the audit.
Prior isolated packaged ALL/SUCCESSFUL_ONLY exports delivered exact native bytes,
retained all five Jobs and both GT01 Attempts and reported INCOMPLETE while the
Run stayed RETRY_REQUIRED. Attempt 1 remains RATE_LIMITED/HTTP 429. This does not
establish other Trends scenarios, GT02–GT05 success, a completed Run, other-source
live acceptance, large-volume reliability or an installed-app update.

## Controlled staging and preservation

Stage explicit paths only; review staged filenames/stat/check/full diff before
each commit. The locale-only contract index patch does not modify the working
file or stage other contract changes. No reset, stash, amend, blanket add or hook
bypass. No executable Git hooks were present at inspection. Actual commit SHAs
and remaining status belong in the final task report/Git history.

Private review evidence: `/private/tmp/roofroom-final-review-rtbo2asy`.
Historical QA reports remain untracked and are never part of these commits.

## Final focused results

All nine integration runners listed above passed. The general raw suite passed
13/13 on the final controller, including partial/terminal provenance and byte
checks. The missing-source-task-ID regression failed with missing rejection before
its one-clause correction, then the full controller suite passed. The independent
reviewer rechecked the fix in memory: forged input rejected before reservation,
valid trusted input still reserves. No material finding remains.

TypeScript and scoped source lint passed. The first full-file CommonJS lint found
two committed-baseline fixture issues (unused destructuring binding and duplicate
requested_configuration key). Removed only that redundant binding/key in the same
reviewed test files, retaining the effective fixture values and negative test.
Both affected tests and all selected CommonJS lint then passed. Working/staged
whitespace checks are required immediately before each commit.

No new package/live acceptance was run. Existing QA reports remain immutable and
untracked. Current docs distinguish historical GT01 acquisition/packaged delivery
from the new deterministically verified scope hardening and remaining limitations.
