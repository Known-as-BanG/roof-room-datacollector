const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const [buildRoot, workRoot] = process.argv.slice(2);
const load = (name) => require(path.join(buildRoot, name));
const { assembleBlogWritingPackV2Draft } = load('main/blog-writing-packs/blog-writing-pack-assembler.js');
const { BlogWritingPackStore } = load('main/blog-writing-packs/blog-writing-pack-store.js');
const { evaluateBlogWritingPackV2Readiness } = load('main/blog-writing-packs/blog-writing-pack-v2-readiness.js');
const { BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS } = load('shared/blog-writing-pack-v2-readiness.js');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const SOURCE = 'bitkimark-sitemap';
const createFixture = require('./general-raw-evidence-fixture.cjs');
const fixture = (t, options = {}) => createFixture(buildRoot, workRoot, t, options);
const controllerFor = (f, overrides = {}) => {
  const { DesktopMultiSourceController } = load('main/app/desktop-multisource-controller.js');
  return new DesktopMultiSourceController({ repository: f.repository, application_version: 'test',
    readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) }, package_directory: f.directories.runs,
    load_export: (id) => f.loader.loadRunExport(id), ...overrides });
};

test('GA4 Content and Paid Funnel complete Review, acquisition, validation, reopen and normalized/raw export', async (t) => {
  const f = await fixture(t, { ga4: true });
  const originalRun = f.repository.getRun(f.run_id), originalJobs = f.repository.listJobs(f.run_id);
  assert.equal(originalRun.run_status, 'COMPLETED');
  assert.equal(originalJobs.length, 2);
  assert.equal(f.ga4Responses.length, 2);
  const result = await f.controller.exportRun(f.run_id, 'ALL');
  assert.equal(result.normalized_file_count, 2, 'Both existing GA4 datasets must be delivered as normalized evidence');
  assert.equal(result.raw_file_count, 2);
  assert.equal(result.collection_status, 'COMPLETE');
  const index = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'DATASETS.json')));
  const raw = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')));
  assert.equal(index.length, 2);
  for (const job of originalJobs) {
    assert.equal(job.execution_status, 'COMPLETED');
    assert.equal(job.validation_status, 'VALID');
    assert.equal(job.source_context.property_id, '123456789');
    const attempts = f.repository.listAttempts(job.job_id);
    assert.equal(attempts.length, 1);
    const artifact = f.repository.getArtifact(job.accepted_artifact_id);
    const bytes = fs.readFileSync(f.storage.resolveRunRelativePath(f.run_id, artifact.relative_path));
    const entry = index.find((d) => d.job_id === job.job_id);
    const rawEntry = raw.files.find((d) => d.job_id === job.job_id);
    assert.equal(rawEntry.normalization_status, 'AVAILABLE');
    assert.equal(entry.dataset_type, job.source_context.dataset_type);
    assert.equal(entry.provenance.attempt_id, attempts[0].attempt_id);
    assert.equal(entry.provenance.validation_id, attempts[0].validation_id);
    assert.equal(entry.provenance.raw_artifact_id, artifact.artifact_id);
    assert.equal(entry.provenance.raw_artifact_sha256, sha(bytes));
    assert.deepEqual(fs.readFileSync(path.join(result.export_directory, rawEntry.relative_path)), bytes);
    const content = entry.dataset_type === 'GA4_CONTENT_PERFORMANCE';
    const bundle = JSON.parse(bytes);
    assert.deepEqual(JSON.parse(bundle.pages[0].raw_body_text), f.ga4Responses.find((r) => r.content === content).body);
    const rows = JSON.parse(fs.readFileSync(path.join(result.export_directory, entry.filename)));
    assert.equal(rows.length, content ? 2 : 1, 'Every returned row must survive');
    assert.equal(rows[0].sessions, 0);
    assert.equal(rows[0].add_to_carts, null);
    if (content) {
      assert.deepEqual(rows.map((r) => r.landing_page), ['(not set)', '/plants']);
      assert.equal(rows[0].total_users, 17);
      assert.equal(rows[0].active_users, 7);
      assert.equal(rows[0].user_engagement_duration, 12.5);
    } else {
      assert.equal(rows[0].performance_date, '2026-09-01');
      assert.equal(rows[0].session_source, 'google');
      assert.equal(rows[0].session_medium, 'cpc');
      assert.equal(rows[0].session_campaign_name, '(not set)');
    }
  }
  await assert.rejects(f.controller.exportRun(f.run_id, 'ALL'), /exist|overwrite/i);
  assert.deepEqual(f.repository.getRun(f.run_id), originalRun);
  assert.deepEqual(f.repository.listJobs(f.run_id), originalJobs);
});

test('verified GA4 NO_DATA exports empty datasets and original raw bundles without invented rows', async (t) => {
  const f = await fixture(t, { ga4: true, empty: true });
  assert.equal(f.repository.getRun(f.run_id).run_status, 'COMPLETED_WITH_WARNINGS');
  assert.ok(f.jobs.every((j) => j.validation_status === 'NO_DATA'));
  const result = await f.controller.exportRun(f.run_id, 'ALL');
  assert.equal(result.normalized_file_count, 2);
  const index = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'DATASETS.json')));
  for (const entry of index) {
    assert.equal(entry.row_count, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(result.export_directory, entry.filename))), []);
    assert.equal(entry.provenance.validation_status, 'NO_DATA');
  }
  assert.equal(result.raw_file_count, 2);
});

test('GA4 legacy Content stays readable and normalization rejects a mismatched property, window or dataset', async (t) => {
  const f = await fixture(t, { ga4: true });
  const { ProductionDataPackageLoader } = load('main/export/production-data-package-loader.js');
  const job = f.jobs.find((j) => j.job_key === 'GA4_CONTENT_PERFORMANCE');
  const legacy = require('../blog-writing-packs/blog-v2-ga4-fixture.cjs').bundle();
  const stored = await f.storage.persistRawArtifact({ run_id: f.run_id, source_id: job.source_id,
    attempt_number: 1, preferred_filename: 'legacy-content.json', media_type: 'application/json',
    bytes: Buffer.from(JSON.stringify(legacy)) });
  const artifact = { ...f.repository.getArtifact(job.accepted_artifact_id), ...stored };
  const loader = new ProductionDataPackageLoader({ getRun: (id) => f.repository.getRun(id),
    listJobs: () => [job], getArtifact: () => artifact }, f.storage);
  const dataset = await loader.loadAcceptedJobDataset(f.run_id, job.job_id);
  assert.equal(dataset.rows[0].active_users, 7);
  assert.equal(dataset.rows[0].sessions, 0);
  assert.equal(Object.hasOwn(dataset.rows[0], 'total_users'), false, 'Legacy capability must not be invented');
  const originalContext = structuredClone(job.source_context);
  for (const change of [
    { property_id: '999999999' }, { start_date: '2026-08-01' }, { dataset_type: 'GA4_PAID_FUNNEL' },
  ]) {
    job.source_context = { ...originalContext, ...change };
    await assert.rejects(loader.loadAcceptedJobDataset(f.run_id, job.job_id), /property|dates|immutable|dataset|session filter/i);
  }
  job.source_context = originalContext;
  job.job_key = 'WRONG';
  await assert.rejects(loader.loadAcceptedJobDataset(f.run_id, job.job_id), /Job key/);
});

test('all 14 Ads configuration snapshots export normalized evidence including exact geo bundle observations', async (t) => {
  const f = await fixture(t, { ads_configuration: true });
  const run = f.repository.getRun(f.run_id), jobs = f.repository.listJobs(f.run_id);
  assert.equal(jobs.length, 14);
  assert.equal(f.adsResponses.length, 14);
  assert.equal(run.run_status, 'COMPLETED_WITH_WARNINGS');
  assert.ok(jobs.every((j) => j.execution_status === 'COMPLETED'), JSON.stringify(jobs));
  const result = await f.controller.exportRun(f.run_id, 'ALL');
  assert.equal(result.normalized_file_count, 14, 'All implemented configuration datasets need ordinary normalized delivery');
  assert.equal(result.raw_file_count, 14);
  assert.equal(result.normalization_unavailable_count, 0);
  const index = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'DATASETS.json')));
  const raw = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')));
  const output = new Map();
  for (const job of jobs) {
    assert.equal(Object.hasOwn(job.source_context, 'requested_date_start'), false, 'Snapshots must not invent reporting windows');
    const attempts = f.repository.listAttempts(job.job_id);
    assert.equal(attempts.length, 1);
    const artifact = f.repository.getArtifact(job.accepted_artifact_id);
    const bytes = fs.readFileSync(f.storage.resolveRunRelativePath(f.run_id, artifact.relative_path));
    const entry = index.find((e) => e.job_id === job.job_id);
    const rawEntry = raw.files.find((e) => e.job_id === job.job_id);
    const rows = JSON.parse(fs.readFileSync(path.join(result.export_directory, entry.filename)));
    output.set(entry.dataset_type, rows);
    assert.equal(entry.dataset_type, job.job_key);
    assert.equal(entry.provenance.attempt_id, attempts[0].attempt_id);
    assert.equal(entry.provenance.validation_id, attempts[0].validation_id);
    assert.equal(entry.provenance.raw_artifact_id, artifact.artifact_id);
    assert.equal(entry.provenance.raw_artifact_sha256, sha(bytes));
    assert.deepEqual(fs.readFileSync(path.join(result.export_directory, rawEntry.relative_path)), bytes);
    const body = f.adsResponses.find((r) => r.dataset_type === job.job_key).body;
    if (job.job_key === 'CAMPAIGN_TARGETING_CRITERIA') {
      const parts = JSON.parse(bytes).parts;
      assert.deepEqual(JSON.parse(Buffer.from(parts[0].raw_body_base64, 'base64')), body);
      assert.deepEqual(JSON.parse(Buffer.from(parts[1].raw_body_base64, 'base64')),
        require('./ads-configuration-export-fixture.cjs').geo);
    } else assert.deepEqual(JSON.parse(bytes), body);
    if (job.validation_status === 'NO_DATA') assert.deepEqual(rows, [], 'Verified empty snapshots stay empty');
  }
  assert.equal(output.get('CAMPAIGN_NEGATIVE_KEYWORDS')[0].keyword_text, 'free');
  assert.equal(output.get('CAMPAIGN_NEGATIVE_KEYWORDS')[0].campaign_criterion_status, 'REMOVED');
  assert.equal(output.get('CONVERSION_ACTIONS')[0].default_value, 0);
  assert.equal(output.get('CONVERSION_ACTIONS')[0].always_use_default_value, false);
  assert.equal(output.get('CUSTOMER_CONVERSION_GOALS')[0].biddable, false);
  assert.equal(output.get('CUSTOMER_CONVERSION_TRACKING_SETTINGS')[0].conversion_tracking_id, null);
  assert.equal(output.get('CUSTOMER_CONVERSION_TRACKING_SETTINGS')[0].conversion_tracking_status, 'NOT_CONVERSION_TRACKED');
  assert.equal(output.get('CAMPAIGN_BUDGETS')[0].amount_micros, '0');
  assert.equal(output.get('CAMPAIGN_BUDGETS')[0].explicitly_shared, false);
  const location = output.get('CAMPAIGN_TARGETING_CRITERIA')[0];
  assert.equal(location.location_geo_target_constant_name, 'Turkey');
  assert.equal(location.location_geo_target_constant_country_code, 'TR');
  assert.equal(location.location_geo_target_constant_resource_name, 'geoTargetConstants/2392');
  await assert.rejects(f.controller.exportRun(f.run_id, 'ALL'), /exist|overwrite/i);
  assert.deepEqual(f.repository.getRun(f.run_id), run);
  assert.deepEqual(f.repository.listJobs(f.run_id), jobs);
});

test('configuration normalization rejects missing or mismatched location resolver evidence', () => {
  const { normalizeGoogleAdsConfigurationArtifact } = load('main/sources/google-ads/configuration-normalizer.js');
  const { buildGoogleAdsCampaignTargetingEvidenceBundleBytes } = load('main/sources/google-ads/campaign-settings-adapter.js');
  const provider = require('./ads-configuration-export-fixture.cjs');
  const bytes = buildGoogleAdsCampaignTargetingEvidenceBundleBytes({
    search_stream_raw_bytes: Buffer.from(JSON.stringify([{ results: provider.rows.CAMPAIGN_TARGETING_CRITERIA }])),
    geo_target_suggestions: { requested_resource_names: ['geoTargetConstants/2392'], raw_bytes: Buffer.from(JSON.stringify(provider.geo)) },
  });
  const valid = JSON.parse(Buffer.from(bytes).toString('utf8')), missingResolver = structuredClone(valid);
  missingResolver.parts.pop();
  assert.throws(() => normalizeGoogleAdsConfigurationArtifact('CAMPAIGN_TARGETING_CRITERIA', missingResolver),
    /resolver evidence is missing/, 'LOCATION normalization requires the actual provider resolver evidence');
  const wrongScope = structuredClone(valid);
  wrongScope.parts[1].requested_resource_names = ['geoTargetConstants/9999'];
  assert.throws(() => normalizeGoogleAdsConfigurationArtifact('CAMPAIGN_TARGETING_CRITERIA', wrongScope), /scope/);
  const wrongIdentity = structuredClone(valid), geo = structuredClone(provider.geo);
  geo.geoTargetConstantSuggestions[0].geoTargetConstant.id = '9999';
  wrongIdentity.parts[1].raw_body_base64 = Buffer.from(JSON.stringify(geo)).toString('base64');
  assert.throws(() => normalizeGoogleAdsConfigurationArtifact('CAMPAIGN_TARGETING_CRITERIA', wrongIdentity), /resourceName.*id/);
  for (const response of [{}, { geoTargetConstantSuggestions: [null] },
    { geoTargetConstantSuggestions: [{ geoTargetConstant: null }] },
    { geoTargetConstantSuggestions: [{ geoTargetConstant: { ...provider.geo.geoTargetConstantSuggestions[0].geoTargetConstant, countryCode: '' } }] }]) {
    const malformed = structuredClone(valid);
    malformed.parts[1].raw_body_base64 = Buffer.from(JSON.stringify(response)).toString('base64');
    assert.throws(() => normalizeGoogleAdsConfigurationArtifact('CAMPAIGN_TARGETING_CRITERIA', malformed), /invalid|required/);
  }
});

test('stable RETRY_REQUIRED exports accepted evidence in both modes with complete histories and immutable snapshots', async (t) => {
  const f = await fixture(t, { mixed: true, partial: true });
  const run = f.repository.getRun(f.run_id), jobs = f.repository.listJobs(f.run_id);
  const histories = jobs.map((job) => f.repository.listAttempts(job.job_id));
  assert.equal(run.run_status, 'RETRY_REQUIRED');
  const published = [];
  for (const mode of ['ALL', 'SUCCESSFUL_ONLY']) {
    const result = await f.controller.exportRun(f.run_id, mode);
    assert.equal(f.controller.getRunState(f.run_id).can_export, true);
    assert.equal(result.collection_status, 'INCOMPLETE');
    assert.equal(result.raw_file_count, 1); assert.equal(result.failed_count, 1);
    assert.equal(result.unavailable_evidence_count, 1);
    const manifest = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'MANIFEST.json')));
    const index = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')));
    assert.equal(manifest.run_status, 'RETRY_REQUIRED'); assert.equal(manifest.collection_status, 'INCOMPLETE');
    assert.match(manifest.snapshot_id, /^[a-f0-9]{64}$/);
    assert.equal(index.snapshot_id, manifest.snapshot_id); assert.equal(index.collection_status, 'INCOMPLETE');
    assert.equal(index.jobs.length, 2); assert.equal(index.files.length, 1);
    assert.deepEqual(index.jobs.map((j) => [j.job_id, j.execution_status, j.validation_status, j.accepted_artifact_id]),
      jobs.map((j) => [j.job_id, j.execution_status, j.validation_status, j.accepted_artifact_id]));
    assert.deepEqual(index.jobs.map((j) => j.attempts.map((a) => [a.attempt_id, a.execution_status, a.error_code])),
      histories.map((items) => items.map((a) => [a.attempt_id, a.execution_status, a.error_code])));
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.export_directory, 'FAILURES.json'))).length, mode === 'ALL' ? 1 : 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.export_directory, 'DATASETS.json'))).length, 1);
    assert.deepEqual(fs.readFileSync(path.join(result.export_directory, index.files[0].relative_path)), f.bytes);
    published.push({ directory: result.export_directory, manifest: fs.readFileSync(path.join(result.export_directory, 'MANIFEST.json')),
      index: fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')) });
    await assert.rejects(f.controller.exportRun(f.run_id, mode), /exist|overwrite/i);
  }
  assert.deepEqual(f.repository.getRun(f.run_id), run);
  assert.deepEqual(f.repository.listJobs(f.run_id), jobs);
  const controller = controllerFor(f, { execute_retry: async () => {} });
  const failed = jobs.find((job) => job.execution_status === 'FAILED');
  await controller.retryFailed(f.run_id);
  f.repository.transitionJobExecution(failed.job_id, 'FAILED', { error_code: 'SECOND_FAILURE' });
  f.repository.transitionRunStatus(f.run_id, 'RETRY_REQUIRED');
  const later = await controller.exportRun(f.run_id, 'ALL');
  assert.notEqual(later.export_directory, published[0].directory);
  const laterIndex = JSON.parse(fs.readFileSync(path.join(later.export_directory, 'RAW_EVIDENCE.json')));
  assert.equal(laterIndex.jobs.find((j) => j.job_id === failed.job_id).attempts.length, 2);
  for (const old of published) {
    assert.deepEqual(fs.readFileSync(path.join(old.directory, 'MANIFEST.json')), old.manifest);
    assert.deepEqual(fs.readFileSync(path.join(old.directory, 'RAW_EVIDENCE.json')), old.index);
  }
});

test('active execution, unsettled Jobs or Attempts, unrelated Run states and no accepted evidence cannot partially export', async (t) => {
  const f = await fixture(t, { mixed: true, partial: true });
  await assert.rejects(controllerFor(f, { is_run_active: () => true }).exportRun(f.run_id, 'ALL'), /active|stable|export/i);
  const readRun = f.repository.getRun.bind(f.repository), readJobs = f.repository.listJobs.bind(f.repository);
  for (const status of ['PENDING', 'RUNNING', 'MANUAL_ACTION_REQUIRED']) {
    f.repository.getRun = (id) => ({ ...readRun(id), run_status: status });
    await assert.rejects(f.loader.loadRunExport(f.run_id), /stable|export|terminal/i);
    await assert.rejects(f.controller.exportRun(f.run_id, 'ALL'), /stable|export|terminal/i);
  }
  f.repository.getRun = readRun;
  for (const status of ['PENDING', 'RUNNING', 'VALIDATING', 'MANUAL_ACTION_REQUIRED', 'RETRY_PENDING']) {
    f.repository.listJobs = (id) => readJobs(id).map((j) => j.execution_status === 'FAILED' ? { ...j, execution_status: status } : j);
    await assert.rejects(f.loader.loadRunExport(f.run_id), /stable|export|terminal/i);
    await assert.rejects(f.controller.exportRun(f.run_id, 'ALL'), /stable|export|terminal/i);
  }
  f.repository.listJobs = readJobs;
  const readAttempts = f.repository.listAttempts.bind(f.repository);
  f.repository.listAttempts = (id) => readAttempts(id).map((a) => ({ ...a, execution_status: 'RUNNING' }));
  await assert.rejects(f.loader.loadRunExport(f.run_id), /active|stable|attempt|terminal/i);
  f.repository.listAttempts = readAttempts;
  const none = await fixture(t, { failed: true, partial: true });
  assert.equal(none.controller.getRunState(none.run_id).can_export, false);
  await assert.rejects(none.loader.loadRunExport(none.run_id), /accepted|stable|export/i);
  await assert.rejects(none.controller.exportRun(none.run_id, 'ALL'), /accepted|stable|export/i);
});

test('partial export excludes simultaneous retry or cancellation and detects evidence changes during loading', async (t) => {
  const f = await fixture(t, { mixed: true, partial: true });
  let release; const paused = new Promise((resolve) => { release = resolve; });
  const controller = controllerFor(f, { execute_retry: async () => {}, load_export: async (id) => { await paused; return f.loader.loadRunExport(id); } });
  const before = f.repository.listJobs(f.run_id), exporting = controller.exportRun(f.run_id, 'ALL');
  exporting.catch(() => {});
  try {
    await assert.rejects(controller.retryFailed(f.run_id), /export/i);
    await assert.rejects(controller.cancelRun(f.run_id), /export/i);
    assert.deepEqual(f.repository.listJobs(f.run_id), before);
  } finally { release(); }
  await exporting;
  const g = await fixture(t, { mixed: true, partial: true });
  const read = g.loader.readAcceptedJobArtifact.bind(g.loader), attempts = g.repository.listAttempts.bind(g.repository);
  g.loader.readAcceptedJobArtifact = async (...args) => {
    const loaded = await read(...args);
    g.repository.listAttempts = (id) => attempts(id).map((a) => ({ ...a, error_code: 'CHANGED_DURING_EXPORT' }));
    return loaded;
  };
  await assert.rejects(g.controller.exportRun(g.run_id, 'ALL'), /changed|snapshot|stable/i);
  assert.equal(fs.readdirSync(path.join(g.directories.runs, g.run_id, 'exports')).length, 0);
});
test('real completed SQLite Run exports exact accepted XML through the general desktop path despite Blog blockers', async (t) => {
  const f = await fixture(t);
  const store = new BlogWritingPackStore(path.join(f.root, 'blog-drafts'));
  const draft = await assembleBlogWritingPackV2Draft({ package_id: 'blocked-blog', created_at: '2026-10-19T12:00:00.000Z', application_version: 'test',
    selection: { recipe_version: 2, workspace_id: f.workspace.workspace_id, selections: [{ run_id: f.run_id, job_id: f.job.job_id, artifact_id: f.artifact.artifact_id }] } }, { repository: f.repository, loader: f.loader });
  await store.saveDraft(draft);
  const readiness = await evaluateBlogWritingPackV2Readiness({ package_id: draft.package_id, workspace_id: draft.workspace_id,
    requirements: BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS }, { store, repository: f.repository, loader: f.loader });
  assert.ok(readiness.blockers.some((b) => b.dataset_type === 'SITEMAP_URLS' && b.requirement_id === 'title'));
  assert.notEqual(readiness.coverage_status, 'COMPLETE');
  const before = fs.readFileSync(f.rawPath); const attempts = f.repository.listAttempts(f.job.job_id);
  const result = await f.controller.exportRun(f.run_id, 'ALL');
  assert.equal(result.raw_file_count, 1);
  assert.equal(result.normalized_file_count, 1);
  assert.equal(result.unavailable_evidence_count, 0);
  assert.equal(result.collection_status, 'COMPLETE');
  const index = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')));
  assert.equal(index.schema_version, 1); assert.equal(index.files.length, 1);
  const entry = index.files[0]; const exported = fs.readFileSync(path.join(result.export_directory, entry.relative_path));
  assert.deepEqual(exported, before); assert.deepEqual(exported, f.bytes);
  assert.equal(entry.sha256, sha(before)); assert.equal(entry.byte_size, before.length);
  assert.deepEqual([entry.workspace_id, entry.run_id, entry.source_id, entry.dataset_type, entry.job_id, entry.artifact_id],
    [f.workspace.workspace_id, f.run_id, SOURCE, 'SITEMAP_URLS', f.job.job_id, f.artifact.artifact_id]);
  assert.equal(entry.attempt_id, attempts[0].attempt_id); assert.equal(entry.validation_id, attempts[0].validation_id);
  assert.equal(entry.validation_status, 'VALID'); assert.equal(entry.media_type, 'application/xml');
  assert.ok(entry.relative_path.endsWith('.xml'));
  assert.equal(entry.requested_context.requested_url, 'https://bitkimark.com/blogs.xml');
  assert.equal(entry.acquisition_context.response_status, 200);
  const normalized = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'DATASETS.json')));
  assert.equal(normalized.length, 1); assert.equal(JSON.parse(fs.readFileSync(path.join(result.export_directory, normalized[0].filename)))[0].url, 'https://bitkimark.com/blog/synthetic-raw');
  assert.deepEqual(fs.readFileSync(f.rawPath), before); assert.deepEqual(f.repository.listAttempts(f.job.job_id), attempts);
  const manifestBefore = fs.readFileSync(path.join(result.export_directory, 'MANIFEST.json'));
  await assert.rejects(f.controller.exportRun(f.run_id, 'ALL'), /exist|overwrite/i);
  assert.deepEqual(fs.readFileSync(path.join(result.export_directory, 'MANIFEST.json')), manifestBefore);
  console.log(`RAW-EXAMPLE: ${before.length} bytes SHA-256 ${sha(before)}`);
});

test('failed siblings, failed-only Runs and accepted NO_DATA preserve actual outcomes without fabricated files or rows', async (t) => {
  for (const options of [{ mixed: true }, { failed: true }, { empty: true }]) {
    const f = await fixture(t, options); const result = await f.controller.exportRun(f.run_id, 'ALL');
    const index = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')));
    assert.equal(index.jobs.length, f.jobs.length);
    assert.equal(index.files.length, options.failed ? 0 : 1);
    assert.equal(result.raw_file_count, index.files.length);
    assert.equal(result.normalized_file_count, options.failed ? 0 : 1);
    assert.equal(result.unavailable_evidence_count, options.mixed || options.failed ? 1 : 0);
    assert.equal(result.collection_status, options.empty ? 'COMPLETE_WITH_WARNINGS' : 'INCOMPLETE');
    assert.equal(result.no_data_file_count, options.empty ? 1 : 0);
    assert.equal(result.low_data_file_count, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.export_directory, 'FAILURES.json'))).length, options.mixed || options.failed ? 1 : 0);
    if (options.failed || options.mixed) {
      assert.ok(index.jobs.some((job) => job.execution_status === 'FAILED' && job.attempts.some((a) => a.error_code === 'HTTP_503')));
      assert.equal(result.failed_count, 1);
    }
    if (options.empty) {
      assert.equal(index.files[0].validation_status, 'NO_DATA');
      assert.deepEqual(fs.readFileSync(path.join(result.export_directory, index.files[0].relative_path)), f.bytes);
      const normalized = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'DATASETS.json')));
      assert.equal(normalized[0].row_count, 0);
    }
    const successful = await f.controller.exportRun(f.run_id, 'SUCCESSFUL_ONLY');
    assert.equal(successful.failed_count, options.mixed || options.failed ? 1 : 0, 'Failure reporting must not disappear in successful-only mode');
    assert.equal(successful.raw_file_count, result.raw_file_count);
    assert.equal(successful.unavailable_evidence_count, result.unavailable_evidence_count);
    assert.equal(successful.collection_status, result.collection_status);
  }
});

test('raw corruption, unaccepted artifacts, missing validation and unsafe storage paths fail before publication', async (t) => {
  for (const partial of [false, true]) {
  for (const damage of ['corrupt', 'missing', 'unaccepted', 'validation', 'validation-mismatch', 'attempt', 'metadata', 'path', 'symlink']) {
    const f = await fixture(t, partial ? { mixed: true, partial: true } : {});
    if (damage === 'corrupt') { const b = fs.readFileSync(f.rawPath); b[0] ^= 1; fs.writeFileSync(f.rawPath, b); }
    if (damage === 'missing') fs.unlinkSync(f.rawPath);
    if (damage === 'symlink') { fs.renameSync(f.rawPath, `${f.rawPath}.real`); fs.symlinkSync(`${f.rawPath}.real`, f.rawPath); }
    if (damage === 'validation') f.repository.getValidationSummary = () => null;
    if (damage === 'validation-mismatch') {
      const read = f.repository.getValidationSummary.bind(f.repository);
      f.repository.getValidationSummary = (id) => ({ ...read(id), validation_id: 'another-validation' });
    }
    if (damage === 'attempt') {
      const read = f.repository.listAttempts.bind(f.repository);
      f.repository.listAttempts = (id) => read(id).map((a) => ({ ...a, candidate_artifact_id: 'another-artifact' }));
    }
    if (damage === 'metadata') {
      const metadata = JSON.parse(fs.readFileSync(f.metadataPath)); metadata.attempt_id = 'another-attempt';
      fs.writeFileSync(f.metadataPath, JSON.stringify(metadata));
    }
    if (damage === 'unaccepted' || damage === 'path') {
      const original = f.repository.getArtifact.bind(f.repository);
      f.repository.getArtifact = (id) => ({ ...original(id), ...(damage === 'path' ? { relative_path: '../outside.xml' } : { artifact_state: 'CANDIDATE' }) });
    }
    await assert.rejects(f.controller.exportRun(f.run_id, 'ALL'), /integrity|checksum|ENOENT|accepted|validation|identity|path|regular|symlink|escapes/i, damage);
    assert.equal(fs.existsSync(path.join(f.directories.runs, f.run_id, 'exports', 'all')), false);
    assert.equal(fs.readdirSync(path.join(f.directories.runs, f.run_id, 'exports')).length, 0);
  }
  }
});

test('collector metadata is sanitized; filenames and export-parent symlinks cannot escape', async (t) => {
  const f = await fixture(t);
  const metadata = JSON.parse(fs.readFileSync(f.metadataPath));
  Object.assign(metadata.acquisition_metadata, { authorization: 'Bearer synthetic-private-marker', cookie: 'synthetic-cookie-marker',
    refresh_token: 'synthetic-refresh-marker', file_path: '/private/synthetic-local-path', endpoint: 'https://example.test?access_token=synthetic-url-marker' });
  fs.writeFileSync(f.metadataPath, JSON.stringify(metadata));
  const result = await f.controller.exportRun(f.run_id, 'ALL');
  const text = fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json'), 'utf8');
  for (const marker of ['synthetic-private-marker', 'synthetic-cookie-marker', 'synthetic-refresh-marker', '/private/synthetic-local-path', 'synthetic-url-marker']) assert.equal(text.includes(marker), false);
  const loaded = await f.loader.loadRunExport(f.run_id); loaded.raw.files[0].filename = '../escape.xml';
  const { buildDataPackage, writeDataPackage } = load('main/export/data-package-exporter.js');
  await assert.rejects(writeDataPackage(path.join(f.root, 'unsafe'), buildDataPackage({ run: f.repository.getRun(f.run_id), jobs: f.jobs, datasets: loaded.datasets, mode: 'ALL' }), loaded.raw), /unsafe|filename|path/i);
  assert.equal(fs.existsSync(path.join(f.root, 'unsafe')), false);
  const g = await fixture(t); const exportsRoot = path.join(g.directories.runs, g.run_id, 'exports');
  fs.rmdirSync(exportsRoot); fs.symlinkSync(g.root, exportsRoot);
  await assert.rejects(g.controller.exportRun(g.run_id, 'ALL'), /symbolic|symlink|unsafe/i);
  assert.equal(fs.existsSync(path.join(g.root, 'all')), false);
});

test('an unavailable normalizer does not prevent independently verified accepted raw delivery', async (t) => {
  const f = await fixture(t);
  // Model an accepted native dataset for which this exporter has no row adapter.
  f.loader.parseDataset = () => { throw new Error('No normalized adapter'); };
  const result = await f.controller.exportRun(f.run_id, 'ALL');
  const index = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')));
  assert.equal(index.files.length, 1); assert.equal(index.files[0].normalization_status, 'UNAVAILABLE');
  assert.equal(result.raw_file_count, 1);
  assert.equal(result.normalized_file_count, 0);
  assert.equal(result.dataset_count, 0);
  assert.equal(result.normalization_unavailable_count, 1);
  assert.equal(result.unavailable_evidence_count, 0);
  assert.equal(result.collection_status, 'COMPLETE');
  assert.equal(index.files[0].dataset_type, null, 'Unknown identity must stay absent, never a fabricated dataset label');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(result.export_directory, 'DATASETS.json'))), []);
  assert.deepEqual(fs.readFileSync(path.join(result.export_directory, index.files[0].relative_path)), f.bytes);
});

test('metadata sanitization preserves actual analytics session scope while removing session credentials', () => {
  const { safeDataPackageContext } = load('main/export/data-package-exporter.js');
  const session_filter = { session_source: 'google', session_medium: 'cpc' };
  const result = safeDataPackageContext({ dataset_type: 'GA4_PAID_FUNNEL', session_filter,
    session: 'private-session-marker', session_id: 'private-session-id-marker' });
  assert.deepEqual(result, { dataset_type: 'GA4_PAID_FUNNEL', session_filter });
});

test('a published export stays successful if reservation cleanup fails after commit', async (t) => {
  const f = await fixture(t);
  const promises = require('node:fs/promises'); const original = promises.rm;
  promises.rm = async (filename, ...args) => {
    if (String(filename).endsWith('.publishing')) throw new Error('Synthetic reservation cleanup failure');
    return original(filename, ...args);
  };
  let result;
  try { result = await f.controller.exportRun(f.run_id, 'ALL'); }
  finally { promises.rm = original; }
  const index = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')));
  assert.equal(sha(fs.readFileSync(path.join(result.export_directory, index.files[0].relative_path))), f.artifact.sha256);
});

test('concurrent export attempts cannot overwrite the same final destination', async (t) => {
  const f = await fixture(t);
  const results = await Promise.allSettled([f.controller.exportRun(f.run_id, 'ALL'), f.controller.exportRun(f.run_id, 'ALL')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  const result = results.find((r) => r.status === 'fulfilled').value;
  const index = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')));
  assert.deepEqual(fs.readFileSync(path.join(result.export_directory, index.files[0].relative_path)), f.bytes);
  const { buildDataPackage, writeDataPackage } = load('main/export/data-package-exporter.js');
  const loaded = await f.loader.loadRunExport(f.run_id);
  const dataPackage = buildDataPackage({ run: loaded.snapshot.run, jobs: loaded.snapshot.jobs, datasets: loaded.datasets, mode: 'ALL' });
  const directory = path.join(f.root, 'writer-concurrency');
  const writes = await Promise.allSettled([writeDataPackage(directory, dataPackage, loaded.raw), writeDataPackage(directory, dataPackage, loaded.raw)]);
  assert.equal(writes.filter((write) => write.status === 'fulfilled').length, 1, 'Filesystem reservation must also protect independent publishers');
  assert.equal(writes.filter((write) => write.status === 'rejected').length, 1);
  const raw = JSON.parse(fs.readFileSync(path.join(directory, 'RAW_EVIDENCE.json')));
  assert.deepEqual(fs.readFileSync(path.join(directory, raw.files[0].relative_path)), f.bytes);
});

test('native HTTP XML, official API JSON and imported XLSX share one persisted Run and export exact evidence', async (t) => {
  for (const mixed of [false, true]) {
    const f = await fixture(t, { multi_source: true, mixed });
    const accepted = f.jobs.filter((job) => job.accepted_artifact_id);
    assert.equal(accepted.length, 3, 'Native collection and validators must actually accept each source');
    const before = accepted.map((job) => ({ job, artifact: f.repository.getArtifact(job.accepted_artifact_id),
      attempts: f.repository.listAttempts(job.job_id) }));
    const result = await f.controller.exportRun(f.run_id, 'ALL');
    const index = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')));
    assert.equal(result.raw_file_count, 3); assert.equal(result.normalized_file_count, 3);
    assert.equal(result.failed_count, mixed ? 1 : 0); assert.equal(result.unavailable_evidence_count, mixed ? 1 : 0);
    assert.equal(result.collection_status, mixed ? 'INCOMPLETE' : 'COMPLETE');
    assert.equal(index.files.length, 3);
    assert.deepEqual(new Set(index.files.map((file) => file.source_id)), new Set(f.expectedRaw.keys()));
    for (const entry of index.files) {
      const expected = f.expectedRaw.get(entry.source_id);
      const { job, artifact, attempts } = before.find((item) => item.job.job_id === entry.job_id);
      const original = fs.readFileSync(f.storage.resolveRunRelativePath(f.run_id, artifact.relative_path));
      const exported = fs.readFileSync(path.join(result.export_directory, entry.relative_path));
      assert.deepEqual(exported, original); assert.deepEqual(exported, expected.bytes);
      assert.equal(entry.sha256, sha(exported)); assert.equal(entry.sha256, artifact.sha256);
      assert.equal(entry.byte_size, original.length); assert.equal(entry.byte_size, artifact.byte_size);
      assert.equal(entry.media_type, expected.media_type); assert.ok(entry.filename.endsWith(expected.extension));
      assert.equal(entry.filename, artifact.filename); assert.equal(entry.filename, expected.filename);
      assert.ok(entry.relative_path.endsWith(expected.extension)); assert.equal(entry.dataset_type, expected.dataset_type);
      assert.deepEqual([entry.workspace_id, entry.run_id, entry.artifact_id, entry.validation_status],
        [f.workspace.workspace_id, f.run_id, artifact.artifact_id, 'VALID']);
      assert.equal(entry.attempt_id, attempts[0].attempt_id); assert.equal(entry.validation_id, attempts[0].validation_id);
      assert.equal(entry.acquired_at, artifact.created_at); assert.equal(entry.attempt_number, artifact.attempt_number);
      const metadata = fs.readFileSync(path.join(f.directories.runs, f.run_id, job.source_id, 'metadata', `${job.job_key}.metadata.json`));
      assert.equal(entry.acquisition_metadata_sha256, sha(metadata));
      const validation = f.repository.getValidationSummary(entry.validation_id);
      assert.equal(validation.artifact_id, entry.artifact_id); assert.equal(validation.validation_status, 'VALID');
      assert.deepEqual(f.repository.listAttempts(job.job_id), attempts);
      assert.deepEqual(fs.readFileSync(f.storage.resolveRunRelativePath(f.run_id, artifact.relative_path)), original);
      if (!mixed) console.log(`MULTISOURCE-RAW: ${entry.source_id} ${entry.byte_size} bytes ${entry.sha256} ${entry.media_type} ${entry.filename}`);
    }
    const text = JSON.stringify(index);
    assert.equal(text.includes('synthetic-refresh'), false); assert.equal(text.includes('synthetic-token'), false);
    assert.equal(text.includes(f.root), false, 'Original import paths must not leak');
    assert.equal(fs.readFileSync(path.join(result.export_directory, index.files.find((e) => e.source_id === 'google-search-console-query').relative_path), 'utf8').includes('native_marker'), true);
    if (mixed) {
      const failed = f.jobs.find((job) => !job.accepted_artifact_id);
      assert.ok(index.jobs.find((job) => job.job_id === failed.job_id).attempts.some((a) => a.error_code === 'HTTP_503'));
      assert.equal(index.files.some((file) => file.job_id === failed.job_id), false);
    }
  }
});

test('native Trends LOW_DATA remains accepted raw CSV and reports collection warnings', async (t) => {
  const f = await fixture(t, { low_data: true });
  assert.equal(f.job.validation_status, 'LOW_DATA', 'The real source validator must establish LOW_DATA');
  const attempt = f.repository.listAttempts(f.job.job_id)[0];
  assert.equal(f.repository.getValidationSummary(attempt.validation_id).validation_status, 'LOW_DATA');
  const result = await f.controller.exportRun(f.run_id, 'ALL');
  assert.equal(result.raw_file_count, 1); assert.equal(result.normalized_file_count, 1);
  assert.equal(result.low_data_file_count, 1); assert.equal(result.no_data_file_count, 0);
  assert.equal(result.failed_count, 0); assert.equal(result.unavailable_evidence_count, 0);
  assert.equal(result.collection_status, 'COMPLETE_WITH_WARNINGS');
  const index = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')));
  const entry = index.files[0];
  assert.equal(entry.validation_status, 'LOW_DATA'); assert.equal(entry.media_type, 'text/csv');
  assert.equal(entry.filename, 'GT01_TR_24M_interest_over_time.csv');
  assert.equal(entry.attempt_id, attempt.attempt_id); assert.equal(entry.validation_id, attempt.validation_id);
  assert.deepEqual(fs.readFileSync(path.join(result.export_directory, entry.relative_path)), f.bytes);
  assert.equal(entry.sha256, sha(f.bytes)); assert.equal(entry.sha256, f.artifact.sha256);
});
