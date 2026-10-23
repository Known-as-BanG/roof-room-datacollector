const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const [buildRoot, workRoot] = process.argv.slice(2);
const load = (file) => require(path.join(buildRoot, file));
const { resolveDesktopDatePolicy } = load('shared/desktop-run-resolution.js');
const { DESKTOP_TASK_CATALOG } = load('desktop-task-catalog.js');
const { DesktopMultiSourceController } = load('main/app/desktop-multisource-controller.js');
const { createProductionCollectionRuntime } = load('main/app/production-collection-runtime.js');
const { GoogleApiRuntimeFactory } = load('main/sources/google-api/google-api-runtime.js');
const { initializeDatabase, getDatabasePath } = load('main/storage/database.js');
const { StateRepository } = load('main/storage/state-repository.js');
const SOURCE = 'google-ads-search-terms';
const POLICY = 'TODAY_MINUS_17_TO_YESTERDAY';
const expectedContext = {
  customer_id: '1234567890',
  task_id: SOURCE, source_id: SOURCE, source_mode: 'search_term_view', campaign_type: 'SEARCH',
  reference_date: '2026-09-17', date_policy: POLICY,
  requested_date_start: '2026-08-31', requested_date_end: '2026-09-16',
};
const credentials = {
  readCredential: async () => JSON.stringify({ client_id: 'fixture', refresh_token: 'fixture-refresh', developer_token: 'fixture-developer' }),
};

test('ADS-REVIEW-DATE-001: 17 calendar days crosses the month boundary exactly', () => {
  assert.deepEqual(resolveDesktopDatePolicy(POLICY, '2026-09-17'), {
    reference_date: '2026-09-17', date_policy: POLICY,
    requested_date_start: '2026-08-31', requested_date_end: '2026-09-16',
  });
});

test('ADS-REVIEW-BOUND-001: Review → atomic persisted Job → production requester survives next-day Start and reopen', async (t) => {
  const directories = Object.fromEntries(['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads'].map(key => [key, path.join(workRoot, key)]));
  directories.app_data_root = workRoot;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');
  let repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'Ads test' });
  repository.upsertSourceConnection({ workspace_id: workspace.workspace_id, source_id: SOURCE, credential_ref: 'fixture-credential', safe_metadata: { customer_id: '123-456-7890' } });
  let clock = new Date('2026-09-17T12:00:00.000Z');
  const controller = new DesktopMultiSourceController({ repository, application_version: 'test', now: () => clock, readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) } });
  const task = DESKTOP_TASK_CATALOG.find(task => task.task_id === SOURCE);
  const draft = await controller.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  for (const customer_id of [undefined, null, '', 'invalid', '123-456-7890', '456']) {
    draft.reusable_configuration = { sources: { [SOURCE]: { included: true, task_id: task.task_id, date_policy: task.date_policy,
      ...(customer_id === undefined ? {} : { customer_id }) } } };
    const blocked = await controller.reviewDraft(draft);
    assert.equal(blocked.can_start, false, 'No desktop path may infer selection from the connected account.');
    await assert.rejects(controller.startDraft(draft), /cannot start|account|customer|ready/i);
    assert.equal(repository.listRuns(workspace.workspace_id).length, 0);
  }
  draft.reusable_configuration = { sources: { [SOURCE]: { included: true, task_id: task.task_id, date_policy: task.date_policy, customer_id: '1234567890' } } };
  const conflictingInput = structuredClone(draft);
  conflictingInput.reusable_configuration.sources[SOURCE].jobs = [{ ...expectedContext, customer_id: '456' }];
  assert.equal((await controller.reviewDraft(conflictingInput)).can_start, false,
    'Initial Review must reject conflicting Job accounts before rebuilding managed task Jobs.');
  assert.equal(conflictingInput.reusable_configuration.sources[SOURCE].jobs[0].customer_id, '456');
  for (const supported of DESKTOP_TASK_CATALOG.filter((candidate) => candidate.source_id === SOURCE)) {
    const selected = structuredClone(draft);
    Object.assign(selected.reusable_configuration.sources[SOURCE], { task_id: supported.task_id, date_policy: supported.date_policy });
    const supportedReview = await controller.reviewDraft(selected);
    assert.equal(supportedReview.can_start, true);
    assert.equal(supportedReview.reviewed_draft.resolved_configuration.sources[SOURCE].jobs[0].customer_id, '1234567890');
  }
  const review = await controller.reviewDraft(draft);
  assert.ok(review.reviewed_draft, 'Ads Review must return an absolute-date artifact');
  assert.equal(review.can_start, true);
  const reviewed = structuredClone(review.reviewed_draft);
  const reviewedSource = reviewed.resolved_configuration.sources[SOURCE];
  assert.equal(reviewedSource.customer_id, '1234567890');
  assert.equal(reviewedSource.jobs[0].customer_id, '1234567890');
  const { isDesktopRunDraft, isDesktopReviewedRunDraft } = load('shared/desktop-multisource.js');
  assert.equal(isDesktopRunDraft(draft), true);
  assert.equal(isDesktopReviewedRunDraft(reviewed), true);
  const conflicting = structuredClone(reviewed); conflicting.resolved_configuration.sources[SOURCE].jobs[0].customer_id = '456';
  await assert.rejects(controller.startDraft(conflicting), /cannot start|ready|account|customer/i);
  assert.equal(repository.listRuns(workspace.workspace_id).length, 0);
  assert.equal(reviewedSource.requested_date_start, '2026-08-31');
  assert.equal(reviewedSource.requested_date_end, '2026-09-16');
  assert.equal(reviewed.reference_date, '2026-09-17');
  clock = new Date('2026-09-18T12:00:00.000Z');
  repository.upsertSourceConnection({ workspace_id: workspace.workspace_id, source_id: SOURCE, credential_ref: 'fixture-credential', safe_metadata: { customer_id: '9999999999' } });
  await assert.rejects(controller.startDraft(reviewed), /account.*changed|customer|account/i);
  assert.equal(repository.listRuns(workspace.workspace_id).length, 0);
  repository.upsertSourceConnection({ workspace_id: workspace.workspace_id, source_id: SOURCE, credential_ref: 'fixture-credential', safe_metadata: { customer_id: '123-456-7890' } });
  const started = await controller.startDraft(review.reviewed_draft);
  assert.deepEqual(review.reviewed_draft, reviewed, 'Start must not mutate Review');
  assert.deepEqual(started.jobs[0].source_context, expectedContext);
  assert.equal(started.run.configuration_snapshot.requested_date_start, '2026-08-31');
  assert.equal(started.run.configuration_snapshot.requested_date_end, '2026-09-16');
  assert.equal(started.run.configuration_snapshot.reference_date, '2026-09-17');
  assert.deepEqual(repository.getLastRunSettings(workspace.workspace_id).reusable_configuration, reviewed.reusable_configuration);
  await assert.rejects(() => controller.startDraft(reviewed), /active Run/i);
  assert.equal(repository.listRuns(workspace.workspace_id).length, 1);
  repository.close();
  repository = new StateRepository(getDatabasePath(directories));
  assert.deepEqual(repository.listJobs(started.run.run_id)[0].source_context, expectedContext);

  const requests = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
    assert.equal(url, 'https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream');
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    // Official-schema-shaped deterministic fixture; this does not call Google.
    return Response.json([{ results: [{
      customer: { id: '1234567890', timeZone: 'Europe/Istanbul' },
      searchTermView: { searchTerm: 'ficus', status: 'NONE' },
      campaign: { id: '1', name: 'Search Campaign', advertisingChannelType: 'SEARCH' },
      adGroup: { id: '2', name: 'Ficus Group' },
      segments: {
        keyword: { adGroupCriterion: 'customers/123/adGroupCriteria/2~3', info: { text: 'ficus plant', matchType: 'PHRASE' } },
        searchTermMatchType: 'NEAR_PHRASE', date: '2026-09-01',
      },
      metrics: { impressions: '2', clicks: '1' },
    }] }]);
  };
  const runtime = createProductionCollectionRuntime({ repository, directories, credentialStore: credentials, googleTrendsSource: { id: 'google-trends' } });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);
  assert.equal(requests.length, 1, 'Production orchestration must reach the mocked Ads requester');
  const query = requests[0].body.query;
  assert.match(query, /FROM search_term_view\b/);
  assert.match(query, /campaign\.advertising_channel_type\s*=\s*'SEARCH'/);
  const dates = query.match(/segments\.date BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/);
  assert.ok(dates, 'Actual GAQL must contain an absolute date restriction');
  assert.deepEqual(dates.slice(1), [reviewedSource.requested_date_start, reviewedSource.requested_date_end]);
  assert.equal(repository.listJobs(started.run.run_id)[0].execution_status, 'COMPLETED');
  assert.deepEqual(repository.listJobs(started.run.run_id)[0].source_context, expectedContext);
  const completedJob = repository.listJobs(started.run.run_id)[0];
  const { StorageManager } = load('main/storage/storage-manager.js');
  const artifact = repository.getArtifact(completedJob.accepted_artifact_id);
  const raw = fs.readFileSync(new StorageManager(directories).resolveRunRelativePath(started.run.run_id, artifact.relative_path));
  assert.equal(require('node:crypto').createHash('sha256').update(raw).digest('hex'), artifact.sha256);
  assert.deepEqual(JSON.parse(raw.toString())[0].results[0].customer,
    { id: '1234567890', timeZone: 'Europe/Istanbul' });
  assert.equal(completedJob.source_context.customer_id, '1234567890');
  assert.equal(Object.hasOwn(completedJob.source_context, 'time_zone'), false);
  const { ProductionDataPackageLoader } = load('main/export/production-data-package-loader.js');
  const { assembleBlogWritingPackV2Draft } = load('main/blog-writing-packs/blog-writing-pack-assembler.js');
  const { BlogWritingPackStore } = load('main/blog-writing-packs/blog-writing-pack-store.js');
  const { evaluateBlogWritingPackV2Readiness } = load('main/blog-writing-packs/blog-writing-pack-v2-readiness.js');
  const { BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS } = load('shared/blog-writing-pack-v2-readiness.js');
  const loader = new ProductionDataPackageLoader(repository, new StorageManager(directories));
  const blogDraft = await assembleBlogWritingPackV2Draft({ package_id: 'desktop-ads-draft', application_version: 'test',
    created_at: clock.toISOString(), selection: { recipe_version: 2, workspace_id: workspace.workspace_id,
      selections: [{ run_id: started.run.run_id, job_id: completedJob.job_id, artifact_id: artifact.artifact_id }] } }, { repository, loader });
  const store = new BlogWritingPackStore(path.join(workRoot, 'synthetic-blog-drafts')); await store.saveDraft(blogDraft);
  const blogReadiness = await evaluateBlogWritingPackV2Readiness({ package_id: blogDraft.package_id, workspace_id: workspace.workspace_id,
    requirements: BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS, evaluation_phase: 'PUBLICATION', evaluated_at: clock.toISOString() }, { store, repository, loader });
  assert.equal(blogReadiness.field_checks[0].publication_time_context.selected_customer_id, '1234567890');
  assert.deepEqual(blogReadiness.field_checks[0].publication_time_context.observed_customer_ids, ['1234567890']);
  assert.equal(blogReadiness.field_checks[0].publication_time_context.time_zone, 'Europe/Istanbul');
  assert.ok(blogReadiness.blockers.some((blocker) => blocker.requirement_id === 'ads_completed_days'),
    'The desktop 17-day task must retain its independent Blog 30-day window blocker.');
  console.log(`ADS MOCK REQUEST: ${query}`);
});

test('ADS-SOURCE-CONTEXT-001: source uses each explicit context and rejects unsupported scope before requests', async () => {
  const requests = [];
  const factory = new GoogleApiRuntimeFactory({ getSourceConnection: () => ({ source_id: SOURCE, credential_ref: 'fixture', safe_metadata: { customer_id: '123' } }) }, credentials, async request => {
    if (request.url === 'https://oauth2.googleapis.com/token') return { status: 200, body: { access_token: 'fixture', expires_in: 3600 } };
    requests.push(request);
    return { status: 200, body: [] };
  });
  const source = factory.createSearchTermsSource({ workspace_id: 'fixture', query: 'SELECT stale_constructor_query' });
  const context = { source_id: SOURCE, source_context: { ...expectedContext, customer_id: '123' } };
  assert.equal((await source.collect(context)).result_type, 'ARTIFACT_PRODUCED');
  assert.match(requests[0].body.query, /segments\.date BETWEEN '2026-08-31' AND '2026-09-16'/);
  const second = { ...context.source_context, requested_date_start: '2026-09-01', requested_date_end: '2026-09-17' };
  await source.collect({ ...context, source_context: second });
  assert.match(requests[1].body.query, /segments\.date BETWEEN '2026-09-01' AND '2026-09-17'/);
  for (const invalid of [
    { ...context.source_context, campaign_type: 'PERFORMANCE_MAX' },
    { ...context.source_context, source_mode: 'campaign_search_term_view' },
    { ...context.source_context, task_id: 'other-task' },
    { ...context.source_context, requested_date_start: '2026-02-30' },
    { ...context.source_context, requested_date_start: '2026-09-18' },
    {},
  ]) {
    assert.equal((await source.collect({ ...context, source_context: invalid })).result_type, 'FAILED');
  }
  assert.equal(requests.length, 2, 'Invalid context must never reach the provider');
});

test('account-bound native validation rejects mismatched provider identity and missing/invalid timezone; legacy stays unassigned', async () => {
  const { GoogleAdsSearchTermsValidator } = load('main/sources/google-ads/search-terms-validator.js');
  const filename = path.join(workRoot, 'account-validator.json');
  const row = { searchTermView: { searchTerm: 'synthetic', status: 'NONE' },
    campaign: { id: '1', name: 'Synthetic', advertisingChannelType: 'SEARCH' }, adGroup: { id: '2', name: 'Synthetic' },
    segments: { date: '2026-09-01', searchTermMatchType: 'EXACT' }, metrics: { clicks: '0' } };
  const context = { run: { run_id: 'run' }, job: { source_id: SOURCE, run_id: 'run', source_context: { customer_id: '123' } },
    artifact: { source_id: SOURCE, run_id: 'run' }, absolute_path: filename };
  for (const [customer, expected] of [
    [{ id: '123', timeZone: 'Europe/Istanbul' }, 'VALID'],
    [{ id: '456', timeZone: 'Europe/Istanbul' }, 'INVALID_SCHEMA'],
    [{ id: '123' }, 'INVALID_SCHEMA'],
    [{ id: '123', timeZone: 'invalid/zone' }, 'INVALID_SCHEMA'],
    [undefined, 'INVALID_SCHEMA'],
  ]) {
    fs.writeFileSync(filename, JSON.stringify([{ results: [{ ...row, customer }] }]));
    assert.equal((await new GoogleAdsSearchTermsValidator().validate(context)).validation_status, expected);
  }
  fs.writeFileSync(filename, '[]');
  assert.equal((await new GoogleAdsSearchTermsValidator().validate(context)).validation_status, 'NO_DATA');
  const legacyContext = { ...context, job: { ...context.job, source_context: {} } };
  fs.writeFileSync(filename, JSON.stringify([{ search_term: 'legacy', clicks: 0 }]));
  assert.equal((await new GoogleAdsSearchTermsValidator().validate(legacyContext)).validation_status, 'VALID');
  assert.deepEqual(legacyContext.job.source_context, {});
});

const explicitConfig = {
  included: true, task_id: 'google-ads-search-terms-7-days', customer_id: '1234567890',
  date_mode: 'EXPLICIT', requested_date_start: '2026-10-05', requested_date_end: '2026-10-11',
};
const explicitContext = {
  customer_id: '1234567890', task_id: SOURCE, source_id: SOURCE,
  source_mode: 'search_term_view', campaign_type: 'SEARCH', reference_date: '2026-10-22',
  date_policy: 'EXPLICIT', requested_date_start: '2026-10-05', requested_date_end: '2026-10-11',
};
const explicitFixture = async (t, name) => {
  const base = path.join(workRoot, name);
  const directories = Object.fromEntries(['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads'].map(key => [key, path.join(base, key)]));
  directories.app_data_root = base; directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');
  const repository = new StateRepository(getDatabasePath(directories)); t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'Synthetic explicit Ads acceptance' });
  repository.upsertSourceConnection({ workspace_id: workspace.workspace_id, source_id: SOURCE, credential_ref: 'fixture', safe_metadata: { customer_id: '123-456-7890' } });
  let clock = new Date('2026-10-22T12:00:00.000Z');
  const controller = new DesktopMultiSourceController({ repository, application_version: 'test', now: () => clock,
    readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) } });
  const draft = await controller.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  draft.reusable_configuration = { sources: { [SOURCE]: structuredClone(explicitConfig) } };
  return { repository, controller, workspace, directories, draft, nextDay: () => { clock = new Date('2026-10-23T12:00:00.000Z'); } };
};

test('explicit inclusive dates survive Review, next-day reservation, database reopen and the mocked provider query', async (t) => {
  const f = await explicitFixture(t, 'explicit-e2e');
  const before = structuredClone(f.draft);
  const review = await f.controller.reviewDraft(f.draft);
  assert.equal(review.can_start, true); assert.equal(review.job_count, 1);
  assert.deepEqual(f.draft, before);
  assert.deepEqual(review.reviewed_draft.resolved_configuration.sources[SOURCE].jobs, [explicitContext]);
  f.nextDay();
  const originalReview = structuredClone(review.reviewed_draft);
  const state = await f.controller.startDraft(review.reviewed_draft);
  assert.deepEqual(review.reviewed_draft, originalReview);
  assert.deepEqual(state.jobs.map(job => job.source_context), [explicitContext]);
  assert.equal(state.run.configuration_snapshot.date_policy, 'EXPLICIT');
  const reopened = new StateRepository(getDatabasePath(f.directories)); t.after(() => reopened.close());
  assert.deepEqual(reopened.listJobs(state.run.run_id)[0].source_context, explicitContext);
  const requests = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
    assert.equal(url, 'https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream');
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json([{ results: [{
      customer: { id: '1234567890', timeZone: 'Europe/Istanbul' },
      searchTermView: { searchTerm: 'synthetic', status: 'NONE' },
      campaign: { id: '1', name: 'Synthetic Search', advertisingChannelType: 'SEARCH' },
      adGroup: { id: '2', name: 'Synthetic Group' },
      segments: { keyword: { adGroupCriterion: 'customers/1234567890/adGroupCriteria/2~3', info: { text: 'synthetic', matchType: 'PHRASE' } }, searchTermMatchType: 'NEAR_PHRASE', date: '2026-10-05' },
      metrics: { impressions: '2', clicks: '1' },
    }] }]);
  };
  const runtime = createProductionCollectionRuntime({ repository: f.repository, directories: f.directories,
    credentialStore: credentials, googleTrendsSource: { id: 'google-trends' } });
  await runtime.orchestrator.runUntilBlocked(state.run.run_id);
  assert.equal(requests.length, 1);
  assert.match(requests[0].body.query, /FROM search_term_view WHERE campaign\.advertising_channel_type = 'SEARCH' AND segments\.date BETWEEN '2026-10-05' AND '2026-10-11'$/);
  const job = reopened.listJobs(state.run.run_id)[0];
  assert.equal(job.execution_status, 'COMPLETED'); assert.equal(job.validation_status, 'VALID');
  assert.deepEqual(job.source_context, explicitContext);
  assert.equal(job.attempt_count, 1);
  const artifact = reopened.getArtifact(job.accepted_artifact_id);
  assert.equal(artifact.attempt_number, 1);
  const { StorageManager } = load('main/storage/storage-manager.js');
  const raw = fs.readFileSync(new StorageManager(f.directories).resolveRunRelativePath(state.run.run_id, artifact.relative_path));
  assert.equal(require('node:crypto').createHash('sha256').update(raw).digest('hex'), artifact.sha256);
  for (const field of ['country_code', 'country_filter', 'language_code', 'device', 'network', 'keyword_plan_network']) assert.equal(Object.hasOwn(state.jobs[0].source_context, field), false);
});

test('explicit and mixed invalid date inputs fail closed without rolling substitution or reservation', async (t) => {
  const f = await explicitFixture(t, 'explicit-invalid');
  for (const patch of [
    { requested_date_start: undefined }, { requested_date_end: undefined },
    { requested_date_start: '2026-02-30' }, { requested_date_end: 'not-a-date' },
    { requested_date_start: '2026-10-12' }, { requested_date_end: null },
    { date_mode: 'UNKNOWN' }, { date_mode: null }, { date_policy: 'TODAY_MINUS_7_TO_YESTERDAY' },
    { date_mode: 'ROLLING', date_policy: 'TODAY_MINUS_7_TO_YESTERDAY' },
    { date_mode: undefined, date_policy: 'TODAY_MINUS_7_TO_YESTERDAY' },
  ]) {
    const invalid = structuredClone(f.draft);
    Object.assign(invalid.reusable_configuration.sources[SOURCE], patch);
    const review = await f.controller.reviewDraft(invalid);
    assert.equal(review.can_start, false, JSON.stringify(patch));
    await assert.rejects(f.controller.startDraft(invalid), /cannot start|ready|date|scope/i);
    assert.equal(f.repository.listRuns(f.workspace.workspace_id).length, 0);
  }
  const sameDay = structuredClone(f.draft);
  sameDay.reusable_configuration.sources[SOURCE].requested_date_end = '2026-10-05';
  const review = await f.controller.reviewDraft(sameDay);
  assert.equal(review.can_start, true);
  assert.equal(review.reviewed_draft.resolved_configuration.sources[SOURCE].jobs[0].requested_date_end, '2026-10-05');
});

test('legacy rolling task windows remain exact and explicit mode cannot mutate reviewed scope before reservation', async (t) => {
  const f = await explicitFixture(t, 'explicit-integrity');
  for (const task of DESKTOP_TASK_CATALOG.filter(task => task.source_id === SOURCE)) {
    const rolling = structuredClone(f.draft);
    rolling.reusable_configuration.sources[SOURCE] = { included: true, task_id: task.task_id, date_policy: task.date_policy, customer_id: '1234567890' };
    const review = await f.controller.reviewDraft(rolling);
    assert.equal(review.can_start, true);
    const range = resolveDesktopDatePolicy(task.date_policy, '2026-10-22');
    assert.deepEqual(review.reviewed_draft.resolved_configuration.sources[SOURCE].jobs[0], {
      ...explicitContext, ...range,
    });
  }
  const review = await f.controller.reviewDraft(f.draft);
  const mutate = [
    r => { r.resolved_configuration.sources[SOURCE].requested_date_start = '2026-10-06'; },
    r => { r.resolved_configuration.sources[SOURCE].jobs[0].requested_date_end = '2026-10-12'; },
    r => { r.reusable_configuration.sources[SOURCE].requested_date_end = '2026-10-12'; },
    r => { r.resolved_configuration.sources[SOURCE].jobs.push(structuredClone(explicitContext)); },
    r => { r.resolved_configuration.sources[SOURCE].jobs[0].campaign_type = 'PERFORMANCE_MAX'; },
    r => { r.resolved_configuration.sources[SOURCE].jobs[0].source_mode = 'other_resource'; },
    r => { r.resolved_configuration.sources[SOURCE].date_policy = 'TODAY_MINUS_7_TO_YESTERDAY'; },
    r => { r.reference_date = '2026-10-12'; },
  ];
  for (const change of mutate) {
    const modified = structuredClone(review.reviewed_draft); change(modified);
    await assert.rejects(f.controller.startDraft(modified), /scope|date|changed|invalid/i);
    assert.equal(f.repository.listRuns(f.workspace.workspace_id).length, 0);
  }
});
