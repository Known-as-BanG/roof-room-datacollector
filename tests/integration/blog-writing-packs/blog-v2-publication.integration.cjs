const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { fixture, families, syntheticRequirements } = require('./blog-v2-readiness-fixture.cjs');
const load = (name) => require(path.join(process.argv[2], name));
const publisherFile = path.join(process.argv[2], 'main/blog-writing-packs/blog-writing-pack-v2-publisher.js');
const { publishBlogWritingPackV2 } = fs.existsSync(publisherFile) ? require(publisherFile) : {};
const { inspectBlogWritingPackV2Fields } = load('main/blog-writing-packs/blog-writing-pack-v2-field-compliance.js');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const reference = (relative_path, bytes) => ({ relative_path, sha256: sha(bytes), byte_size: bytes.length });
const at = '2026-10-08T10:00:00.000Z';

const bindSerpReceipt = (f, selected, received_at) => {
  const artifact = f.artifacts.get(selected.artifact_id); const job = f.jobs.get(selected.job_id);
  const attempt = [...f.attempts.values()].find((item) => item.job_id === selected.job_id);
  const filename = path.join(f.root, 'runs', selected.run_id, 'serpapi', 'metadata', `${job.job_key}.metadata.json`);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify({ schema_version: 2, source_id: 'serpapi', source_mode: 'THIRD_PARTY_API',
    run_id: selected.run_id, job_id: selected.job_id, job_key: job.job_key, attempt_id: attempt.attempt_id, attempt_number: 1,
    raw_artifact_id: selected.artifact_id, raw_relative_path: artifact.relative_path, source_context: job.source_context,
    acquisition_metadata: { response_received_at: received_at, response_received_at_origin: 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT' } }));
  return filename;
};

// This assessment is a format/storage fixture, never the real policy evaluator.
const storageFixture = async (withGscDates = false) => {
  const f = fixture();
  const selections = families.map(([source, dataset], i) => f.add(`storage_${i}`, source, dataset));
  const metadataFile = bindSerpReceipt(f, selections[5], '2026-10-01T10:00:00.000Z');
  const gscMetadataFile = withGscDates ? bindGscDates(f, selections[1]) : undefined;
  const draft = await f.persist(selections);
  const files = draft.selected_evidence.map((evidence, i) => {
    const bytes = fs.readFileSync(path.join(f.root, 'runs', evidence.run_id, 'raw.json'));
    return { reference: reference(`evidence/${String(i).padStart(6, '0')}/raw.bin`, bytes), bytes };
  });
  const evaluation = { evaluation_version: 1, recipe_version: 2, draft_package_id: draft.package_id,
    workspace_id: draft.workspace_id, evaluation_phase: 'PUBLICATION', evaluated_at: at,
    coverage_scope: 'EXPLICIT_REQUIREMENTS_ONLY', coverage_status: 'COMPLETE', delivery_readiness: 'NOT_EVALUATED',
    requirements: syntheticRequirements(), selected_evidence: draft.selected_evidence,
    datasets: families.map(([, dataset_type]) => ({ dataset_type, selected_count: 1, usable_count: 1, coverage_status: 'SATISFIED' })),
    blockers: [], field_checks: [],
  };
  const payload = { schema_version: '2.0', recipe_id: 'BLOG_WRITING_PACK', recipe_version: 2,
    package_id: 'json-package', workspace_id: draft.workspace_id, draft_id: draft.package_id,
    members: draft.selected_evidence.map((evidence, i) => ({ evidence, raw: files[i].reference,
      normalized: { rows: [{ synthetic_observation: i }], implementation: 'synthetic-storage-fixture' },
      derived: { rows: [], transformations: [] } })),
  };
  const manifest = { schema_version: '2.0', recipe_id: 'BLOG_WRITING_PACK', recipe_version: 2,
    package_id: payload.package_id, workspace_id: draft.workspace_id, draft_id: draft.package_id,
    created_at: at, application_version: 'synthetic-test', selected_evidence: draft.selected_evidence,
    publication_status: 'JSON_ONLY_PUBLISHED', delivery_status: 'INCOMPLETE',
    readiness: { rule_version: 'blog-v2-publication-1', evaluated_at: at, verdict: 'SATISFIED', evaluation },
  };
  const metadataBytes = fs.readFileSync(metadataFile);
  const metadata = { reference: reference('evidence/000005/acquisition-metadata.json', metadataBytes), bytes: metadataBytes };
  payload.members[5].acquisition_metadata = metadata.reference;
  files.push(metadata);
  if (gscMetadataFile) {
    const bytes = fs.readFileSync(gscMetadataFile);
    const file = { reference: reference('evidence/000001/acquisition-metadata.json', bytes), bytes };
    payload.members[1].acquisition_metadata = file.reference; files.push(file);
  }
  return { f, draft, files, payload, manifest };
};
const write = async (s, mutate = () => {}) => {
  assert.equal(typeof s.f.store.publishJsonV2, 'function', 'The v2 store needs an independent JSON-only publication path.');
  return s.f.store.publishJsonV2(s.payload.package_id, async (writeEvidence) => {
    for (const file of s.files) await writeEvidence(file.reference, file.bytes);
    mutate(s);
    return { payload: s.payload, manifest: s.manifest };
  });
};

test('JSON-only storage publishes synthetic complete multi-Run membership with exact bytes and verifiable hashes', async () => {
  const s = await storageFixture();
  const draftBefore = fs.readFileSync(path.join(s.f.root, 'packages', 'draft', 'BLOG_DRAFT.json'));
  const result = await write(s);
  assert.equal(result.manifest.publication_status, 'JSON_ONLY_PUBLISHED');
  const reloaded = await s.f.store.readJsonV2('json-package');
  assert.deepEqual(reloaded.payload, s.payload);
  assert.deepEqual(reloaded.manifest.selected_evidence, s.draft.selected_evidence);
  assert.equal(reloaded.manifest.delivery_status, 'INCOMPLETE');
  assert.equal(new Set(reloaded.payload.members.map((m) => m.evidence.run_id)).size, 7);
  const directory = path.join(s.f.root, 'packages', 'json-package');
  assert.deepEqual(fs.readdirSync(directory).sort(), ['evidence', 'manifest.json', 'payload.json']);
  for (const file of reloaded.manifest.files) {
    const bytes = fs.readFileSync(path.join(directory, file.relative_path));
    assert.deepEqual(reference(file.relative_path, bytes), file);
  }
  assert.equal(reloaded.manifest.files.some((file) => file.relative_path === 'manifest.json'), false);
  s.files.forEach((file) => assert.deepEqual(fs.readFileSync(path.join(directory, file.reference.relative_path)), file.bytes));
  assert.equal(reloaded.payload.members[5].acquisition_metadata.sha256, s.draft.selected_evidence[5].serp_acquisition.metadata_sha256);
  assert.deepEqual(fs.readFileSync(path.join(s.f.root, 'packages', 'draft', 'BLOG_DRAFT.json')), draftBefore);
  await assert.rejects(s.f.store.readManifest('json-package'), /manifest|package|invalid/i);
});

test('v2 JSON storage refuses overwrite and rejects blockers or cross-Workspace provenance without completed output', async () => {
  const s = await storageFixture(); await write(s);
  const before = fs.readFileSync(path.join(s.f.root, 'packages', 'json-package', 'manifest.json'));
  await assert.rejects(write(s), /exists|overwrite/i);
  assert.deepEqual(fs.readFileSync(path.join(s.f.root, 'packages', 'json-package', 'manifest.json')), before);
  for (const mutate of [
    (s) => s.manifest.readiness.evaluation.blockers.push({ mandatory: true, code: 'DATASET_MISSING' }),
    (s) => s.manifest.readiness.evaluation.blockers.push({ mandatory: false, dataset_type: 'INTEREST_OVER_TIME', code: 'MEMBERSHIP_CHANGED' }),
    (s) => { s.payload.members[0].evidence.workspace_id = 'another'; },
    (s) => { s.manifest.created_at = 'invalid'; },
    (s) => { s.manifest.readiness.evaluation.evaluated_at = '2026-10-01T00:00:00.000Z'; },
  ]) {
    const t = await storageFixture();
    await assert.rejects(write(t, mutate), /invalid|block|ready|identity|publication|Workspace/i);
    assert.deepEqual(fs.readdirSync(path.join(t.f.root, 'packages')), ['draft']);
  }
});

test('v2 readback rejects damaged evidence, payload, extra files and symlinks', async () => {
  for (const damage of ['raw', 'payload', 'extra', 'extra-directory', 'symlink']) {
    const s = await storageFixture(); await write(s);
    const directory = path.join(s.f.root, 'packages', 'json-package');
    if (damage === 'raw') fs.appendFileSync(path.join(directory, s.files[0].reference.relative_path), ' ');
    if (damage === 'payload') fs.appendFileSync(path.join(directory, 'payload.json'), ' ');
    if (damage === 'extra') fs.writeFileSync(path.join(directory, 'extra.json'), '{}');
    if (damage === 'extra-directory') fs.mkdirSync(path.join(directory, 'extra-directory'));
    if (damage === 'symlink') {
      const file = path.join(directory, s.files[0].reference.relative_path);
      fs.unlinkSync(file); fs.symlinkSync(path.join(s.f.root, 'runs', s.draft.selected_evidence[0].run_id, 'raw.json'), file);
    }
    await assert.rejects(s.f.store.readJsonV2('json-package'), /invalid|integrity|file|hash|size|symbolic/i);
  }
});

test('concurrent publications cannot overwrite the same package ID', async () => {
  const s = await storageFixture();
  let release; const ready = new Promise((resolve) => { release = resolve; });
  let prepared; const entered = new Promise((resolve) => { prepared = resolve; });
  const first = s.f.store.publishJsonV2('json-package', async (writeEvidence) => {
    for (const file of s.files) await writeEvidence(file.reference, file.bytes);
    prepared(); await ready;
    return { payload: s.payload, manifest: s.manifest };
  });
  await entered;
  try { await assert.rejects(write(s), /exist|overwrite/i); }
  finally { release(); }
  assert.equal((await first).manifest.publication_status, 'JSON_ONLY_PUBLISHED');
  assert.deepEqual(fs.readdirSync(path.join(s.f.root, 'packages')).sort(), ['draft', 'json-package']);
});

test('reservation cleanup failure cannot misreport a committed verified package as blocked', async () => {
  const s = await storageFixture(); const promises = require('node:fs/promises'); const original = promises.rm;
  promises.rm = async (filename, options) => {
    if (filename === path.join(s.f.root, 'packages', 'json-package.publishing')) throw new Error('Synthetic post-commit cleanup failure');
    return original(filename, options);
  };
  try {
    assert.equal((await write(s)).manifest.publication_status, 'JSON_ONLY_PUBLISHED');
    assert.equal((await s.f.store.readJsonV2('json-package')).manifest.delivery_status, 'INCOMPLETE');
  } finally { promises.rm = original; }
});

const adsBody = (zone, performance_date, customer_id = '123') => [{ results: [{
  customer: { id: customer_id, timeZone: zone },
  searchTermView: { searchTerm: 'synthetic', status: 'ADDED' },
  campaign: { id: '1', name: 'Synthetic', advertisingChannelType: 'SEARCH' },
  adGroup: { id: '2', name: 'Synthetic' },
  segments: { date: performance_date, searchTermMatchType: 'EXACT', keyword: null },
  metrics: { impressions: '2', clicks: '1', ctr: '0.5', costMicros: '2500000', averageCpcMicros: '2500000', conversions: '0', conversionsValue: '0' },
}] }];

test('dedicated Search Terms acquisition requests native account metadata without changing shared reporting queries', () => {
  const { buildSearchTermsQuery, buildSearchTermPerformanceQuery } = load('main/sources/google-ads/search-terms-request.js');
  const context = { source_id: 'google-ads-search-terms', task_id: 'google-ads-search-terms', source_mode: 'search_term_view',
    campaign_type: 'SEARCH', customer_id: '123', requested_date_start: '2026-09-08', requested_date_end: '2026-10-07' };
  const query = buildSearchTermsQuery({ source_id: context.source_id, source_context: context });
  assert.match(query, /\bcustomer\.id\b/);
  assert.match(query, /\bcustomer\.time_zone\b/);
  assert.match(query, /segments.date BETWEEN '2026-09-08' AND '2026-10-07'/);
  assert.match(query, /campaign.advertising_channel_type = 'SEARCH'/);
  const shared = buildSearchTermPerformanceQuery({ dataset_type: 'SEARCH_TERMS', resource_mode: 'search_term_view', ...context });
  assert.doesNotMatch(shared, /customer\.(id|time_zone)/);
});

test('collected account observations survive native validation, accepted loading, frozen membership and publication reevaluation', async () => {
  const { GoogleAdsSearchTermsSource } = load('main/sources/google-ads/google-ads-sources.js');
  const { GoogleAdsSearchTermsValidator } = load('main/sources/google-ads/search-terms-validator.js');
  const f = fixture(); const selected = f.add('account-evidence'); const job = f.jobs.get(selected.job_id);
  Object.assign(job.source_context, { task_id: 'google-ads-search-terms', source_mode: 'search_term_view', campaign_type: 'SEARCH',
    customer_id: '123', requested_date_start: '2026-09-08', requested_date_end: '2026-10-07' });
  const body = adsBody('Europe/Istanbul', '2026-10-07'); const requested = structuredClone(job.source_context);
  const source = new GoogleAdsSearchTermsSource('123', async (request) => {
    assert.match(request.url, /customers\/123\/googleAds:searchStream$/);
    assert.match(request.body.query, /customer.time_zone/);
    return { status: 200, body };
  });
  const collected = await source.collect({ source_id: job.source_id, source_context: job.source_context });
  assert.equal(collected.result_type, 'ARTIFACT_PRODUCED');
  assert.deepEqual(JSON.parse(Buffer.from(collected.bytes).toString()), body);
  assert.deepEqual(job.source_context, requested);
  const filename = path.join(f.root, 'runs', selected.run_id, 'raw.json'); fs.writeFileSync(filename, collected.bytes);
  Object.assign(f.artifacts.get(selected.artifact_id), { byte_size: collected.bytes.length, sha256: sha(collected.bytes) });
  const validated = await new GoogleAdsSearchTermsValidator().validate({ run: f.runs.get(selected.run_id), job,
    artifact: f.artifacts.get(selected.artifact_id), absolute_path: filename, source_context: job.source_context });
  assert.equal(validated.validation_status, 'VALID');
  const draft = await f.persist([selected], '2026-10-08T10:00:00.000Z');
  const original = fs.readFileSync(filename); const draftBytes = fs.readFileSync(path.join(f.root, 'packages', 'draft', 'BLOG_DRAFT.json'));
  const loaded = await f.loader.readAcceptedJobArtifact(selected.run_id, selected.job_id);
  assert.deepEqual(Buffer.from(loaded.bytes), original);
  assert.equal(draft.selected_evidence[0].requested_context.customer_id, '123');
  assert.equal(Object.hasOwn(draft.selected_evidence[0].requested_context, 'time_zone'), false);
  const requirements = syntheticRequirements(); requirements.ads_requested_dates = { start_date: '2026-09-08', end_date: '2026-10-07' };
  const result = await f.evaluate(requirements, at, 'PUBLICATION');
  assert.equal(result.datasets[0].coverage_status, 'SATISFIED');
  const observed = result.field_checks[0].publication_time_context;
  assert.deepEqual(observed.observed_time_zones, ['Europe/Istanbul']);
  assert.equal(observed.requested_date_start, '2026-09-08');
  assert.equal(observed.requested_date_end, '2026-10-07');
  assert.equal(observed.requested_context_origin, 'FROZEN_JOB_CONTEXT');
  assert.deepEqual(observed.observed_performance_dates, ['2026-10-07']);
  assert.equal(observed.reference_origin, 'PACKAGE_CREATED_AT');
  const later = await publishBlogWritingPackV2({ package_id: 'later-account-package', draft_id: 'draft', workspace_id: draft.workspace_id,
    application_version: 'test', requirements }, { store: f.store, repository: f.repository, loader: f.loader, now: () => new Date('2026-10-09T10:00:00.000Z') });
  assert.equal(later.status, 'BLOCKED');
  assert.ok(later.readiness.blockers.some((issue) => issue.requirement_id === 'ads_completed_days'));
  assert.deepEqual(fs.readFileSync(filename), original);
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'packages', 'draft', 'BLOG_DRAFT.json')), draftBytes);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'packages')), ['draft']);
  const mismatch = await new GoogleAdsSearchTermsSource('456', async () => { throw new Error('Must not request a mismatched account'); }).collect({ source_id: job.source_id, source_context: job.source_context });
  assert.equal(mismatch.error_code, 'SOURCE_CONFIGURATION_INVALID');
});

for (const [instant, zone, start, end] of [
  ['2027-01-01T00:30:00.000Z', 'Europe/Istanbul', '2026-12-02', '2026-12-31'],
  ['2026-11-01T20:59:59.000Z', 'Europe/Istanbul', '2026-10-02', '2026-10-31'],
  ['2026-11-01T21:00:00.000Z', 'Europe/Istanbul', '2026-10-03', '2026-11-01'],
  ['2026-03-08T06:59:59.000Z', 'America/New_York', '2026-02-06', '2026-03-07'],
  ['2026-03-08T07:00:00.000Z', 'America/New_York', '2026-02-06', '2026-03-07'],
  ['2026-11-01T05:59:59.000Z', 'America/New_York', '2026-10-02', '2026-10-31'],
  ['2026-11-01T06:00:00.000Z', 'America/New_York', '2026-10-02', '2026-10-31'],
]) test(`Ads account calendar remains thirty completed dates at ${instant} in ${zone}`, () => {
  const result = inspectBlogWritingPackV2Fields('google-ads-search-terms', adsBody(zone, end),
    { customer_id: '123', requested_date_start: start, requested_date_end: end }, undefined, instant, undefined, instant);
  assert.deepEqual(result.publication_issues, []);
  assert.deepEqual([result.publication_time_context.start_date, result.publication_time_context.end_date], [start, end]);
});

test('missing or conflicting Ads context stays blocked without assigning timezone or daily zero observations', () => {
  for (const [body, context, requirement] of [
    [adsBody(undefined, '2026-10-07'), { customer_id: '123', time_zone: 'UTC' }, 'ads_account_timezone'],
    [adsBody('invalid/zone', '2026-10-07'), { customer_id: '123' }, 'ads_account_timezone'],
    [adsBody('UTC', '2026-10-07', '456'), { customer_id: '123' }, 'ads_account_scope'],
    [adsBody('UTC', '2026-10-07'), {}, 'ads_account_scope'],
    [[], { customer_id: '123' }, 'ads_account_timezone'],
  ]) {
    const result = inspectBlogWritingPackV2Fields('google-ads-search-terms', body, context, undefined, at, undefined, at);
    assert.ok(result.publication_issues.some((issue) => issue.requirement_id === requirement));
  }
  const legacy = [{ search_term: 'legacy', impressions: 0, clicks: 0, cost_micros: 0 }];
  const result = inspectBlogWritingPackV2Fields('google-ads-search-terms', legacy, { customer_id: '123', time_zone: 'UTC' }, undefined, at, undefined, at);
  assert.ok(result.publication_issues.some((issue) => issue.requirement_id === 'ads_account_timezone'));
  assert.equal(Object.hasOwn(result.publication_time_context, 'time_zone'), false);
  assert.deepEqual(result.publication_time_context.observed_performance_dates, []);
  assert.equal(result.rows[0].performance_date, null);
  const unsupportedLegacyMetadata = [{ ...legacy[0], customer: { id: '123', timeZone: 'UTC' } }];
  const unsupported = inspectBlogWritingPackV2Fields('google-ads-search-terms', unsupportedLegacyMetadata, { customer_id: '123' }, undefined, at, undefined, at);
  assert.ok(unsupported.publication_issues.some((issue) => issue.requirement_id === 'ads_account_timezone'),
    'Arbitrary customer fields on a legacy flat representation have no established native account-metadata contract.');
  const conflicting = adsBody('UTC', '2026-10-07'); conflicting[0].results.push(adsBody('Europe/Istanbul', '2026-10-07')[0].results[0]);
  assert.ok(inspectBlogWritingPackV2Fields('google-ads-search-terms', conflicting, { customer_id: '123' }, undefined, at, undefined, at)
    .publication_issues.some((issue) => issue.code === 'EVIDENCE_INVALID' && issue.requirement_id === 'ads_account_timezone'));
});

test('publication Ads completed calendar days honor account timezone at year and UTC boundaries', () => {
  const publication_at = '2027-01-01T00:30:00.000Z';
  for (const [zone, start, end] of [['Europe/Istanbul', '2026-12-02', '2026-12-31'], ['America/Los_Angeles', '2026-12-01', '2026-12-30']]) {
    const result = inspectBlogWritingPackV2Fields('google-ads-search-terms', adsBody(zone, end),
      { customer_id: '123', requested_date_start: start, requested_date_end: end }, undefined, publication_at, undefined, publication_at);
    assert.deepEqual([result.publication_time_context.start_date, result.publication_time_context.end_date], [start, end]);
    assert.deepEqual(result.publication_issues, []);
    assert.equal(result.publication.derived.rows[0].values.cost, 2.5);
    assert.equal(Object.hasOwn(result.publication.normalized.rows[0], 'cost'), false);
    const wrong = inspectBlogWritingPackV2Fields('google-ads-search-terms', adsBody(zone, end),
      { customer_id: '123', requested_date_start: '2026-11-01', requested_date_end: end }, undefined, publication_at, undefined, publication_at);
    assert.ok(wrong.publication_issues.some((issue) => issue.requirement_id === 'ads_completed_days'));
  }
});

test('publication Ads timezone must be consistent and bound to the selected account', () => {
  for (const [body, context] of [
    [adsBody('UTC', '2026-10-07'), {}],
    [adsBody('UTC', '2026-10-07', '456'), { customer_id: '123' }],
  ]) {
    const result = inspectBlogWritingPackV2Fields('google-ads-search-terms', body, context, undefined, at, undefined, at);
    assert.ok(result.publication_issues.some((issue) => issue.requirement_id === 'ads_account_scope'));
  }
  const body = adsBody('UTC', '2026-10-07');
  body[0].results.push(adsBody('Europe/Istanbul', '2026-10-07')[0].results[0]);
  const result = inspectBlogWritingPackV2Fields('google-ads-search-terms', body, { customer_id: '123' }, undefined, at, undefined, at);
  assert.ok(result.publication_issues.some((issue) => issue.requirement_id === 'ads_account_timezone' && issue.code === 'EVIDENCE_INVALID'));
});

test('publication GA4 checks the property calendar across year boundaries independently of draft time', () => {
  const { metricBundle } = require('./blog-v2-ga4-fixture.cjs');
  for (const [zone, start, end] of [['Europe/Istanbul', '2026-12-04', '2026-12-31'], ['America/Los_Angeles', '2026-12-03', '2026-12-30']]) {
    const bundle = metricBundle();
    bundle.request.start_date = start; bundle.request.end_date = end;
    const page = JSON.parse(bundle.pages[0].raw_body_text); page.metadata.timeZone = zone;
    bundle.pages[0].raw_body_text = JSON.stringify(page);
    const context = { dataset_type: 'GA4_CONTENT_PERFORMANCE', property_id: '123456789', start_date: start, end_date: end };
    const publication_at = '2027-01-01T00:30:00.000Z';
    const result = inspectBlogWritingPackV2Fields('google-analytics-4', Buffer.from(JSON.stringify(bundle)), context,
      undefined, publication_at, undefined, publication_at);
    assert.deepEqual([result.ga4_context.reporting_window.start_date, result.ga4_context.reporting_window.end_date], [start, end]);
    assert.equal(result.ga4_context.reporting_window.reference_origin, 'PACKAGE_CREATED_AT');
    assert.equal(result.ga4_issues.some((issue) => issue.requirement_id === 'ga4_completed_days'), false);
    const tomorrow = inspectBlogWritingPackV2Fields('google-analytics-4', Buffer.from(JSON.stringify(bundle)), context,
      undefined, '2027-01-02T12:00:00.000Z', undefined, '2027-01-02T12:00:00.000Z');
    assert.ok(tomorrow.ga4_issues.some((issue) => issue.requirement_id === 'ga4_completed_days'));
    assert.equal(Object.hasOwn(result.publication.normalized.rows[0], 'average_engagement_time'), false);
    assert.equal(result.publication.derived.rows[0].values.average_engagement_time, 25.1);
  }
});

test('Planner real monthly observations cannot resolve its missing publication calendar contract', () => {
  const f = fixture(); const selected = f.add('planner-months', 'google-keyword-planner', 'KEYWORD_HISTORICAL_METRICS');
  const context = f.jobs.get(selected.job_id).source_context;
  const names = ['AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER','JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY'];
  const observations = names.map((month, i) => ({ year: i < 5 ? '2025' : '2026', month, monthlySearches: '0' }));
  for (const history of [observations, observations.slice(1), [...observations, observations[0]], [...observations, { year: '2026', month: 'AUGUST', monthlySearches: '11' }]]) {
    const body = { results: [{ text: 'synthetic', keywordMetrics: { monthlySearchVolumes: history } }] };
    const result = inspectBlogWritingPackV2Fields('google-keyword-planner', Buffer.from(JSON.stringify(body)), context, undefined, at, undefined, at);
    assert.ok(result.publication_issues.some((issue) => issue.requirement_id === 'keyword_planner_calendar_context'));
    assert.equal(result.rows[0].monthly_history.length, history.length);
    if (history.length === 11) assert.ok(result.publication_issues.some((issue) => issue.requirement_id === 'keyword_planner_monthly_observations'));
    assert.equal(result.rows[0].monthly_history[0].searches, 0);
  }
});

test('real publisher samples creation after staging and cannot reuse the earlier draft SERP check', async () => {
  assert.equal(typeof publishBlogWritingPackV2, 'function');
  const { f, draft } = await realFixture();
  assert.equal((await f.evaluate()).field_checks.find((c) => c.dataset_type === 'GOOGLE_SERP').serp_freshness.status, 'FRESH');
  let clock = '2026-10-07T10:00:00.000Z';
  const original = f.loader.readAcceptedJobArtifact.bind(f.loader); let reads = 0;
  f.loader.readAcceptedJobArtifact = async (...args) => {
    const result = await original(...args);
    if (++reads === 7) clock = '2026-10-08T10:00:01.000Z';
    return result;
  };
  const result = await publishBlogWritingPackV2({ package_id: 'json-package', draft_id: 'draft', workspace_id: draft.workspace_id,
    requirements: syntheticRequirements(), application_version: 'test' }, { store: f.store, repository: f.repository, loader: f.loader, now: () => new Date(clock) });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.readiness.evaluated_at, clock);
  assert.equal(result.readiness.field_checks.find((c) => c.dataset_type === 'GOOGLE_SERP').serp_freshness.status, 'STALE');
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'packages')), ['draft']);
});

test('real publisher rejects missing/corrupt metadata, raw drift and cross-Workspace membership without completed output', async () => {
  for (const damage of ['missing-metadata', 'corrupt-metadata', 'raw', 'Workspace']) {
    const { f, draft, filename } = await realFixture();
    if (damage === 'missing-metadata') fs.unlinkSync(filename);
    if (damage === 'corrupt-metadata') fs.appendFileSync(filename, 'bad-json');
    if (damage === 'raw') fs.appendFileSync(path.join(f.root, 'runs', draft.selected_evidence[0].run_id, 'raw.json'), ' ');
    await assert.rejects(publishBlogWritingPackV2({ package_id: 'json-package', draft_id: 'draft', workspace_id: damage === 'Workspace' ? 'another' : draft.workspace_id,
      requirements: syntheticRequirements(), application_version: 'test' }, { store: f.store, repository: f.repository, loader: f.loader, now: () => new Date(at) }), /integrity|identity|metadata|checksum|byte size|Workspace/i);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'packages')), ['draft']);
    assert.deepEqual(await f.store.readDraft('draft'), draft);
  }
});

test('publication failures clean staging and unsafe evidence paths cannot escape', async () => {
  for (const fail of [async () => { throw new Error('synthetic failure'); },
    async (writeEvidence) => writeEvidence(reference('../escaped.bin', Buffer.from('x')), Buffer.from('x'))]) {
    const s = await storageFixture();
    assert.equal(typeof s.f.store.publishJsonV2, 'function');
    await assert.rejects(s.f.store.publishJsonV2('json-package', fail), /synthetic|unsafe|path|evidence/i);
    assert.deepEqual(fs.readdirSync(path.join(s.f.root, 'packages')), ['draft']);
  }
});

const realFixture = async (received_at = '2026-10-01T10:00:00.000Z') => {
  const f = fixture(); const selections = families.map(([source, dataset], i) => f.add(`real_${i}`, source, dataset));
  const filename = bindSerpReceipt(f, selections[5], received_at);
  const draft = await f.persist(selections, '2026-10-07T10:00:00.000Z');
  return { f, draft, filename };
};

test('real publisher rechecks the actual creation clock and preserves every current mandatory blocker', async () => {
  assert.equal(typeof publishBlogWritingPackV2, 'function');
  const { f, draft } = await realFixture();
  const newer = f.add('newer-unselected', 'serpapi', 'GOOGLE_SERP');
  bindSerpReceipt(f, newer, '2026-10-08T09:00:00.000Z');
  const before = fs.readFileSync(path.join(f.root, 'packages', 'draft', 'BLOG_DRAFT.json'));
  for (const instant of [at, '2026-10-08T10:00:01.000Z']) {
    const result = await publishBlogWritingPackV2({ package_id: 'json-package', draft_id: 'draft',
      workspace_id: draft.workspace_id, requirements: syntheticRequirements(), application_version: 'test' },
    { store: f.store, repository: f.repository, loader: f.loader, now: () => new Date(instant) });
    assert.equal(result.status, 'BLOCKED', 'Synthetic data cannot clear real capability/scope blockers.');
    assert.equal(result.readiness.evaluation_phase, 'PUBLICATION');
    assert.equal(result.readiness.evaluated_at, instant);
    const check = result.readiness.field_checks.find((c) => c.dataset_type === 'GOOGLE_SERP').serp_freshness;
    assert.equal(check.reference_origin, 'PACKAGE_CREATED_AT');
    assert.equal(check.status, instant === at ? 'FRESH' : 'STALE');
    assert.ok(result.readiness.blockers.some((b) => b.requirement_id === 'gsc_finality'));
    assert.ok(result.readiness.blockers.some((b) => b.requirement_id === 'keyword_planner_calendar_context'));
    assert.deepEqual(result.readiness.selected_evidence, draft.selected_evidence);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'packages')), ['draft']);
  }
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'packages', 'draft', 'BLOG_DRAFT.json')), before);
});

test('publication mode independently uses property-calendar time for GA4 and observed account time for Ads', async () => {
  const { f } = await realFixture();
  const result = await f.evaluate(undefined, at, 'PUBLICATION');
  const ga4 = result.field_checks.find((c) => c.dataset_type === 'GA4_CONTENT_PERFORMANCE').ga4_context.reporting_window;
  assert.equal(ga4.reference_at, at);
  assert.equal(ga4.reference_origin, 'PACKAGE_CREATED_AT');
  assert.deepEqual([ga4.start_date, ga4.end_date], ['2026-09-10', '2026-10-07']);
  assert.ok(result.blockers.some((b) => b.requirement_id === 'ads_account_timezone'));
  assert.ok(result.blockers.some((b) => b.requirement_id === 'gsc_finality'));
});

test('publication representation separates SERP derived domain/date from native result observations', async () => {
  const { f, draft } = await realFixture(); const evidence = draft.selected_evidence[5];
  const loaded = await f.loader.readAcceptedJobArtifact(evidence.run_id, evidence.job_id);
  const result = inspectBlogWritingPackV2Fields('serpapi', loaded.bytes, loaded.requested_context, evidence.acquired_at, at,
    { acquisition: loaded.serp_acquisition, evaluated_at: at, reference_origin: 'PACKAGE_CREATED_AT' });
  assert.equal(result.publication.normalized.rows[0].title, 'Synthetic observed title');
  assert.equal(Object.hasOwn(result.publication.normalized.rows[0], 'capture_date'), false);
  assert.equal(Object.hasOwn(result.publication.normalized.rows[0], 'domain'), false);
  assert.equal(result.publication.derived.rows[0].values.capture_date, '2026-10-01');
  assert.equal(result.publication.derived.rows[0].values.domain, 'example.test');
});

test('optional Trends evidence retains native series observations in publication representations', () => {
  const bytes = Buffer.from('Category: All categories\n\nDay,synthetic: (Turkey),second: (Turkey)\n2026-10-01,0,\n');
  const result = inspectBlogWritingPackV2Fields('google-trends', bytes);
  assert.equal(result.status, 'SUPPORTED');
  assert.deepEqual(result.publication.normalized.rows.map((row) => [row.query, row.relative_interest]), [['synthetic', 0], ['second', null]]);
  assert.deepEqual(result.publication.derived, { rows: [], transformations: [] });
});

const gscRows = () => [{ keys: ['synthetic', 'https://example.test/page'], clicks: 0, impressions: 2, ctr: 0, position: null }];
const gscFinalityFixture = async (metadata, extraContext = {}, legacy = false) => {
  const f = fixture(); const selected = f.add('gsc-finality', 'google-search-console-query-page', 'QUERY_PAGE');
  const job = f.jobs.get(selected.job_id);
  if (!legacy) job.source_context.site_url = 'sc-domain:example.test';
  Object.assign(job.source_context, extraContext);
  const pages = [{ rows: gscRows(), responseAggregationType: 'byPage', ...(metadata === undefined ? {} : { metadata }) }];
  const bytes = Buffer.from(JSON.stringify(pages)); const filename = path.join(f.root, 'runs', selected.run_id, 'raw.json');
  fs.writeFileSync(filename, bytes);
  Object.assign(f.artifacts.get(selected.artifact_id), { byte_size: bytes.length, sha256: sha(bytes) });
  const draft = await f.persist([selected], '2026-10-01T10:00:00.000Z');
  return { f, selected, draft, filename, bytes, pages };
};

test('GSC Query × Page preserves property/endpoints, native dimensions and raw response metadata without recording an unobserved dataState', async () => {
  const { fetchGscQueryPage } = load('main/sources/google-search-console/query-page-adapter.js');
  const requests = []; const response = { rows: gscRows(), responseAggregationType: 'byPage' };
  const result = await fetchGscQueryPage({ site_url: 'sc-domain:example.test', start_date: '2026-09-01', end_date: '2026-09-28', country_filter: 'TUR' },
    async (request) => { requests.push(structuredClone(request)); return { status: 200, body: response }; });
  assert.match(requests[0].url, /sites\/sc-domain%3Aexample.test\/searchAnalytics\/query$/);
  assert.deepEqual([requests[0].body.startDate, requests[0].body.endDate], ['2026-09-01', '2026-09-28']);
  assert.deepEqual(requests[0].body.dimensions, ['query', 'page']);
  assert.equal(Object.hasOwn(requests[0].body, 'dataState'), false,
    'Current omission invokes the documented final-data default; no explicit request capture is invented.');
  assert.deepEqual(result.raw_pages, [response]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].clicks, 0);
  assert.equal(result.rows[0].position, null);
});

// Counterfactual claims/metadata are deliberately untrusted inputs, not live finality fixtures.
for (const [label, metadata, claim, legacy] of [
  ['native-default finalized returned rows without daily coverage', undefined, {}, false],
  ['unverified final request claim', {}, { dataState: 'final' }, false],
  ['incomplete date inside the requested window', { first_incomplete_date: '2026-09-27' }, { dataState: 'all' }, false],
  ['candidate cutoff after the window without a bound date probe', { first_incomplete_date: '2026-09-29' }, { dataState: 'all' }, false],
  ['legacy missing property and finality provenance', undefined, {}, true],
]) test(`GSC publication remains blocked: ${label}`, async () => {
  const { f, draft, filename, bytes, pages } = await gscFinalityFixture(metadata, claim, legacy);
  const loaded = await f.loader.readAcceptedJobArtifact(draft.selected_evidence[0].run_id, draft.selected_evidence[0].job_id);
  assert.deepEqual(Buffer.from(loaded.bytes), bytes);
  assert.deepEqual(JSON.parse(Buffer.from(loaded.bytes).toString()), pages);
  const result = await f.evaluate(undefined, at, 'PUBLICATION');
  assert.ok(result.blockers.some((blocker) => blocker.mandatory && blocker.requirement_id === 'gsc_finality'));
  assert.equal(result.datasets.find((item) => item.dataset_type === 'QUERY_PAGE').coverage_status, 'BLOCKED');
  assert.deepEqual(result.selected_evidence, draft.selected_evidence);
  assert.equal(result.field_checks[0].publication_time_context.finality, 'NOT_ESTABLISHED');
  assert.equal(result.field_checks[0].row_count, 1, 'Aggregate pairs cannot be expanded into 28 daily observations.');
  assert.deepEqual(fs.readFileSync(filename), bytes);
  assert.equal(Object.hasOwn(draft.selected_evidence[0].requested_context, 'site_url'), !legacy);
});

test('GSC wrong requested endpoints and 30-day profiles cannot become 28 days through finality claims or subtraction', async () => {
  const { f } = await gscFinalityFixture(undefined, { requested_date_end: '2026-09-30', dataState: 'final' });
  const result = await f.evaluate(undefined, at, 'PUBLICATION');
  assert.ok(result.blockers.some((item) => item.code === 'WINDOW_MISMATCH' && item.requirement_id === 'gsc_requested_dates'));
  assert.ok(result.blockers.some((item) => item.requirement_id === 'gsc_finality'));
  const invalid = syntheticRequirements(); invalid.gsc_requested_dates.end_date = '2026-09-30';
  await assert.rejects(f.evaluate(invalid, at, 'PUBLICATION'), /exactly 28/i);
});

test('sparse date-grouped GSC observations cannot replace Query × Page or create missing daily zeros', async () => {
  const f = fixture(); const selected = f.add('gsc-sparse-dates', 'google-search-console-query-page', 'QUERY_PAGE');
  const filename = path.join(f.root, 'runs', selected.run_id, 'raw.json');
  const sparseDateRows = [{ rows: ['2026-09-01', '2026-09-28'].map((date) => ({ keys: [date], clicks: 0, impressions: 1, ctr: 0, position: 2 })) }];
  const bytes = Buffer.from(JSON.stringify(sparseDateRows)); fs.writeFileSync(filename, bytes);
  Object.assign(f.artifacts.get(selected.artifact_id), { byte_size: bytes.length, sha256: sha(bytes) });
  await f.persist([selected]);
  const result = await f.evaluate(undefined, at, 'PUBLICATION');
  assert.ok(result.blockers.some((blocker) => blocker.mandatory && blocker.code === 'FIELD_REPRESENTATION_INVALID'));
  assert.throws(() => inspectBlogWritingPackV2Fields('google-search-console-query-page', sparseDateRows, undefined, undefined, at, undefined, at), /query and page/i);
  assert.deepEqual(fs.readFileSync(filename), bytes);
  assert.equal(JSON.parse(bytes.toString())[0].rows.length, 2);
});

test('GSC package-time reevaluation never matures missing finality evidence, fills missing days or substitutes another Run', async () => {
  const { f, draft, filename, bytes } = await gscFinalityFixture({ first_incomplete_date: '2026-09-27' });
  f.add('newer-gsc-unselected', 'google-search-console-query-page', 'QUERY_PAGE');
  const draftPath = path.join(f.root, 'packages', 'draft', 'BLOG_DRAFT.json'); const before = fs.readFileSync(draftPath);
  for (const instant of [at, '2027-01-01T08:00:00.000Z']) {
    const result = await publishBlogWritingPackV2({ package_id: 'gsc-json-package', draft_id: 'draft', workspace_id: draft.workspace_id,
      application_version: 'test', requirements: syntheticRequirements() },
    { store: f.store, repository: f.repository, loader: f.loader, now: () => new Date(instant) });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.readiness.evaluated_at, instant);
    assert.equal(result.readiness.field_checks[0].publication_time_context.reference_at, instant);
    assert.ok(result.readiness.blockers.some((blocker) => blocker.requirement_id === 'gsc_finality'));
    assert.deepEqual(result.readiness.selected_evidence, draft.selected_evidence);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'packages')), ['draft']);
  }
  assert.deepEqual(fs.readFileSync(draftPath), before);
  assert.deepEqual(fs.readFileSync(filename), bytes);
});

test('GSC frozen property and raw finality metadata integrity cannot change during publication', async () => {
  for (const damage of ['property', 'response-metadata']) {
    const { f, selected, draft, filename } = await gscFinalityFixture({ first_incomplete_date: '2026-09-27' });
    if (damage === 'property') f.jobs.get(selected.job_id).source_context.site_url = 'sc-domain:another.test';
    else fs.writeFileSync(filename, JSON.stringify([{ rows: gscRows() }]));
    await assert.rejects(publishBlogWritingPackV2({ package_id: 'gsc-damaged-package', draft_id: 'draft', workspace_id: draft.workspace_id,
      application_version: 'test', requirements: syntheticRequirements() },
    { store: f.store, repository: f.repository, loader: f.loader, now: () => new Date(at) }), /integrity|identity|checksum|byte size/i);
    assert.deepEqual(await f.store.readDraft('draft'), draft);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'packages')), ['draft']);
  }
});

const dateCoverage = (changes = {}) => ({
  schema_version: 1,
  request: { site_url: 'sc-domain:example.test', search_type: 'web', start_date: '2026-09-01', end_date: '2026-09-28', data_state: 'final', dimensions: ['date'] },
  response_received_at: '2026-10-01T10:00:00.000Z',
  response_received_at_origin: 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT',
  raw_response: { rows: Array.from({ length: 28 }, (_, index) => ({ keys: [`2026-09-${String(index + 1).padStart(2, '0')}`], clicks: 0, impressions: 1, ctr: 0, position: 2 })) },
  ...changes,
});
const bindGscDates = (f, selection, coverage = dateCoverage()) => {
  const job = f.jobs.get(selection.job_id); job.source_context.site_url = 'sc-domain:example.test';
  const artifact = f.artifacts.get(selection.artifact_id);
  const attempt = [...f.attempts.values()].find((item) => item.job_id === selection.job_id);
  const filename = path.join(f.root, 'runs', selection.run_id, job.source_id, 'metadata', `${job.job_key}.metadata.json`);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify({ schema_version: 2, source_id: job.source_id, source_mode: 'OFFICIAL_API',
    run_id: selection.run_id, job_id: job.job_id, job_key: job.job_key, attempt_id: attempt.attempt_id, attempt_number: 1,
    raw_artifact_id: selection.artifact_id, raw_relative_path: artifact.relative_path, source_context: job.source_context,
    acquisition_metadata: { gsc_date_coverage: coverage } }));
  return filename;
};

test('GSC source acquires a separate final date response with real receipt time and unchanged Query × Page bytes', async () => {
  const { GoogleSearchConsoleSource } = load('main/sources/google-search-console/google-search-console-source.js');
  const requests = []; const dates = dateCoverage(); const queryPage = { rows: gscRows() };
  const source = new GoogleSearchConsoleSource('sc-domain:example.test', async (request) => {
    requests.push(structuredClone(request));
    return { status: 200, body: request.body.dimensions[0] === 'date' ? dates.raw_response : queryPage };
  }, () => new Date(dates.response_received_at));
  const result = await source.collect({ source_context: { site_url: 'sc-domain:example.test', requested_date_start: '2026-09-01', requested_date_end: '2026-09-28' } });
  assert.equal(result.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((request) => request.body.dimensions), [['query', 'page'], ['date']]);
  assert.equal(requests[1].body.dataState, 'final');
  assert.equal(requests[1].body.type, 'web');
  assert.deepEqual(JSON.parse(Buffer.from(result.bytes).toString()), [queryPage]);
  assert.deepEqual(result.acquisition_metadata.gsc_date_coverage, dates);
});

for (const [label, mutate, expected] of [
  ['all 28 returned dates', () => {}, 'OBSERVED_28_DATES'],
  ['one missing date', (e) => e.raw_response.rows.splice(7, 1), 'MISSING_DATES'],
  ['multiple missing dates', (e) => e.raw_response.rows.splice(0, 4), 'MISSING_DATES'],
  ['wrong property', (e) => { e.request.site_url = 'sc-domain:other.test'; }, 'CONTEXT_MISMATCH'],
  ['wrong search type', (e) => { e.request.search_type = 'image'; }, 'CONTEXT_MISMATCH'],
  ['wrong country scope', (e) => { e.request.country_filter = 'TUR'; }, 'CONTEXT_MISMATCH'],
  ['future receipt', (e) => { e.response_received_at = '2027-01-01T00:00:00.000Z'; }, 'FUTURE_EVIDENCE'],
  ['wrong endpoints', (e) => { e.request.end_date = '2026-09-29'; }, 'CONTEXT_MISMATCH'],
  ['requested dates without observations', (e) => { e.raw_response = {}; }, 'MISSING_DATES'],
]) test(`GSC conservative coverage evaluates ${label} without clearing publication eligibility`, async () => {
  const f = fixture(); const selection = f.add('gsc-dates', 'google-search-console-query-page', 'QUERY_PAGE');
  const support = dateCoverage(); mutate(support); const filename = bindGscDates(f, selection, support);
  const before = fs.readFileSync(filename); const draft = await f.persist([selection]);
  const result = await f.evaluate(undefined, at, 'PUBLICATION');
  assert.equal(result.field_checks[0].gsc_date_coverage.status, expected);
  assert.equal(result.field_checks[0].row_count, 1, 'Complete date observations do not expand sparse Query × Page rows.');
  assert.equal(result.blockers.some((b) => b.requirement_id === 'gsc_date_coverage'), expected !== 'OBSERVED_28_DATES');
  assert.ok(result.blockers.some((b) => b.mandatory && b.requirement_id === 'gsc_finality'));
  assert.equal(draft.selected_evidence[0].gsc_date_coverage.metadata_sha256, sha(before));
  assert.deepEqual(fs.readFileSync(filename), before);
});

for (const [label, mutate] of [
  ['unfinal request mode', (e) => { e.request.data_state = 'all'; }],
  ['missing final request mode', (e) => { delete e.request.data_state; }],
  ['inconsistent incomplete metadata', (e) => { e.raw_response.metadata = { first_incomplete_date: '2026-09-27' }; }],
  ['invalid receipt', (e) => { e.response_received_at = 'invalid'; }],
  ['wrong date grouping', (e) => { e.request.dimensions = ['query', 'page']; }],
  ['duplicate dates', (e) => { e.raw_response.rows[1].keys = e.raw_response.rows[0].keys; }],
  ['invalid returned date', (e) => { e.raw_response.rows[0].keys = ['2026-02-30']; }],
]) test(`GSC date evidence rejects ${label}`, async () => {
  const f = fixture(); const selection = f.add('gsc-invalid-dates', 'google-search-console-query-page', 'QUERY_PAGE');
  const support = dateCoverage(); mutate(support); bindGscDates(f, selection, support);
  await assert.rejects(f.persist([selection]), /GSC|date|final|receipt/i);
});

test('legacy GSC has no date proof and new supporting evidence cannot amend its frozen draft', async () => {
  const f = fixture(); const selection = f.add('gsc-legacy-dates', 'google-search-console-query-page', 'QUERY_PAGE');
  f.jobs.get(selection.job_id).source_context.site_url = 'sc-domain:example.test';
  const draft = await f.persist([selection]);
  const legacy = await f.evaluate(undefined, at, 'PUBLICATION');
  assert.equal(legacy.field_checks[0].gsc_date_coverage.status, 'MISSING_EVIDENCE');
  assert.equal(Object.hasOwn(draft.selected_evidence[0], 'gsc_date_coverage'), false);
  bindGscDates(f, selection);
  const after = await f.evaluate(undefined, at, 'PUBLICATION');
  assert.ok(after.blockers.some((b) => b.code === 'MEMBERSHIP_CHANGED'));
  assert.deepEqual(await f.store.readDraft('draft'), draft);
});

test('GSC support metadata drift, removal and Attempt mismatch cannot bypass frozen evidence integrity', async () => {
  for (const damage of ['drift', 'missing', 'attempt']) {
    const f = fixture(); const selection = f.add(`gsc-integrity-${damage}`, 'google-search-console-query-page', 'QUERY_PAGE');
    const filename = bindGscDates(f, selection); const draft = await f.persist([selection]);
    if (damage === 'drift') fs.appendFileSync(filename, ' ');
    if (damage === 'missing') fs.unlinkSync(filename);
    if (damage === 'attempt') { const body = JSON.parse(fs.readFileSync(filename)); body.attempt_id = 'other-attempt'; fs.writeFileSync(filename, JSON.stringify(body)); }
    await assert.rejects(publishBlogWritingPackV2({ package_id: 'gsc-json', draft_id: 'draft', workspace_id: draft.workspace_id,
      application_version: 'test', requirements: syntheticRequirements() },
    { store: f.store, repository: f.repository, loader: f.loader, now: () => new Date(at) }), /GSC|identity|integrity|Attempt/i);
    assert.deepEqual(await f.store.readDraft('draft'), draft);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'packages')), ['draft']);
  }
});

test('complete GSC date evidence stays historical at both publication clocks with immutable membership', async () => {
  const f = fixture(); const selection = f.add('gsc-complete-dates', 'google-search-console-query-page', 'QUERY_PAGE');
  const filename = bindGscDates(f, selection); const before = fs.readFileSync(filename); const draft = await f.persist([selection]);
  for (const instant of [at, '2027-01-01T08:00:00.000Z']) {
    const result = await publishBlogWritingPackV2({ package_id: 'gsc-dated-json', draft_id: 'draft', workspace_id: draft.workspace_id,
      application_version: 'test', requirements: syntheticRequirements() },
    { store: f.store, repository: f.repository, loader: f.loader, now: () => new Date(instant) });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.readiness.evaluated_at, instant);
    assert.equal(result.readiness.field_checks[0].gsc_date_coverage.status, 'OBSERVED_28_DATES');
    assert.ok(result.readiness.blockers.some((b) => b.requirement_id === 'gsc_finality'));
    assert.deepEqual(result.readiness.selected_evidence, draft.selected_evidence);
  }
  assert.deepEqual(fs.readFileSync(filename), before);
  assert.deepEqual(await f.store.readDraft('draft'), draft);
});


test('GSC native validation checks companion shape without treating missing dates as invalid provider rows', async () => {
  const { GoogleSearchConsoleValidator } = load('main/sources/google-search-console/google-search-console-validator.js');
  for (const invalid of [false, true]) {
    const f = fixture(); const selection = f.add('gsc-validator-dates', 'google-search-console-query-page', 'QUERY_PAGE');
    const support = dateCoverage(); support.raw_response.rows.splice(0, 3);
    if (invalid) support.request.data_state = 'all';
    const result = await new GoogleSearchConsoleValidator('google-search-console-query-page').validate({
      job: f.jobs.get(selection.job_id), artifact: f.artifacts.get(selection.artifact_id),
      absolute_path: path.join(f.root, 'runs', selection.run_id, 'raw.json'), acquisition_metadata: { gsc_date_coverage: support },
    });
    assert.equal(result.validation_status, invalid ? 'INVALID_SCHEMA' : 'VALID');
  }
});

test('legacy/unbound or non-28-day GSC acquisition never fabricates supporting proof', async () => {
  const { GoogleSearchConsoleSource } = load('main/sources/google-search-console/google-search-console-source.js');
  for (const [site_url, end] of [[undefined, '2026-09-28'], ['sc-domain:example.test', '2026-09-30']]) {
    const requests = [];
    const source = new GoogleSearchConsoleSource('sc-domain:example.test', async (request) => {
      requests.push(request); return { status: 200, body: { rows: gscRows() } };
    });
    const result = await source.collect({ source_context: { ...(site_url ? { site_url } : {}), requested_date_start: '2026-09-01', requested_date_end: end } });
    assert.equal(result.result_type, 'ARTIFACT_PRODUCED');
    assert.equal(requests.length, 1);
    assert.equal(Object.hasOwn(result, 'acquisition_metadata'), false);
  }
});


test('synthetic JSON storage preserves bound GSC companion metadata bytes and readback integrity', async () => {
  const s = await storageFixture(true); await write(s);
  const published = await s.f.store.readJsonV2('json-package');
  const member = published.payload.members[1];
  assert.equal(member.acquisition_metadata.sha256, s.draft.selected_evidence[1].gsc_date_coverage.metadata_sha256);
  const file = path.join(s.f.root, 'packages', 'json-package', member.acquisition_metadata.relative_path);
  assert.deepEqual(fs.readFileSync(file), s.files.find((item) => item.reference.relative_path === member.acquisition_metadata.relative_path).bytes);
  fs.appendFileSync(file, ' ');
  await assert.rejects(s.f.store.readJsonV2('json-package'), /integrity|size|hash/i);
});
