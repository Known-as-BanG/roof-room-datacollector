const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Expected compiled build and work roots.');

const load = (file) => require(path.join(buildRoot, file));
const { DesktopMultiSourceController } = load('main/app/desktop-multisource-controller.js');
const { createProductionCollectionRuntime } = load('main/app/production-collection-runtime.js');
const { InMemoryCredentialStore } = load('main/core/credential-store.js');
const { initializeDatabase, getDatabasePath } = load('main/storage/database.js');
const { StateRepository } = load('main/storage/state-repository.js');
const { StorageManager } = load('main/storage/storage-manager.js');
const { ProductionDataPackageLoader } = load('main/export/production-data-package-loader.js');
const { assembleBlogWritingPackV2Draft } = load('main/blog-writing-packs/blog-writing-pack-assembler.js');
const { BlogWritingPackStore } = load('main/blog-writing-packs/blog-writing-pack-store.js');

const SOURCE = 'serpapi';
const TASK = 'serpapi-serp-snapshot';
const queries = [
  { job_key: 'SERP-FICUS-001', query: 'ficus çeşitleri' },
  { job_key: 'SERP-OFFICE-001', query: 'ofis bitkileri' },
];
const expectedContext = (entry) => ({
  task_id: TASK,
  source_id: SOURCE,
  source_mode: 'THIRD_PARTY_API',
  dataset_type: 'GOOGLE_SERP',
  job_key: entry.job_key,
  query: entry.query,
  country_code: 'TR',
  language_code: 'tr',
  device: 'desktop',
  engine: 'google',
  organic_limit: 10,
  snapshot_date: '2026-09-18',
});

test('SERPAPI-REVIEW-CORE-001: reviewed queries and retry Attempts retain distinct response acquisition provenance through draft loading', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-18T10:00:00.000Z') });
  const root = path.join(workRoot, 'review-core');
  const directories = Object.fromEntries(
    ['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads']
      .map((key) => [key, path.join(root, key)]),
  );
  directories.app_data_root = root;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');

  let repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'SerpApi test' });
  repository.upsertSourceConnection({
    workspace_id: workspace.workspace_id,
    source_id: SOURCE,
    credential_ref: 'serpapi:test',
    safe_metadata: {},
  });
  let clock = new Date('2026-09-18T10:00:00.000Z');
  const controller = new DesktopMultiSourceController({
    repository,
    application_version: 'test',
    now: () => clock,
    readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) },
  });
  const draft = await controller.createDraft({
    workspace_id: workspace.workspace_id,
    origin: { kind: 'BLANK' },
  });
  draft.reusable_configuration = {
    sources: {
      [SOURCE]: { included: true, task_id: TASK, queries },
    },
  };

  const duplicate = structuredClone(draft);
  duplicate.reusable_configuration.sources[SOURCE].queries[1].job_key = queries[0].job_key;
  const rejected = await controller.reviewDraft(duplicate);
  assert.equal(rejected.reviewed_draft, null);
  assert.equal(rejected.job_count, 0);
  assert.equal(rejected.can_start, false);

  const review = await controller.reviewDraft(draft);
  assert.equal(review.can_start, true);
  assert.equal(review.job_count, 2);
  assert.ok(review.reviewed_draft);
  assert.equal(review.reviewed_draft.reference_date, '2026-09-18');
  assert.deepEqual(
    review.reviewed_draft.resolved_configuration.sources[SOURCE].queries,
    queries.map(expectedContext),
  );
  const lockedReview = structuredClone(review.reviewed_draft);
  clock = new Date('2026-09-19T10:00:00.000Z');
  const started = await controller.startDraft(review.reviewed_draft);
  assert.deepEqual(review.reviewed_draft, lockedReview, 'Start must not rebuild reviewed queries.');
  assert.deepEqual(started.jobs.map((job) => job.source_context), queries.map(expectedContext));
  assert.equal(JSON.stringify(started.run.configuration_snapshot).includes('fixture-secret'), false);

  repository.close();
  repository = new StateRepository(getDatabasePath(directories));
  assert.deepEqual(repository.listJobs(started.run.run_id).map((job) => job.source_context), queries.map(expectedContext));

  const credentials = new InMemoryCredentialStore();
  credentials.put('serpapi:test', 'fixture-secret');
  const providerRequests = [];
  const receiptTimes = ['2026-09-19T10:00:00.123Z', '2026-09-19T11:00:00.456Z', '2026-09-19T12:00:00.789Z'];
  const runtime = createProductionCollectionRuntime({
    repository,
    directories,
    credentialStore: credentials,
    serpApiRequester: async (request) => {
      providerRequests.push(request);
      const url = new URL(request.url);
      const query = url.searchParams.get('q');
      t.mock.timers.setTime(Date.parse(receiptTimes[providerRequests.length - 1]));
      request.on_response_received?.();
      t.mock.timers.setTime(Date.now() + 30_000);
      return {
        status: 200,
        body: {
          search_metadata: { status: 'Success' },
          search_parameters: {
            engine: 'google', q: providerRequests.length === 1 ? 'wrong query' : query, gl: 'tr', hl: 'tr', device: 'desktop', start: 0,
          },
          organic_results: [{ position: 1, title: 'Result', link: 'https://example.com/page' }],
          related_questions: [],
        },
      };
    },
    googleTrendsSource: {
      id: 'google-trends', name: 'Google Trends', sourceMode: 'GOOGLE_TRENDS_UI', datasetTypes: ['INTEREST_OVER_TIME'],
      getCapabilities: () => ({ requires_browser: true, requires_oauth: false, may_require_manual_login: true, supports_custom_date_range: true, supports_direct_export: true, supports_api: false, supports_resume: true, max_concurrency: 1 }),
      checkReadiness: async () => ({ source_id: 'google-trends', readiness_status: 'READY', checked_at: new Date().toISOString(), message: null }),
      collect: async () => ({ result_type: 'FAILED', error_code: 'UNUSED', message: null }),
    },
  });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);

  const failedJob = repository.listJobs(started.run.run_id).find((job) => job.validation_status === 'QUERY_MISMATCH');
  assert.ok(failedJob);
  const firstAttempt = repository.listAttempts(failedJob.job_id)[0];
  const firstArtifact = repository.getArtifact(firstAttempt.candidate_artifact_id);
  const metadataDirectory = path.join(directories.runs, started.run.run_id, SOURCE, 'metadata');
  const originalMetadataFile = path.join(metadataDirectory, `${failedJob.job_key}.metadata.json`);
  const originalMetadata = fs.readFileSync(originalMetadataFile);
  const originalRawFile = path.join(directories.runs, started.run.run_id, firstArtifact.relative_path);
  const originalRaw = fs.readFileSync(originalRawFile);
  assert.equal(JSON.parse(originalMetadata).acquisition_metadata.response_received_at, receiptTimes[0]);
  const retry = repository.reacquireRunAndStartRetryAttempt({ job_id: failedJob.job_id, max_attempts: 2 });
  assert.ok(retry);
  await runtime.orchestrator.executeStartedAttempt(started.run.run_id, failedJob.job_id, retry);
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);

  assert.equal(providerRequests.length, 3);
  assert.deepEqual(providerRequests.map((request) => new URL(request.url).searchParams.get('q')), [...queries.map((entry) => entry.query), failedJob.source_context.query]);
  for (const request of providerRequests) {
    const url = new URL(request.url);
    assert.equal(url.searchParams.get('engine'), 'google');
    assert.equal(url.searchParams.get('gl'), 'tr');
    assert.equal(url.searchParams.get('hl'), 'tr');
    assert.equal(url.searchParams.get('device'), 'desktop');
    assert.equal(url.searchParams.get('start'), '0');
  }
  assert.equal(repository.getRun(started.run.run_id).run_status, 'COMPLETED');
  assert.deepEqual(repository.listJobs(started.run.run_id).map((job) => job.validation_status), ['VALID', 'VALID']);
  const rawFiles = fs.readdirSync(path.join(directories.runs, started.run.run_id, SOURCE, 'raw'));
  assert.equal(rawFiles.length, 3);
  const allRaw = rawFiles.map((file) => fs.readFileSync(path.join(directories.runs, started.run.run_id, SOURCE, 'raw', file), 'utf8')).join('\n');
  assert.equal(/intent|commercial.fit|page.type|recommendation/iu.test(allRaw), false);
  const storage = new StorageManager(directories);
  await assert.rejects(storage.persistMetadataJson({ run_id: started.run.run_id, source_id: SOURCE,
    attempt_number: 1, document_key: failedJob.job_key, document: { overwrite: true },
  }), /overwrite/i);
  const loader = new ProductionDataPackageLoader(repository, storage);
  const accepted = repository.listJobs(started.run.run_id);
  const selections = [];
  for (const job of accepted) {
    const loaded = await loader.readAcceptedJobArtifact(job.run_id, job.job_id);
    const expectedTime = job.job_id === failedJob.job_id ? receiptTimes[2] : receiptTimes[1];
    assert.equal(loaded.serp_acquisition.response_received_at, expectedTime);
    assert.equal(loaded.serp_acquisition.response_received_at_origin, 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT');
    assert.notEqual(loaded.artifact.created_at, expectedTime);
    assert.equal(Object.hasOwn(JSON.parse(Buffer.from(loaded.bytes)), 'acquisition_metadata'), false);
    assert.equal(repository.listAttempts(job.job_id).some((a) => a.attempt_id === loaded.serp_acquisition.attempt_id), true);
    selections.push({ run_id: job.run_id, job_id: job.job_id, artifact_id: loaded.artifact.artifact_id });
  }
  const membership = await assembleBlogWritingPackV2Draft({ package_id: 'serp-receipt',
    created_at: new Date().toISOString(), application_version: 'test',
    selection: { recipe_version: 2, workspace_id: workspace.workspace_id, selections },
  }, { repository, loader });
  const packageStore = new BlogWritingPackStore(path.join(root, 'drafts'));
  await packageStore.saveDraft(membership);
  assert.deepEqual(await packageStore.readDraft('serp-receipt'), membership);
  assert.deepEqual(fs.readFileSync(originalMetadataFile), originalMetadata);
  assert.deepEqual(fs.readFileSync(originalRawFile), originalRaw);
  assert.notEqual(repository.getArtifact(firstArtifact.artifact_id).artifact_state, 'ACCEPTED');
  assert.equal(JSON.parse(fs.readFileSync(path.join(metadataDirectory, `${failedJob.job_key}.attempt_2.metadata.json`))).acquisition_metadata.response_received_at, receiptTimes[2]);
});
