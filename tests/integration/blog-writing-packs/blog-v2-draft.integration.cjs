const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const [buildRoot, workRoot] = process.argv.slice(2);
const { assembleBlogWritingPackV2Draft } = require(path.join(buildRoot, 'main/blog-writing-packs/blog-writing-pack-assembler.js'));
const { BlogWritingPackStore } = require(path.join(buildRoot, 'main/blog-writing-packs/blog-writing-pack-store.js'));
const { resolveBlogWritingPackV2Selections } = require(path.join(buildRoot, 'main/blog-writing-packs/blog-writing-pack-v2-selection-resolver.js'));
const { ProductionDataPackageLoader } = require(path.join(buildRoot, 'main/export/production-data-package-loader.js'));

fs.mkdirSync(workRoot, { recursive: true });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fixture = () => {
  const root = fs.mkdtempSync(path.join(workRoot, 'draft-'));
  const runs = new Map();
  const jobs = new Map();
  const artifacts = new Map();
  const attempts = new Map();
  const validations = new Map();
  const repository = {
    getRun: (id) => runs.get(id) ?? null,
    listJobs: (id) => [...jobs.values()].filter((job) => job.run_id === id),
    getArtifact: (id) => artifacts.get(id) ?? null,
    listAttempts: (id) => [...attempts.values()].filter((attempt) => attempt.job_id === id),
    getValidationSummary: (id) => validations.get(id) ?? null,
  };
  const loader = new ProductionDataPackageLoader(repository, {
    resolveRunRelativePath: (runId, filename) => path.join(root, 'runs', runId, filename),
  });
  const add = (suffix, sourceId = 'google-ads-search-terms', datasetType = 'SEARCH_TERMS') => {
    const run_id = `run_${suffix}`;
    const job_id = `job_${suffix}`;
    const artifact_id = `artifact_${suffix}`;
    const bytes = Buffer.from(JSON.stringify({ fixture: suffix }));
    const filename = path.join(root, 'runs', run_id, 'raw.json');
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, bytes);
    runs.set(run_id, { run_id, workspace_id: 'workspace_one', run_status: 'COMPLETED' });
    jobs.set(job_id, {
      run_id, job_id, source_id: sourceId, job_key: suffix,
      source_context: {
        source_id: sourceId, dataset_type: datasetType,
        requested_date_start: '2026-09-01', requested_date_end: '2026-09-28',
      },
      execution_status: 'COMPLETED', validation_status: 'VALID', accepted_artifact_id: artifact_id,
    });
    artifacts.set(artifact_id, {
      artifact_id, run_id, job_id, source_id: sourceId, attempt_number: 1,
      artifact_kind: 'RAW_SOURCE_FILE', artifact_state: 'ACCEPTED', filename: 'raw.json',
      relative_path: 'raw.json', media_type: 'application/json', byte_size: bytes.length,
      sha256: sha(bytes), created_at: '2026-10-01T10:00:00.000Z',
    });
    attempts.set(`attempt_${suffix}`, {
      attempt_id: `attempt_${suffix}`, job_id, attempt_number: 1, execution_status: 'COMPLETED',
      candidate_artifact_id: artifact_id, validation_id: `validation_${suffix}`,
    });
    validations.set(`validation_${suffix}`, {
      validation_id: `validation_${suffix}`, run_id, job_id, artifact_id, validation_status: 'VALID',
    });
    return { run_id, job_id, artifact_id };
  };
  const intent = (selections) => ({ recipe_version: 2, workspace_id: 'workspace_one', selections });
  const assemble = (selections, metadata = {}) => assembleBlogWritingPackV2Draft({
    package_id: 'blog_v2_draft', created_at: '2026-10-15T10:00:00.000Z', application_version: '1.0.0',
    selection: intent(selections), ...metadata,
  }, { repository, loader });
  const store = new BlogWritingPackStore(path.join(root, 'packages'));
  return {
    root, runs, jobs, artifacts, attempts, validations, add, assemble, store,
    select: (selections) => resolveBlogWritingPackV2Selections(intent(selections), { repository, loader }),
  };
};

test('two Runs assemble a membership-only v2 draft and reload with exact provenance', async () => {
  assert.equal(typeof assembleBlogWritingPackV2Draft, 'function', 'Slice 2 needs a v2 draft assembler');
  const f = fixture();
  const ads = f.add('ads');
  const gsc = f.add('gsc', 'google-search-console-query-page', 'QUERY_PAGE');
  const draft = await f.assemble([ads, gsc]);
  assert.equal(draft.recipe_version, 2);
  assert.equal(draft.state, 'DRAFT');
  assert.equal(draft.readiness_status, 'NOT_EVALUATED');
  assert.equal(Object.hasOwn(draft, 'run_id'), false);
  assert.deepEqual(draft.selected_evidence.map((item) => [
    item.workspace_id, item.source_id, item.dataset_type, item.run_id, item.job_id,
    item.attempt_id, item.validation_id, item.validation_status, item.artifact_id,
  ]), [
    ['workspace_one', 'google-ads-search-terms', 'SEARCH_TERMS', 'run_ads', 'job_ads', 'attempt_ads', 'validation_ads', 'VALID', 'artifact_ads'],
    ['workspace_one', 'google-search-console-query-page', 'QUERY_PAGE', 'run_gsc', 'job_gsc', 'attempt_gsc', 'validation_gsc', 'VALID', 'artifact_gsc'],
  ]);
  assert.equal(draft.selected_evidence[0].artifact_sha256, sha(Buffer.from('{"fixture":"ads"}')));
  assert.equal(draft.selected_evidence[0].artifact_byte_size, 17);
  assert.equal(draft.selected_evidence[1].requested_context.requested_date_end, '2026-09-28');
  assert.equal(draft.selected_evidence[0].observed_context, null);
  await f.store.saveDraft(draft);
  const reloaded = await new BlogWritingPackStore(path.join(f.root, 'packages')).readDraft(draft.package_id);
  assert.deepEqual(reloaded, draft);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'packages', draft.package_id)), ['BLOG_DRAFT.json']);
  await assert.rejects(f.store.readManifest(draft.package_id), /BLOG_PACKAGE|invalid/i);
});

test('newer Runs and mutated caller objects cannot change persisted membership', async () => {
  const f = fixture();
  const first = f.add('first');
  const gsc = f.add('gsc', 'google-search-console-query-page', 'QUERY_PAGE');
  const draft = await f.assemble([first, gsc]);
  await f.store.saveDraft(draft);
  const filename = path.join(f.root, 'packages', draft.package_id, 'BLOG_DRAFT.json');
  const originalBytes = fs.readFileSync(filename);
  draft.selected_evidence[0].run_id = 'caller_changed';
  f.add('newest');
  f.runs.clear();
  const restored = await f.store.readDraft(draft.package_id);
  assert.deepEqual(restored.selected_evidence.map((item) => item.run_id), ['run_first', 'run_gsc']);
  restored.selected_evidence[0].requested_context.requested_date_end = '2099-01-01';
  assert.deepEqual(fs.readFileSync(filename), originalBytes);
  assert.equal((await f.store.readDraft(draft.package_id)).selected_evidence[0].requested_context.requested_date_end, '2026-09-28');
});

test('assembly revalidates raw integrity and never replaces selected evidence', async () => {
  const f = fixture();
  const selection = f.add('first');
  await f.select([selection]);
  f.add('newest');
  const filename = path.join(f.root, 'runs', selection.run_id, 'raw.json');
  fs.writeFileSync(filename, '{"fixture":"other"}');
  await assert.rejects(f.assemble([selection]), /checksum/i);
  assert.equal(fs.existsSync(path.join(f.root, 'packages')), false);
  assert.equal(fs.readFileSync(filename, 'utf8'), '{"fixture":"other"}', 'assembly must not repair raw evidence');
});

test('assembly rechecks accepted artifact, Attempt, Validation, and Workspace after selection', async () => {
  for (const [change, message] of [
    [(f) => { f.jobs.get('job_a').accepted_artifact_id = 'replacement'; }, /Job.*accepted/i],
    [(f) => { f.attempts.get('attempt_a').candidate_artifact_id = 'replacement'; }, /Attempt/i],
    [(f) => { f.validations.get('validation_a').artifact_id = 'replacement'; }, /Validation/i],
    [(f) => { f.runs.get('run_a').workspace_id = 'workspace_other'; }, /Workspace/i],
  ]) {
    const f = fixture();
    const selection = f.add('a');
    await f.select([selection]);
    change(f);
    await assert.rejects(f.assemble([selection]), message);
  }
});

test('duplicate selections fail while distinct Jobs in the same family remain separate', async () => {
  const f = fixture();
  const first = f.add('first');
  const second = f.add('second');
  await assert.rejects(f.assemble([first, first]), /Duplicate/i);
  const draft = await f.assemble([first, second]);
  await f.store.saveDraft(draft);
  assert.deepEqual((await f.store.readDraft(draft.package_id)).selected_evidence.map((item) => item.job_id), ['job_first', 'job_second']);
});

test('seven artifact references still have unevaluated readiness and cannot persist as COMPLETE', async () => {
  const f = fixture();
  const selections = [
    f.add('ads'), f.add('gsc', 'google-search-console-query-page', 'QUERY_PAGE'),
    f.add('kwp', 'google-keyword-planner', 'KEYWORD_HISTORICAL_METRICS'),
    f.add('products', 'ikas-products', 'PRODUCTS'), f.add('sitemap', 'bitkimark-sitemap', 'SITEMAP_URLS'),
    f.add('serp', 'serpapi', 'GOOGLE_SERP'), f.add('ga4', 'google-analytics-4', 'GA4_CONTENT_PERFORMANCE'),
  ];
  const draft = await f.assemble(selections);
  assert.equal(draft.readiness_status, 'NOT_EVALUATED');
  assert.equal(Object.hasOwn(draft, 'coverage_status'), false);
  await assert.rejects(f.store.saveDraft({ ...draft, state: 'COMPLETE' }), /draft/i);
  await assert.rejects(f.store.saveDraft({ ...draft, coverage_status: 'COMPLETE' }), /draft/i);
});

test('draft persistence refuses overwrite and preserves raw files and existing v1 package directories', async () => {
  const f = fixture();
  const selection = f.add('a');
  const raw = path.join(f.root, 'runs', selection.run_id, 'raw.json');
  const rawBefore = fs.readFileSync(raw);
  const draft = await f.assemble([selection]);
  const v1Directory = path.join(f.root, 'packages', 'existing_v1');
  fs.mkdirSync(v1Directory, { recursive: true });
  const v1File = path.join(v1Directory, 'BLOG_PACKAGE.json');
  fs.writeFileSync(v1File, '{"recipe_version":1,"fixture":"historical"}');
  const v1Before = fs.readFileSync(v1File);
  await f.store.saveDraft(draft);
  const draftFile = path.join(f.root, 'packages', draft.package_id, 'BLOG_DRAFT.json');
  const draftBefore = fs.readFileSync(draftFile);
  await assert.rejects(f.store.saveDraft(draft), /exists|overwrite/i);
  await assert.rejects(f.store.saveDraft({ ...draft, package_id: 'existing_v1' }), /exists|overwrite/i);
  assert.deepEqual(fs.readFileSync(raw), rawBefore);
  assert.deepEqual(fs.readFileSync(v1File), v1Before);
  assert.deepEqual(fs.readFileSync(draftFile), draftBefore);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'packages')).sort(), ['blog_v2_draft', 'existing_v1']);
});

test('draft store rejects inconsistent disk membership, unsafe paths, and symlinks', async () => {
  const f = fixture();
  const draft = await f.assemble([f.add('a')]);
  await assert.rejects(f.store.saveDraft({ ...draft, package_id: '../escape' }));
  await f.store.saveDraft(draft);
  const directory = path.join(f.root, 'packages', draft.package_id);
  const filename = path.join(directory, 'BLOG_DRAFT.json');
  const original = fs.readFileSync(filename);
  const invalid = structuredClone(draft);
  invalid.selected_evidence[0].workspace_id = 'another_workspace';
  fs.writeFileSync(filename, JSON.stringify(invalid));
  await assert.rejects(f.store.readDraft(draft.package_id), /Workspace|draft/i);
  fs.writeFileSync(filename, original);
  fs.writeFileSync(path.join(directory, 'BLOG_WRITING_PACK.xlsx'), 'unexpected');
  await assert.rejects(f.store.readDraft(draft.package_id), /draft/i);
  fs.unlinkSync(path.join(directory, 'BLOG_WRITING_PACK.xlsx'));
  const outside = path.join(f.root, 'outside.json');
  fs.writeFileSync(outside, original);
  fs.unlinkSync(filename);
  fs.symlinkSync(outside, filename);
  await assert.rejects(f.store.readDraft(draft.package_id), /draft/i);
});
