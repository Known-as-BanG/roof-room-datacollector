const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { fixture, families, syntheticRequirements, BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS } = require('./blog-v2-readiness-fixture.cjs');
const filename = path.join(process.argv[2], 'main/blog-writing-packs/blog-writing-pack-v2-field-compliance.js');
const inspect = (source, body) => {
  assert.ok(fs.existsSync(filename), 'source-backed field compliance must exist');
  return require(filename).inspectBlogWritingPackV2Fields(source, body);
};
const ads = () => [{ results: [{
  searchTermView: { searchTerm: 'synthetic query', status: 'NONE' },
  campaign: { id: '101', name: 'Synthetic Search', advertisingChannelType: 'SEARCH' },
  adGroup: { id: '201', name: 'Synthetic Group' },
  segments: { date: '2026-09-16', searchTermMatchType: 'BROAD', keyword: null },
  metrics: { impressions: '10', clicks: '2', ctr: '0.2', costMicros: '1250000', conversions: '0', conversionsValue: null },
}] }];
const gsc = () => [{ rows: [{ keys: ['synthetic query', 'https://example.test/page'], clicks: 0, impressions: 10, ctr: 0, position: 2.5 }] }];
const replaceRaw = (f, selection, body) => {
  const bytes = Buffer.from(JSON.stringify(body));
  fs.writeFileSync(path.join(f.root, 'runs', selection.run_id, 'raw.json'), bytes);
  Object.assign(f.artifacts.get(selection.artifact_id), { byte_size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
};
const selected = async (source, body, status = 'VALID', end = '2026-09-28') => {
  const f = fixture(); const selection = f.add('field', ...source);
  replaceRaw(f, selection, body);
  f.jobs.get(selection.job_id).source_context.requested_date_end = end;
  f.jobs.get(selection.job_id).validation_status = status;
  f.validations.get('validation_field').validation_status = status;
  if (status !== 'VALID') f.artifacts.get(selection.artifact_id).artifact_state = 'ACCEPTED_WITH_WARNING';
  const draft = await f.persist([selection]);
  return { f, selection, draft };
};
const field = (result, name) => result.fields.find((item) => item.field === name);

test('A/B/D: canonical Ads mappings preserve date, cost units, CTR, zero and explicit null', () => {
  const result = inspect(families[0][0], ads());
  assert.equal(result.rows[0].performance_date, '2026-09-16');
  assert.equal(result.rows[0].cost, 1.25);
  assert.equal(result.rows[0].ctr, 0.2);
  assert.equal(result.rows[0].conversions, 0);
  assert.equal(result.rows[0].conversion_value, null);
  assert.equal(field(result, 'conversion_value').status, 'NULL');
  assert.equal(field(result, 'cost').status, 'OBSERVED');
  assert.equal(result.fields.length, 9);
});

test('C: an omitted Ads metric is ABSENT even when normalization supplies null, including mixed rows', async () => {
  const body = ads(); const missing = structuredClone(body[0].results[0]); delete missing.metrics.conversionsValue;
  body[0].results.push(missing);
  const inspected = inspect(families[0][0], body);
  assert.equal(field(inspected, 'conversion_value').status, 'ABSENT');
  assert.equal(field(inspected, 'conversion_value').absent_count, 1);
  assert.equal(field(inspected, 'conversion_value').null_count, 1);
  const { f } = await selected(families[0], body);
  const result = await f.evaluate();
  assert.ok(result.blockers.some((b) => b.code === 'FIELD_ABSENT' && b.requirement_id === 'conversion_value'));
  assert.equal(result.datasets[0].coverage_status, 'BLOCKED');
});

test('legacy Ads uses only supported aliases, retains missing dates and legitimate null metrics', async () => {
  const body = [{ search_term: 'synthetic', campaign: null, ad_group: 'Synthetic', impressions: null,
    clicks: 0, ctr: null, cost_micros: null, conversions: null, conversion_value: 0 }];
  const result = inspect(families[0][0], body);
  assert.equal(result.rows[0].performance_date, null);
  assert.equal(result.rows[0].cost, null);
  assert.equal(result.rows[0].conversion_value, 0);
  assert.equal(field(result, 'campaign').status, 'NULL');
  assert.equal(field(result, 'impressions').status, 'NULL');
  const { f } = await selected(families[0], body);
  assert.equal((await f.evaluate()).datasets[0].coverage_status, 'SATISFIED');
  body[0].date = '2026-09-16';
  assert.equal(inspect(families[0][0], body).rows[0].performance_date, '2026-09-16');
  delete body[0].cost_micros; body[0].cost = 4;
  assert.equal(field(inspect(families[0][0], body), 'cost').status, 'ABSENT');
});

test('E/G: GSC deterministic aliases preserve metrics and approved 28-day endpoints', async () => {
  const result = inspect(families[1][0], gsc());
  assert.deepEqual(result.rows, [{ query: 'synthetic query', page_url: 'https://example.test/page', clicks: 0, impressions: 10, ctr: 0, average_position: 2.5 }]);
  const { f } = await selected(families[1], gsc());
  const evaluated = await f.evaluate();
  assert.equal(evaluated.datasets[1].coverage_status, 'SATISFIED');
  assert.equal(evaluated.blockers.some((b) => b.code === 'WINDOW_MISMATCH'), false);
});

test('GSC distinguishes explicit null from absent metrics on every page', async () => {
  const body = gsc(); body[0].rows[0].position = null;
  assert.equal(field(inspect(families[1][0], body), 'average_position').status, 'NULL');
  body.push(gsc()[0]); delete body[1].rows[0].ctr;
  const { f } = await selected(families[1], body);
  assert.ok((await f.evaluate()).blockers.some((b) => b.code === 'FIELD_ABSENT' && b.requirement_id === 'ctr'));
});

test('F/I: GSC 30-day NO_DATA preserves window and empty field blockers', async () => {
  const { f } = await selected(families[1], [{ rows: [] }], 'NO_DATA', '2026-09-30');
  const result = await f.evaluate();
  for (const code of ['WINDOW_MISMATCH', 'FIELD_OBSERVATION_REQUIRED', 'DECISION_REQUIRED']) assert.ok(result.blockers.some((b) => b.code === code), code);
  assert.equal(result.field_checks[0].row_count, 0);
});

test('H: accepted incompatible raw shapes fail safely and cannot establish compliance', async () => {
  const { f, draft } = await selected(families[0], { sensitive: 'must-not-appear' });
  const result = await f.evaluate();
  assert.ok(result.blockers.some((b) => b.code === 'FIELD_REPRESENTATION_INVALID'));
  assert.equal(result.datasets[0].coverage_status, 'BLOCKED');
  assert.equal(JSON.stringify(result).includes('must-not-appear'), false);
  assert.deepEqual(result.selected_evidence, draft.selected_evidence);
});

test('Ads endpoints remain open even if callers clear decision lists; invalid or mismatched endpoints fail', async () => {
  const { f } = await selected(families[0], ads());
  const profile = syntheticRequirements(); delete profile.ads_requested_dates;
  assert.ok((await f.evaluate(profile)).blockers.some((b) => b.requirement_id === 'ads_requested_dates' && b.code === 'DECISION_REQUIRED'));
  profile.ads_requested_dates = { start_date: '2026-09-01', end_date: '2026-09-30' };
  assert.ok((await f.evaluate(profile)).blockers.some((b) => b.code === 'WINDOW_MISMATCH'));
  profile.ads_requested_dates.end_date = '2026-08-31';
  await assert.rejects(f.evaluate(profile), /Ads|requirements/);
});

test('J: two unimplemented families cannot claim compliance through empty requirement lists', async () => {
  const f = fixture(); await f.persist(families.map(([s, d], i) => f.add(`other_${i}`, s, d)));
  const result = await f.evaluate();
  for (const [, dataset] of families.slice(5)) assert.ok(result.blockers.some((b) => b.dataset_type === dataset && b.requirement_id === 'field_compliance' && b.code === 'DECISION_REQUIRED'));
  assert.equal(result.coverage_status, 'PARTIAL');
  assert.equal(result.delivery_readiness, 'NOT_EVALUATED');
  assert.equal(BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS.ads_requested_dates, null);
});

test('empty VALID and LOW_DATA cannot vacuously satisfy required fields; unknown source is unsupported', async () => {
  for (const status of ['VALID', 'LOW_DATA']) {
    const { f } = await selected(families[0], [], status);
    assert.ok((await f.evaluate()).blockers.some((b) => b.code === 'FIELD_OBSERVATION_REQUIRED'));
    assert.equal((await f.evaluate()).datasets[0].coverage_status, 'BLOCKED');
  }
  const result = inspect('google-analytics-4', []);
  assert.equal(result.status, 'UNSUPPORTED');
});

test('canonical Ads passes evaluation without persisting field results or exposing row values', async () => {
  const { f, draft } = await selected(families[0], ads());
  const draftPath = path.join(f.root, 'packages', 'draft', 'BLOG_DRAFT.json');
  const before = fs.readFileSync(draftPath);
  const result = await f.evaluate();
  assert.equal(result.datasets[0].coverage_status, 'SATISFIED');
  assert.equal(result.field_checks[0].row_count, 1);
  assert.equal(JSON.stringify(result).includes('synthetic query'), false);
  assert.deepEqual(result.selected_evidence, draft.selected_evidence);
  assert.deepEqual(fs.readFileSync(draftPath), before);
});

test('a null search-term identity cannot be proved by the legacy empty-string fallback', async () => {
  const { f } = await selected(families[0], [{ search_term: null, campaign: 'Synthetic', ad_group: 'Synthetic',
    impressions: 1, clicks: 0, ctr: 0, cost_micros: 0, conversions: null, conversion_value: null }]);
  assert.ok((await f.evaluate()).blockers.some((b) => b.code === 'FIELD_REPRESENTATION_INVALID'));
});

test('supported legacy/GSC empty-string null normalization remains unchanged', () => {
  const legacy = [{ search_term: 'synthetic', campaign: 'Synthetic', ad_group: 'Synthetic',
    impressions: '', clicks: 0, ctr: 0, cost_micros: '', conversions: null, conversion_value: null }];
  const adsResult = inspect(families[0][0], legacy);
  assert.equal(adsResult.rows[0].impressions, null);
  assert.equal(adsResult.rows[0].cost, null);
  assert.equal(field(adsResult, 'impressions').status, 'NULL');
  const body = gsc(); body[0].rows[0].position = '';
  const gscResult = inspect(families[1][0], body);
  assert.equal(gscResult.rows[0].average_position, null);
  assert.equal(field(gscResult, 'average_position').status, 'NULL');
});
