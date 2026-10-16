const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { fixture, syntheticRequirements } = require('./blog-v2-readiness-fixture.cjs');
const { inspectBlogWritingPackV2Fields: inspect } = require(path.join(process.argv[2], 'main/blog-writing-packs/blog-writing-pack-v2-field-compliance.js'));
const API = 'google-keyword-planner'; const CSV = 'google-keyword-planner-csv';
const scope = () => ({ requested_date_start: '2025-08-01', requested_date_end: '2026-07-31', country_code: 'TR', language_code: 'tr', keyword_plan_network: 'GOOGLE_SEARCH' });
const context = () => ({ source_id: API, task_id: 'keyword-planner-historical-metrics', source_mode: 'OFFICIAL_API', group_id: 'synthetic', group_name: 'Synthetic', keywords: ['requested synthetic'], ...scope() });
const raw = () => ({ results: [{ text: 'observed synthetic', closeVariants: ['requested synthetic'], keywordMetrics: {
  avgMonthlySearches: '0', competition: 'MEDIUM', competitionIndex: '77', lowTopOfPageBidMicros: '1250000', highTopOfPageBidMicros: null,
  monthlySearchVolumes: [{ year: 2026, month: 'JULY', monthlySearches: null }],
} }] });
const bytes = (body) => Buffer.from(JSON.stringify(body));
const inspectApi = (body = raw(), ctx = context()) => inspect(API, bytes(body), ctx);
const field = (result, name) => result.fields.find((f) => f.field === name);
const unapproved = () => { const value = syntheticRequirements(); delete value.keyword_planner_scope; return value; };
const profile = () => ({ ...syntheticRequirements(), keyword_planner_scope: scope() });
const selection = (f, suffix, body = raw(), ctx = context(), status = 'VALID', source = API) => {
  const selected = f.add(suffix, source, 'KEYWORD_HISTORICAL_METRICS');
  const data = source === CSV ? body : bytes(body);
  fs.writeFileSync(path.join(f.root, 'runs', selected.run_id, 'raw.json'), data);
  Object.assign(f.artifacts.get(selected.artifact_id), { byte_size: data.length, sha256: createHash('sha256').update(data).digest('hex'), artifact_state: status === 'VALID' ? 'ACCEPTED' : 'ACCEPTED_WITH_WARNING' });
  Object.assign(f.jobs.get(selected.job_id), { source_context: ctx, validation_status: status });
  f.validations.get(`validation_${suffix}`).validation_status = status;
  return selected;
};
const evaluate = async (body = raw(), ctx = context(), requirements = profile(), status = 'VALID') => {
  const f = fixture(); const selected = selection(f, 'kwp', body, ctx, status);
  const draft = await f.persist([selected]); return { f, draft, result: await f.evaluate(requirements) };
};
const manual = () => {
  const headers = ['Keyword', 'Currency', 'Segmentation', 'Avg. monthly searches', 'Three month change', 'YoY change', 'Competition', 'Competition (indexed value)', 'Top of page bid (low range)', 'Top of page bid (high range)', 'Ad impression share', 'Organic average position', 'Organic impression share', 'In Account', ...['Aug 2025','Sep 2025','Oct 2025','Nov 2025','Dec 2025','Jan 2026','Feb 2026','Mar 2026','Apr 2026','May 2026','Jun 2026','Jul 2026'].map((v) => `Searches: ${v}`)];
  const row = (values) => Array.from({ length: headers.length }, (_, i) => values[i] ?? '').join('\t');
  const text = ['Keyword Stats synthetic', '1 August 2025 - 31 July 2026', headers.join('\t'), row({ 2: 'All', 3: '0' }), row({ 0: 'manual observed', 1: 'TRY', 3: '0', 6: 'Orta', 7: '77', 8: '0', 9: '1,25' })].join('\r\n');
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
};

test('valid provider mappings retain requested/observed identity, category, micros, zero, null and native history', () => {
  const result = inspectApi();
  assert.equal(result.status, 'SUPPORTED');
  assert.equal(result.rows[0].keyword, 'observed synthetic');
  assert.equal(result.rows[0].requested_keyword, 'requested synthetic');
  assert.equal(result.rows[0].returned_keyword, 'observed synthetic');
  assert.equal(result.rows[0].average_monthly_searches, 0);
  assert.equal(result.rows[0].competition, 'MEDIUM');
  assert.equal(result.rows[0].competition_index, 77);
  assert.equal(result.rows[0].top_of_page_bid_low, 1.25);
  assert.equal(result.rows[0].top_of_page_bid_high, null);
  assert.deepEqual(result.rows[0].monthly_history, [{ year: 2026, month: 7, searches: null }]);
  assert.equal(field(result, 'top_of_page_bid_high').status, 'NULL');
  assert.equal(result.fields.length, 5);
});

test('API fields pass inspection but missing observed currency remains an explicit source gap', async () => {
  const { result } = await evaluate();
  assert.equal(result.field_checks[0].row_count, 1);
  assert.ok(result.field_checks[0].fields.every((f) => ['OBSERVED', 'NULL'].includes(f.status)));
  assert.ok(result.blockers.some((b) => b.code === 'SOURCE_CHANGE_REQUIRED' && b.requirement_id === 'currency_context'));
  assert.equal(result.blockers.some((b) => b.requirement_id === 'field_compliance' && b.dataset_type === 'KEYWORD_HISTORICAL_METRICS'), false);
  assert.equal(result.delivery_readiness, 'NOT_EVALUATED');
});

test('missing/null/blank observed text never falls back to requested text', async () => {
  for (const value of [undefined, null, '']) {
    const body = raw(); body.results[0].text = value;
    const { result } = await evaluate(body);
    assert.ok(result.blockers.some((b) => b.requirement_id === 'observed_keyword'));
    assert.equal(result.datasets[2].coverage_status, 'BLOCKED');
  }
});

test('unsupported or ambiguous identity links are invalid; no fuzzy close-variant inference', async () => {
  const body = raw(); delete body.results[0].closeVariants;
  const { result } = await evaluate(body);
  assert.ok(result.blockers.some((b) => b.code === 'FIELD_REPRESENTATION_INVALID'));
});

test('missing average searches and bids stay ABSENT even when normalizer emits null', async () => {
  for (const [source, downstream] of [['avgMonthlySearches','average_monthly_searches'], ['lowTopOfPageBidMicros','top_of_page_bid_low'], ['highTopOfPageBidMicros','top_of_page_bid_high'], ['competition','competition']]) {
    const body = raw(); delete body.results[0].keywordMetrics[source];
    assert.equal(field(inspectApi(body), downstream).status, 'ABSENT');
    const { result } = await evaluate(body);
    assert.ok(result.blockers.some((b) => b.code === 'FIELD_ABSENT' && b.requirement_id === downstream));
  }
});

test('competition index never substitutes for category and unknown provider categories need a decision', async () => {
  const body = raw(); body.results[0].keywordMetrics.competition = 'UNKNOWN';
  const { result } = await evaluate(body);
  assert.ok(result.blockers.some((b) => b.code === 'DECISION_REQUIRED' && b.requirement_id === 'competition_semantics'));
  body.results[0].keywordMetrics.competition = null;
  assert.equal(field(inspectApi(body), 'competition').status, 'NULL');
  body.results[0].keywordMetrics.lowTopOfPageBidMicros = '0';
  assert.equal(inspectApi(body).rows[0].top_of_page_bid_low, 0);
});

test('multiple Jobs retain independent provenance and duplicate provider rows without inventing keyword coverage', async () => {
  const f = fixture(); const first = selection(f, 'first'); const second = selection(f, 'second');
  const draft = await f.persist([first, second]);
  const filename = path.join(f.root, 'packages', 'draft', 'BLOG_DRAFT.json'); const before = fs.readFileSync(filename);
  const result = await f.evaluate(profile());
  assert.deepEqual(result.selected_evidence, draft.selected_evidence);
  assert.deepEqual(result.field_checks.map((v) => [v.run_id,v.job_id,v.artifact_id,v.row_count]), [[first.run_id,first.job_id,first.artifact_id,1],[second.run_id,second.job_id,second.artifact_id,1]]);
  assert.ok(result.blockers.some((b) => b.requirement_id === 'multi_job_coverage'));
  assert.deepEqual(fs.readFileSync(filename), before);
  const body = raw(); body.results.push(structuredClone(body.results[0]));
  assert.equal(inspectApi(body).rows.length, 2);
});

test('NO_DATA, LOW_DATA and empty VALID cannot bypass field or historical approval checks', async () => {
  for (const status of ['NO_DATA','LOW_DATA','VALID']) {
    const { result } = await evaluate({ results: [] }, context(), unapproved(), status);
    assert.ok(result.blockers.some((b) => b.code === 'FIELD_OBSERVATION_REQUIRED'));
    assert.ok(result.blockers.some((b) => b.requirement_id === 'keyword_planner_scope'));
    if (status !== 'VALID') assert.ok(result.blockers.some((b) => b.requirement_id === 'validation_outcome_coverage'));
  }
});

test('unapproved historical scope never inherits 12 months; explicit arbitrary Blog dates compare exactly', async () => {
  const { result } = await evaluate(raw(), context(), unapproved());
  assert.ok(result.blockers.some((b) => b.code === 'DECISION_REQUIRED' && b.requirement_id === 'keyword_planner_scope'));
  const requirements = profile(); requirements.keyword_planner_scope.requested_date_start = '2026-07-01';
  const mismatch = await evaluate(raw(), context(), requirements);
  assert.ok(mismatch.result.blockers.some((b) => b.code === 'WINDOW_MISMATCH' && b.requirement_id === 'keyword_planner_scope'));
});

test('missing/incompatible request context and malformed provider representations fail safely', async () => {
  for (const ctx of [{}, { ...context(), source_mode: 'UNSUPPORTED' }, { ...context(), language_code: 'en' }]) {
    const { result } = await evaluate(raw(), ctx);
    assert.ok(result.blockers.some((b) => b.code === 'EVIDENCE_INVALID' && b.requirement_id === 'keyword_planner_request_context'));
  }
  const { result } = await evaluate({ secret: 'must-not-appear' });
  assert.ok(result.blockers.some((b) => b.code === 'FIELD_REPRESENTATION_INVALID'));
  assert.equal(JSON.stringify(result).includes('must-not-appear'), false);
});

test('manual CSV keeps provider keyword, localized category, currency-unit bids and blank cells', async () => {
  const ctx = { source_id: CSV, task_id: 'keyword-planner-manual-csv-import', source_mode: 'FILE_IMPORT' };
  const result = inspect(CSV, manual(), ctx);
  assert.equal(result.status, 'SUPPORTED');
  assert.equal(result.rows[0].keyword, 'manual observed');
  assert.equal(result.rows[0].currency, 'TRY');
  assert.equal(result.rows[0].competition, 'Orta');
  assert.equal(result.rows[0].competition_index, 77);
  assert.equal(result.rows[0].top_of_page_bid_low, 0);
  assert.equal(result.rows[0].top_of_page_bid_high, 1.25);
  assert.ok(result.rows[0].monthly_history.every((v) => v.searches === null));
  const f = fixture(); await f.persist([selection(f, 'csv', manual(), ctx, 'VALID', CSV)]);
  const evaluated = await f.evaluate(profile());
  assert.ok(evaluated.blockers.some((b) => b.requirement_id === 'manual_csv_scope' && b.code === 'DECISION_REQUIRED'));
  assert.equal(evaluated.blockers.some((b) => b.requirement_id === 'currency_context'), false);
  assert.equal(evaluated.selected_evidence[0].source_id, CSV);
});

test('invalid explicit scope profile is rejected, not silently ignored', async () => {
  const f = fixture(); await f.persist([selection(f, 'kwp')]);
  const requirements = profile(); requirements.keyword_planner_scope.requested_date_start = '2026-02-30';
  await assert.rejects(f.evaluate(requirements), /requirements|scope/i);
});

test('one Job never implies every Blog keyword is covered, even with a valid request and observed result', async () => {
  const { result } = await evaluate();
  assert.ok(result.blockers.some((b) => b.code === 'DECISION_REQUIRED' && b.requirement_id === 'keyword_coverage'));
});

test('manual import missing context is an evidence-context blocker, not proof from the CSV label', async () => {
  const f = fixture(); await f.persist([selection(f, 'missingcsv', manual(), {}, 'VALID', CSV)]);
  const result = await f.evaluate(profile());
  assert.ok(result.blockers.some((b) => b.code === 'EVIDENCE_INVALID' && b.requirement_id === 'keyword_planner_request_context'));
});
