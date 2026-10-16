const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const [buildRoot] = process.argv.slice(2);
const evaluatorFile = path.join(buildRoot, 'main/blog-writing-packs/blog-writing-pack-v2-readiness.js');
const { evaluateBlogWritingPackV2Readiness } = fs.existsSync(evaluatorFile) ? require(evaluatorFile) : {};
const contractFile = path.join(buildRoot, 'shared/blog-writing-pack-v2-readiness.js');
const { BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS } = fs.existsSync(contractFile) ? require(contractFile) : {};
const { fixture, families, syntheticRequirements } = require('./blog-v2-readiness-fixture.cjs');

test('one mandatory family present and six missing is PARTIAL', async () => {
  assert.equal(typeof evaluateBlogWritingPackV2Readiness, 'function', 'Slice 3B.1 needs a working evaluator');
  const f = fixture(); await f.persist([f.add('ads')]);
  const result = await f.evaluate();
  assert.equal(result.coverage_status, 'PARTIAL');
  assert.equal(result.delivery_readiness, 'NOT_EVALUATED');
  assert.equal(result.blockers.filter((blocker) => blocker.code === 'DATASET_MISSING').length, 6);
  assert.equal(result.datasets.find((item) => item.dataset_type === 'SEARCH_TERMS').coverage_status, 'SATISFIED');
});

test('optional Trends alone is NOT_READY and its absence never creates a mandatory blocker', async () => {
  const f = fixture(); await f.persist([f.add('trends', 'google-trends', 'INTEREST_OVER_TIME')]);
  assert.equal((await f.evaluate()).coverage_status, 'NOT_READY');
  const g = fixture(); await g.persist([g.add('ads')]);
  assert.equal((await g.evaluate()).blockers.some((item) => item.dataset_type === 'INTEREST_OVER_TIME'), false);
});

test('explicit GSC 28-day endpoints reject a 30-day aggregate without date reconstruction', async () => {
  const f = fixture(); const gsc = f.add('gsc', ...families[1]);
  f.jobs.get(gsc.job_id).source_context.requested_date_end = '2026-09-30';
  await f.persist([gsc]);
  const blocker = (await f.evaluate()).blockers.find((item) => item.code === 'WINDOW_MISMATCH');
  assert.equal(blocker.dataset_type, 'QUERY_PAGE');
  assert.equal(blocker.selections[0].artifact_id, 'artifact_gsc');
  assert.match(blocker.actual, /2026-09-30/);
  const profile = syntheticRequirements(); profile.gsc_requested_dates = null;
  assert.ok((await f.evaluate(profile)).blockers.some((item) => item.code === 'DECISION_REQUIRED' && item.requirement_id === 'gsc_requested_dates'));
});

test('current real requirements keep GA4 meanings open and missing Sitemap capability explicit', async () => {
  const f = fixture(); await f.persist(families.map(([source, type], i) => f.add(`family_${i}`, source, type)));
  const result = await f.evaluate(BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS);
  assert.equal(result.coverage_status, 'PARTIAL');
  assert.ok(result.blockers.some((b) => b.dataset_type === 'GA4_CONTENT_PERFORMANCE' && b.requirement_id === 'users' && b.code === 'DECISION_REQUIRED'));
  assert.ok(result.blockers.some((b) => b.dataset_type === 'SITEMAP_URLS' && b.requirement_id === 'title' && b.code === 'SOURCE_CHANGE_REQUIRED'));
  assert.ok(result.blockers.some((b) => b.dataset_type === 'SEARCH_TERMS' && b.requirement_id === 'reporting_window' && b.code === 'DECISION_REQUIRED'));
});

test('GSC accepted NO_DATA still reports an incorrect requested window independently of empty-result policy', async () => {
  const f = fixture(); const selection = f.add('gsc', ...families[1]);
  f.jobs.get(selection.job_id).source_context.requested_date_end = '2026-09-30';
  f.jobs.get(selection.job_id).validation_status = 'NO_DATA';
  f.validations.get('validation_gsc').validation_status = 'NO_DATA';
  f.artifacts.get(selection.artifact_id).artifact_state = 'ACCEPTED_WITH_WARNING';
  await f.persist([selection]);
  const result = await f.evaluate();
  assert.ok(result.blockers.some((b) => b.code === 'DECISION_REQUIRED' && b.requirement_id === 'validation_outcome_coverage'));
  assert.ok(result.blockers.some((b) => b.code === 'WINDOW_MISMATCH'));
});

test('a changed raw file or accepted identity is rejected without replacing draft membership', async () => {
  const f = fixture(); const selection = f.add('ads'); const draft = await f.persist([selection]);
  const rawPath = path.join(f.root, 'runs', selection.run_id, 'raw.json');
  const originalBytes = fs.readFileSync(rawPath);
  const changedBytes = Buffer.from(originalBytes); changedBytes[1] ^= 1;
  fs.writeFileSync(rawPath, changedBytes);
  let result = await f.evaluate();
  assert.equal(result.coverage_status, 'NOT_READY');
  assert.ok(result.blockers.some((b) => b.code === 'ARTIFACT_INTEGRITY_FAILED'));
  assert.deepEqual(result.selected_evidence, draft.selected_evidence);
  fs.writeFileSync(rawPath, originalBytes);
  f.jobs.get(selection.job_id).accepted_artifact_id = 'replacement';
  result = await f.evaluate();
  assert.ok(result.blockers.some((b) => b.code === 'EVIDENCE_INVALID'));
});

test('newer Runs do not change membership or draft bytes; provenance changes block evaluation', async () => {
  const f = fixture(); const selection = f.add('ads'); const draft = await f.persist([selection]);
  const filename = path.join(f.root, 'packages', 'draft', 'BLOG_DRAFT.json');
  const before = fs.readFileSync(filename);
  f.add('newest');
  let result = await f.evaluate();
  assert.deepEqual(result.selected_evidence, draft.selected_evidence);
  assert.deepEqual(fs.readFileSync(filename), before);
  f.jobs.get(selection.job_id).source_context.requested_date_end = '2026-09-29';
  result = await f.evaluate();
  assert.ok(result.blockers.some((b) => b.code === 'MEMBERSHIP_CHANGED'));
  assert.deepEqual(fs.readFileSync(filename), before);
});

test('a synthetic profile cannot approve the seven implemented families remaining source and scope gaps', async () => {
  const f = fixture(); const draft = await f.persist(families.map(([source, type], i) => f.add(`family_${i}`, source, type)));
  const requirements = syntheticRequirements();
  const result = await f.evaluate(requirements);
  assert.equal(result.coverage_status, 'PARTIAL');
  assert.equal(result.coverage_scope, 'EXPLICIT_REQUIREMENTS_ONLY');
  assert.equal(result.delivery_readiness, 'NOT_EVALUATED');
  assert.equal(result.blockers.length, 23);
  assert.equal(result.blockers.filter((b) => b.code === 'DECISION_REQUIRED' && b.requirement_id === 'field_compliance').length, 0);
  assert.ok(result.blockers.some((b) => b.dataset_type === 'GA4_CONTENT_PERFORMANCE' && b.requirement_id === 'users' && b.code === 'SOURCE_CHANGE_REQUIRED'));
  assert.ok(result.blockers.some((b) => b.dataset_type === 'GA4_CONTENT_PERFORMANCE' && b.requirement_id === 'average_engagement_time' && b.code === 'DECISION_REQUIRED'));
  assert.ok(result.blockers.some((b) => b.dataset_type === 'GOOGLE_SERP' && b.requirement_id === 'capture_date'));
  assert.ok(result.blockers.some((b) => b.dataset_type === 'GOOGLE_SERP' && b.requirement_id === 'query_coverage'));
  assert.ok(result.blockers.some((b) => b.code === 'SOURCE_CHANGE_REQUIRED' && b.requirement_id === 'currency_context'));
  assert.ok(result.blockers.some((b) => b.requirement_id === 'keyword_coverage'));
  assert.deepEqual(result.requirements, requirements);
  assert.deepEqual(result.selected_evidence, draft.selected_evidence);
  assert.equal((await f.store.readDraft('draft')).readiness_status, 'NOT_EVALUATED');
});

test('omitted family policy, LOW_DATA/NO_DATA, and multi-Job scope never silently pass', async () => {
  const f = fixture(); await f.persist([f.add('first'), f.add('second')]);
  assert.ok((await f.evaluate()).blockers.some((b) => b.requirement_id === 'multi_job_coverage' && b.code === 'DECISION_REQUIRED'));
  const profile = syntheticRequirements(); delete profile.datasets.SEARCH_TERMS;
  assert.ok((await f.evaluate(profile)).blockers.some((b) => b.requirement_id === 'dataset_requirements' && b.code === 'DECISION_REQUIRED'));
  for (const status of ['LOW_DATA', 'NO_DATA']) {
    const g = fixture(); const selection = g.add('ads');
    g.jobs.get(selection.job_id).validation_status = status;
    g.artifacts.get(selection.artifact_id).artifact_state = 'ACCEPTED_WITH_WARNING';
    g.validations.get('validation_ads').validation_status = status;
    await g.persist([selection]);
    assert.ok((await g.evaluate()).blockers.some((b) => b.requirement_id === 'validation_outcome_coverage' && b.code === 'DECISION_REQUIRED'));
  }
});

test('cross-Workspace evaluation and unsupported profile semantics fail closed', async () => {
  const f = fixture(); await f.persist([f.add('ads')]);
  await assert.rejects(evaluateBlogWritingPackV2Readiness({ package_id: 'draft', workspace_id: 'workspace_other',
    requirements: syntheticRequirements() }, { store: f.store }), /Workspace/i);
  const profile = syntheticRequirements(); profile.datasets.SEARCH_TERMS.fields = ['unimplemented'];
  await assert.rejects(f.evaluate(profile), /requirements/i);
  const badDates = syntheticRequirements(); badDates.gsc_requested_dates.end_date = '2026-09-30';
  await assert.rejects(f.evaluate(badDates), /28|requirements/i);
});
