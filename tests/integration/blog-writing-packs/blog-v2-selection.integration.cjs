const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const [buildRoot, workRoot] = process.argv.slice(2);
const { resolveBlogWritingPackV2Selections } = require(path.join(
  buildRoot, 'main/blog-writing-packs/blog-writing-pack-v2-selection-resolver.js',
));
const { ProductionDataPackageLoader } = require(path.join(
  buildRoot, 'main/export/production-data-package-loader.js',
));

const fixture = () => {
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
  const storage = {
    resolveRunRelativePath: (runId, relative) => path.join(workRoot, runId, relative),
  };
  const loader = new ProductionDataPackageLoader(repository, storage);
  const add = (suffix, sourceId, datasetType, workspaceId = 'workspace_one') => {
    const runId = `run_${suffix}`;
    const jobId = `job_${suffix}`;
    const attemptId = `attempt_${suffix}`;
    const validationId = `validation_${suffix}`;
    const artifactId = `artifact_${suffix}`;
    const bytes = Buffer.from(`fixture raw evidence ${suffix}`);
    const relative = 'raw.json';
    const dir = path.join(workRoot, runId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, relative), bytes);
    runs.set(runId, {
      run_id: runId, workspace_id: workspaceId, run_status: 'COMPLETED',
    });
    jobs.set(jobId, {
      run_id: runId, job_id: jobId, source_id: sourceId, job_key: suffix,
      source_context: { source_id: sourceId, dataset_type: datasetType, requested_date_start: '2026-09-01' },
      execution_status: 'COMPLETED', validation_status: 'VALID',
      accepted_artifact_id: artifactId,
    });
    artifacts.set(artifactId, {
      artifact_id: artifactId, run_id: runId, job_id: jobId, source_id: sourceId,
      attempt_number: 1, artifact_kind: 'RAW_SOURCE_FILE', artifact_state: 'ACCEPTED',
      filename: relative, relative_path: relative, media_type: 'application/json',
      byte_size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      created_at: '2026-10-01T12:00:00.000Z',
    });
    attempts.set(attemptId, {
      attempt_id: attemptId, job_id: jobId, attempt_number: 1,
      execution_status: 'COMPLETED', candidate_artifact_id: artifactId,
      validation_id: validationId,
    });
    validations.set(validationId, {
      validation_id: validationId, run_id: runId, job_id: jobId,
      artifact_id: artifactId, validation_status: 'VALID',
    });
    return { run_id: runId, job_id: jobId, artifact_id: artifactId };
  };
  return {
    runs, jobs, artifacts, attempts, validations, add,
    resolve: (selections, workspace_id = 'workspace_one') => resolveBlogWritingPackV2Selections(
      { recipe_version: 2, workspace_id, selections }, { repository, loader },
    ),
  };
};

test('two explicit selections from different Runs retain exact persisted identity and context', async () => {
  const f = fixture();
  const ads = f.add('ads', 'google-ads-search-terms', 'SEARCH_TERMS');
  const gsc = f.add('gsc', 'google-search-console-query-page', 'QUERY_PAGE');
  const result = await f.resolve([ads, gsc]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => [item.run_id, item.job_id, item.attempt_id, item.validation_id, item.artifact_id]), [
    ['run_ads', 'job_ads', 'attempt_ads', 'validation_ads', 'artifact_ads'],
    ['run_gsc', 'job_gsc', 'attempt_gsc', 'validation_gsc', 'artifact_gsc'],
  ]);
  assert.equal(result[0].workspace_id, 'workspace_one');
  assert.equal(result[0].dataset_type, 'SEARCH_TERMS');
  assert.equal(result[0].source_id, 'google-ads-search-terms');
  assert.equal(result[0].requested_context.requested_date_start, '2026-09-01');
  assert.equal(result[0].observed_context, null);
  assert.equal(result[0].artifact_sha256, f.artifacts.get('artifact_ads').sha256);
  assert.equal(result[0].artifact_byte_size, 24);
});

test('cross-Workspace and non-completed Runs fail closed', async () => {
  const f = fixture();
  const other = f.add('other', 'google-ads-search-terms', 'SEARCH_TERMS', 'workspace_other');
  await assert.rejects(f.resolve([other]));
  f.runs.get(other.run_id).workspace_id = 'workspace_one';
  f.runs.get(other.run_id).run_status = 'RUNNING';
  await assert.rejects(f.resolve([other]));
});

test('unaccepted, wrong-owner, wrong-Attempt, and wrong-artifact selections fail closed', async () => {
  const f = fixture();
  const selection = f.add('a', 'google-ads-search-terms', 'SEARCH_TERMS');
  const artifact = f.artifacts.get(selection.artifact_id);
  artifact.artifact_state = 'REJECTED';
  await assert.rejects(f.resolve([selection]));
  artifact.artifact_state = 'ACCEPTED';
  artifact.job_id = 'another_job';
  await assert.rejects(f.resolve([selection]));
  artifact.job_id = selection.job_id;
  f.attempts.get('attempt_a').candidate_artifact_id = 'another_artifact';
  await assert.rejects(f.resolve([selection]));
  f.attempts.get('attempt_a').candidate_artifact_id = selection.artifact_id;
  await assert.rejects(f.resolve([{ ...selection, artifact_id: 'another_artifact' }]));
});

test('checksum mismatch and missing Attempt or Validation never return provenance', async () => {
  const f = fixture();
  const selection = f.add('a', 'google-ads-search-terms', 'SEARCH_TERMS');
  fs.writeFileSync(path.join(workRoot, selection.run_id, 'raw.json'), 'fixture raw evidence b');
  await assert.rejects(f.resolve([selection]), /checksum/i);
  fs.writeFileSync(path.join(workRoot, selection.run_id, 'raw.json'), 'fixture raw evidence a');
  f.attempts.delete('attempt_a');
  await assert.rejects(f.resolve([selection]));
  f.attempts.set('attempt_a', {
    attempt_id: 'attempt_a', job_id: selection.job_id, attempt_number: 1,
    execution_status: 'COMPLETED', candidate_artifact_id: selection.artifact_id,
    validation_id: 'validation_a',
  });
  f.validations.delete('validation_a');
  await assert.rejects(f.resolve([selection]));
});

test('Validation and dataset identity must match the accepted Job', async () => {
  const f = fixture();
  const selection = f.add('a', 'google-ads-search-terms', 'SEARCH_TERMS');
  f.validations.get('validation_a').artifact_id = 'another_artifact';
  await assert.rejects(f.resolve([selection]));
  f.validations.get('validation_a').artifact_id = selection.artifact_id;
  f.jobs.get(selection.job_id).source_context.dataset_type = 'QUERY_PAGE';
  await assert.rejects(f.resolve([selection]));
});

test('warning accepted-state and GA4 dataset identity remain distinct', async () => {
  const f = fixture();
  const selection = f.add('ga4', 'google-analytics-4', 'GA4_CONTENT_PERFORMANCE');
  f.jobs.get(selection.job_id).validation_status = 'NO_DATA';
  f.validations.get('validation_ga4').validation_status = 'NO_DATA';
  f.artifacts.get(selection.artifact_id).artifact_state = 'ACCEPTED_WITH_WARNING';
  const [result] = await f.resolve([selection]);
  assert.equal(result.validation_status, 'NO_DATA');
  assert.equal(result.dataset_type, 'GA4_CONTENT_PERFORMANCE');
  f.artifacts.get(selection.artifact_id).artifact_state = 'ACCEPTED';
  await assert.rejects(f.resolve([selection]));
});

test('duplicates fail, while distinct Jobs and later eligible Runs never change explicit selection', async () => {
  const f = fixture();
  const first = f.add('first', 'google-ads-search-terms', 'SEARCH_TERMS');
  const second = f.add('second', 'google-ads-search-terms', 'SEARCH_TERMS');
  await assert.rejects(f.resolve([first, first]));
  assert.deepEqual((await f.resolve([first, second])).map((item) => item.job_id), ['job_first', 'job_second']);
  f.add('newest', 'google-ads-search-terms', 'SEARCH_TERMS');
  assert.deepEqual((await f.resolve([first])).map((item) => item.job_id), ['job_first']);
  await assert.rejects(f.resolve([]));
});
