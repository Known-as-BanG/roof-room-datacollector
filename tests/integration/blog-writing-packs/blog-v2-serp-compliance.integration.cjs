const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS } = require('./blog-v2-readiness-fixture.cjs');
const { context, response } = require('./blog-v2-serp-fixture.cjs');
const { inspectBlogWritingPackV2Fields: inspect } = require(path.join(process.argv[2], 'main/blog-writing-packs/blog-writing-pack-v2-field-compliance.js'));
const acquiredAt = '2026-10-01T10:00:00.000Z';
const inspectSerp = (body = response(), ctx = context()) => inspect('serpapi', Buffer.from(JSON.stringify(body)), ctx, acquiredAt);
const field = (result, name) => result.fields.find((item) => item.field === name);
const has = (result, code, requirement_id) => result.blockers.some((b) => b.dataset_type === 'GOOGLE_SERP' && b.code === code && b.requirement_id === requirement_id);
const add = (f, suffix, body = response(), ctx = context(suffix), status = 'VALID') => {
  const selection = f.add(suffix, 'serpapi', 'GOOGLE_SERP');
  const bytes = Buffer.from(JSON.stringify(body));
  fs.writeFileSync(path.join(f.root, 'runs', selection.run_id, 'raw.json'), bytes);
  Object.assign(f.artifacts.get(selection.artifact_id), { byte_size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), artifact_state: status === 'VALID' ? 'ACCEPTED' : 'ACCEPTED_WITH_WARNING' });
  Object.assign(f.jobs.get(selection.job_id), { source_context: ctx, validation_status: status });
  f.validations.get(`validation_${suffix}`).validation_status = status;
  return selection;
};
const evaluate = async (body = response(), ctx = context('serp'), status = 'VALID') => {
  const f = fixture(); const selected = add(f, 'serp', body, ctx, status); const draft = await f.persist([selected]);
  return { f, selected, draft, result: await f.evaluate() };
};

test('A: accepted fields retain explicit origins while legacy acquisition remains unavailable', async () => {
  const inspected = inspectSerp();
  assert.equal(inspected.status, 'SUPPORTED');
  assert.deepEqual(inspected.rows.map((r) => [r.query,r.position,r.url,r.title,r.domain]), [
    ['synthetic query',3,'https://EXAMPLE.test/synthetic','Synthetic observed title','example.test'],
  ]);
  for (const name of ['query','position','url','title','domain']) assert.equal(field(inspected,name).status, 'OBSERVED');
  assert.equal(field(inspected,'capture_date').status, 'UNRESOLVED');
  const { result } = await evaluate();
  assert.equal(result.field_checks[0].row_count,1);
  assert.equal(result.field_checks[0].fields.length,6);
  assert.deepEqual(result.field_checks[0].serp_provenance, {
    query: 'REQUEST_DIMENSION_VERIFIED_BY_PROVIDER', capture_date: 'ACQUISITION_UNAVAILABLE',
    position: 'PROVIDER_ORGANIC_POSITION_ONLY', domain: 'DERIVED_FROM_OBSERVED_URL',
  });
  assert.equal(has(result,'DECISION_REQUIRED','field_compliance'),false);
  assert.equal(result.delivery_readiness,'NOT_EVALUATED');
});

test('B: missing or mismatched provider q cannot be replaced with requested query', async () => {
  for (const q of [undefined,null,'different synthetic query']) {
    const body=response(); body.search_parameters.q=q;
    const { result }=await evaluate(body);
    assert.ok(has(result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
    assert.equal(result.field_checks.length,0);
  }
  assert.equal(inspectSerp().serp_provenance.query,'REQUEST_DIMENSION_VERIFIED_BY_PROVIDER');
});

test('C/D: provider generation metadata, requested date and artifact lifecycle time never become capture_date', async () => {
  const body=response(); const before=JSON.stringify(body);
  const inspected=inspectSerp(body);
  assert.equal(Object.hasOwn(inspected.rows[0],'capture_date'),false);
  assert.equal(field(inspected,'capture_date').observed_count,0);
  assert.equal(JSON.stringify(body),before);
  const { result,draft }=await evaluate(body);
  assert.ok(has(result,'FIELD_OBSERVATION_REQUIRED','serp_acquisition'));
  assert.equal(result.selected_evidence[0].acquired_at,acquiredAt);
  assert.equal(result.selected_evidence[0].requested_context.snapshot_date,'2026-09-28');
  assert.equal(result.selected_evidence[0].observed_context,null);
  assert.deepEqual(result.selected_evidence,draft.selected_evidence);
  delete body.search_metadata.created_at; delete body.search_metadata.processed_at;
  assert.equal(field(inspectSerp(body),'capture_date').status,'UNRESOLVED');
});

test('E: organic position stays provider-supplied, not row order or absolute rank, including rejection of zero', async () => {
  const body=response(); body.organic_results.push({ position:7,title:'Second synthetic',link:'https://example.test/second' });
  assert.deepEqual(inspectSerp(body).rows.map((r)=>r.position),[3,7]);
  for (const position of [0,null,undefined,'1']) {
    const bad=response(); bad.organic_results[0].position=position;
    assert.ok(has((await evaluate(bad)).result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
  }
});

test('F: paid/feature data never enters organic ranks; PAA rows retain their own null position/title', async () => {
  const body=response(); body.ads=[{position:1,title:'Synthetic ad',link:'https://example.test/ad'}];
  body.answer_box={title:'Synthetic feature',position:0};
  body.related_questions=[{question:'Synthetic question?',link:'https://example.test/paa',title:'Not a normalized PAA title',position:1}];
  const inspected=inspectSerp(body);
  assert.deepEqual(inspected.rows.map((r)=>[r.result_type,r.position,r.title]),[['ORGANIC',3,'Synthetic observed title'],['PAA',null,null]]);
  assert.equal(field(inspected,'position').absent_count,1);
  assert.equal(field(inspected,'title').absent_count,1);
  const { result } = await evaluate(body);
  assert.equal(has(result,'DECISION_REQUIRED','position_semantics'),false);
  assert.ok(has(result,'FIELD_ABSENT','position'));
  assert.ok(has(result,'FIELD_ABSENT','title'));
});

test('G/M: absent, null, blank and observed URL/title remain distinct and required missing observations block', async () => {
  for (const [provider,downstream] of [['link','url'],['title','title']]) {
    const absent=response(); delete absent.organic_results[0][provider];
    assert.equal(field(inspectSerp(absent),downstream).status,'ABSENT');
    assert.ok(has((await evaluate(absent)).result,'FIELD_ABSENT',downstream));
    for (const value of [null,'','   ']) {
      const body=response(); body.organic_results[0][provider]=value;
      if(provider==='link' && value==='   ') {
        assert.ok(has((await evaluate(body)).result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
      } else {
        const inspected=inspectSerp(body);
        assert.equal(inspected.rows[0][downstream],value===''?null:value);
        assert.ok(has((await evaluate(body)).result,'FIELD_OBSERVATION_REQUIRED',downstream));
      }
    }
  }
});

test('H/I: domain uses only existing observed-link hostname mapping; missing/invalid URLs never supply it', async () => {
  assert.equal(inspectSerp().rows[0].domain,'example.test');
  assert.equal(inspectSerp().serp_provenance.domain,'DERIVED_FROM_OBSERVED_URL');
  const body=response(); body.organic_results[0].link=null;
  assert.equal(inspectSerp(body).rows[0].domain,null);
  assert.ok(has((await evaluate(body)).result,'FIELD_OBSERVATION_REQUIRED','domain'));
  delete body.organic_results[0].link;
  assert.equal(field(inspectSerp(body),'domain').status,'ABSENT');
  for(const link of ['invalid-synthetic-url','javascript:synthetic']) {
    body.organic_results[0].link=link;
    assert.ok(has((await evaluate(body)).result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
  }
});

test('J: clearing decisions cannot bypass remaining scope decisions or missing acquisition evidence', async () => {
  const { result }=await evaluate();
  assert.ok(has(result,'DECISION_REQUIRED','query_coverage'));
  for(const id of ['position_semantics','search_context']) assert.equal(has(result,'DECISION_REQUIRED',id),false,id);
  assert.ok(has(result,'FIELD_OBSERVATION_REQUIRED','serp_acquisition'));
  assert.equal(result.datasets[5].coverage_status,'BLOCKED');
  assert.equal(result.coverage_scope,'EXPLICIT_REQUIREMENTS_ONLY');
});

test('K: independent Jobs retain overlapping rows, full provenance, raw bytes and immutable membership', async () => {
  const f=fixture(); const body=response(); body.organic_results.push(structuredClone(body.organic_results[0]));
  const first=add(f,'one',body); const second=add(f,'two',response('second synthetic query'),context('two','second synthetic query'));
  const draft=await f.persist([first,second]);
  const filename=path.join(f.root,'packages','draft','BLOG_DRAFT.json');const before=fs.readFileSync(filename);
  const rawFile=path.join(f.root,'runs',first.run_id,'raw.json');const rawBefore=fs.readFileSync(rawFile);
  add(f,'newer'); const result=await f.evaluate();
  assert.deepEqual(result.selected_evidence,draft.selected_evidence);
  assert.deepEqual(result.field_checks.map((c)=>[c.run_id,c.job_id,c.artifact_id,c.row_count]),[[first.run_id,first.job_id,first.artifact_id,2],[second.run_id,second.job_id,second.artifact_id,1]]);
  assert.ok(has(result,'DECISION_REQUIRED','multi_job_coverage'));
  assert.deepEqual(fs.readFileSync(filename),before);assert.deepEqual(fs.readFileSync(rawFile),rawBefore);
  assert.equal(result.delivery_readiness,'NOT_EVALUATED');
});

test('L: empty VALID, NO_DATA, LOW_DATA and PAA-only outcomes cannot establish mandatory fields or coverage', async () => {
  for(const status of ['VALID','NO_DATA','LOW_DATA']) {
    const body=response();body.organic_results=[];
    const { result }=await evaluate(body,context('serp'),status);
    assert.equal(result.field_checks[0].row_count,0);
    assert.ok(has(result,'FIELD_OBSERVATION_REQUIRED','url'));
    if(status!=='VALID') assert.ok(has(result,'DECISION_REQUIRED','validation_outcome_coverage'));
    assert.equal(result.coverage_status,status==='VALID'?'PARTIAL':'NOT_READY');
  }
  const body=response();body.organic_results=[];body.related_questions=[{question:'Synthetic question?'}];
  const { result }=await evaluate(body,context('serp'),'NO_DATA');
  assert.equal(result.field_checks[0].row_count,1);
  assert.ok(has(result,'FIELD_ABSENT','position'));
  assert.ok(has(result,'FIELD_OBSERVATION_REQUIRED','url')||has(result,'FIELD_ABSENT','url'));
});

test('request scope and observed search context must match the existing supported contract', async () => {
  for(const ctx of [{},{...context('serp'),country_code:'US'},{...context('serp'),organic_limit:20}]) {
    assert.ok(has((await evaluate(response(),ctx)).result,'EVIDENCE_INVALID','serp_request_context'));
  }
  for(const [key,value] of [['gl','us'],['hl','en'],['device','mobile'],['engine','bing'],['start',10]]) {
    const body=response();body.search_parameters[key]=value;
    assert.ok(has((await evaluate(body)).result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
  }
});

test('provider errors and malformed shapes fail without leaking raw markers or adding field proof', async () => {
  for(const body of [{error:'synthetic-sensitive-marker'}, {...response(),organic_results:{}}, {...response(),search_metadata:{status:'Error'}}]) {
    const { result }=await evaluate(body);
    assert.ok(has(result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
    assert.equal(result.field_checks.length,0);
    assert.equal(JSON.stringify(result).includes('synthetic-sensitive-marker'),false);
  }
});

test('accepted artifact integrity and frozen context changes remain explicit blockers', async () => {
  const { f,selected }=await evaluate();
  fs.appendFileSync(path.join(f.root,'runs',selected.run_id,'raw.json'),' ');
  assert.ok(has(await f.evaluate(),'ARTIFACT_INTEGRITY_FAILED','artifact_integrity'));
  const g=await evaluate();g.f.jobs.get(g.selected.job_id).source_context.query='changed synthetic query';
  assert.ok(has(await g.f.evaluate(),'MEMBERSHIP_CHANGED','frozen_provenance'));
});

test('N: current profile still blocks real SERP readiness and never approves full delivery', async () => {
  const { f }=await evaluate();const result=await f.evaluate(BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS);
  assert.ok(has(result,'FIELD_OBSERVATION_REQUIRED','serp_acquisition'));
  assert.equal(result.coverage_status,'PARTIAL');assert.equal(result.delivery_readiness,'NOT_EVALUATED');
});

// Legacy safeguards are separate from the receipt-backed draft policy below;
// no test here establishes package-time publication enforcement.
test('artifact times at age boundaries never substitute for missing response-acquisition evidence', async () => {
  const reference = '2026-10-15T00:00:00.000Z';
  for (const artifactTime of [
    '2026-10-09T00:00:00.000Z', // six days
    '2026-10-08T00:00:00.000Z', // exactly seven days
    '2026-10-07T23:59:59.000Z', // seven days plus one second
    '2026-10-15T00:00:01.000Z', // future
    '2026-10-08T00:00:00.001Z', // UTC midnight crossing
  ]) {
    const f = fixture();
    const selected = add(f, 'artifact-time');
    f.artifacts.get(selected.artifact_id).created_at = artifactTime;
    const draft = await f.persist([selected], reference);
    assert.equal(draft.readiness_status, 'NOT_EVALUATED');
    assert.equal(draft.selected_evidence[0].acquired_at, artifactTime);
    const result = await f.evaluate();
    assert.ok(has(result, 'FIELD_OBSERVATION_REQUIRED', 'serp_acquisition'), artifactTime);
    assert.equal(result.field_checks[0].serp_freshness.status, 'ACQUISITION_MISSING');
    assert.equal(field(result.field_checks[0], 'capture_date').observed_count, 0);
    assert.equal(result.datasets[5].coverage_status, 'BLOCKED');
    assert.equal(result.delivery_readiness, 'NOT_EVALUATED');
  }
});

test('missing, invalid, future and timezone-bearing provider timestamps never create a RoofRoom acquisition observation', () => {
  for (const timestamp of [undefined, null, 'invalid', '2026-02-30T00:00:00Z',
    '2026-10-01', '2027-01-01T00:00:00Z', '2026-10-01T00:30:00+03:00',
    '2026-09-30T21:30:00Z']) {
    const body = response();
    body.search_metadata.created_at = timestamp;
    body.search_metadata.processed_at = timestamp;
    const bytesBefore = JSON.stringify(body);
    const inspected = inspectSerp(body);
    assert.equal(field(inspected, 'capture_date').status, 'UNRESOLVED');
    assert.equal(Object.hasOwn(inspected.rows[0], 'capture_date'), false);
    assert.equal(JSON.stringify(body), bytesBefore);
  }
});

test('reevaluation at controlled later times retains the exact draft and cannot establish package-time freshness', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-07T10:00:00.000Z') });
  const f = fixture();
  const selected = add(f, 'frozen');
  const draft = await f.persist([selected], new Date().toISOString());
  const draftFile = path.join(f.root, 'packages', 'draft', 'BLOG_DRAFT.json');
  const rawFile = path.join(f.root, 'runs', selected.run_id, 'raw.json');
  const draftBefore = fs.readFileSync(draftFile);
  const rawBefore = fs.readFileSync(rawFile);
  const first = await f.evaluate();
  for (const now of ['2026-10-08T10:00:00.000Z', '2026-10-08T10:00:01.000Z',
    '2026-10-09T00:30:00+03:00']) {
    t.mock.timers.setTime(Date.parse(now));
    const later = await f.evaluate();
    assert.deepEqual(later, first, 'Default reevaluation retains the immutable draft reference instead of the host clock.');
    assert.deepEqual(later.selected_evidence, draft.selected_evidence);
  }
  const newer = add(f, 'newer-unselected');
  f.artifacts.get(newer.artifact_id).created_at = new Date().toISOString();
  const afterNewRun = await f.evaluate();
  assert.deepEqual(afterNewRun.selected_evidence, draft.selected_evidence);
  assert.deepEqual(fs.readFileSync(draftFile), draftBefore);
  assert.deepEqual(fs.readFileSync(rawFile), rawBefore);
  assert.deepEqual(fs.readdirSync(path.dirname(draftFile)), ['BLOG_DRAFT.json']);
  await assert.rejects(f.store.readManifest('draft'), /BLOG_PACKAGE|invalid/i);
  assert.equal(afterNewRun.delivery_readiness, 'NOT_EVALUATED');
});

const writeAcquisition = (f, selection, changes = {}) => {
  const artifact = f.artifacts.get(selection.artifact_id);
  const job = f.jobs.get(selection.job_id);
  const filename = path.join(f.root, 'runs', selection.run_id, 'serpapi', 'metadata', `${job.job_key}.metadata.json`);
  const document = {
    schema_version: 2, run_id: selection.run_id, job_id: selection.job_id,
    attempt_id: `attempt_${job.job_key}`, attempt_number: artifact.attempt_number,
    source_id: 'serpapi', source_mode: 'THIRD_PARTY_API', job_key: job.job_key,
    raw_artifact_id: selection.artifact_id, raw_relative_path: artifact.relative_path,
    source_context: job.source_context,
    acquisition_metadata: { response_received_at: '2026-10-01T09:59:59.123Z',
      response_received_at_origin: 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT' },
    ...changes,
  };
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(document));
  return filename;
};

test('collector receipt provenance survives accepted loading and immutable draft snapshots independently of lifecycle time', async () => {
  const f = fixture(); const selection = add(f, 'receipt');
  const metadataFile = writeAcquisition(f, selection);
  const loaded = await f.loader.readAcceptedJobArtifact(selection.run_id, selection.job_id);
  const expected = {
    response_received_at: '2026-10-01T09:59:59.123Z',
    response_received_at_origin: 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT',
    attempt_id: 'attempt_receipt', metadata_relative_path: 'serpapi/metadata/receipt.metadata.json',
    metadata_sha256: createHash('sha256').update(fs.readFileSync(metadataFile)).digest('hex'),
    metadata_byte_size: fs.statSync(metadataFile).size,
  };
  assert.deepEqual(loaded.serp_acquisition, expected);
  const draft = await f.persist([selection]);
  assert.deepEqual(draft.selected_evidence[0].serp_acquisition, expected);
  assert.equal(draft.selected_evidence[0].acquired_at, acquiredAt);
  assert.deepEqual((await f.store.readDraft('draft')), draft);
  assert.deepEqual((await f.evaluate()).selected_evidence, draft.selected_evidence);
  for (const change of [
    { response_received_at: '2026-10-01' }, { response_received_at_origin: 'PROVIDER' },
    { attempt_id: 'other' }, { metadata_relative_path: '../metadata.json' },
    { metadata_sha256: 'invalid' }, { metadata_byte_size: -1 },
  ]) {
    const invalid = structuredClone(draft);
    invalid.package_id = 'invalid-receipt';
    Object.assign(invalid.selected_evidence[0].serp_acquisition, change);
    await assert.rejects(f.store.saveDraft(invalid), /SERP|acquisition/i);
  }
  fs.appendFileSync(metadataFile, ' ');
  assert.ok(has(await f.evaluate(), 'MEMBERSHIP_CHANGED', 'frozen_provenance'));
  assert.deepEqual((await f.store.readDraft('draft')), draft);
});

test('metadata changes between provenance verification and field loading block without modifying membership', async () => {
  const f = fixture(); const selection = add(f, 'receipt-race');
  const metadataFile = writeAcquisition(f, selection);
  const draft = await f.persist([selection]);
  const originalRead = f.loader.readAcceptedJobArtifact.bind(f.loader);
  let reads = 0;
  f.loader.readAcceptedJobArtifact = async (...args) => {
    if (++reads === 2) fs.appendFileSync(metadataFile, ' ');
    return originalRead(...args);
  };
  const result = await f.evaluate();
  assert.ok(has(result, 'MEMBERSHIP_CHANGED', 'frozen_provenance'));
  assert.equal(result.field_checks.length, 0);
  assert.deepEqual(result.selected_evidence, draft.selected_evidence);
  assert.deepEqual(await f.store.readDraft('draft'), draft);
});

test('legacy missing acquisition metadata stays readable and unknown without lifecycle or provider fallback', async () => {
  const f = fixture(); const selection = add(f, 'legacy');
  assert.equal((await f.loader.readAcceptedJobArtifact(selection.run_id, selection.job_id)).serp_acquisition, undefined);
  const filename = writeAcquisition(f, selection, { acquisition_metadata: undefined, retrieved_at: acquiredAt });
  const before = fs.readFileSync(filename);
  const draft = await f.persist([selection]);
  assert.equal(Object.hasOwn(draft.selected_evidence[0], 'serp_acquisition'), false);
  assert.equal((await f.loader.verifyAcceptedJobArtifact(selection.run_id, selection.job_id)).serp_acquisition, undefined);
  assert.deepEqual((await f.store.readDraft('draft')), draft);
  assert.ok(has(await f.evaluate(), 'FIELD_OBSERVATION_REQUIRED', 'serp_acquisition'));
  assert.deepEqual(fs.readFileSync(filename), before);
});

test('incomplete, non-UTC or inconsistent collector metadata cannot be repaired or rebound to another evidence identity', async () => {
  for (const changes of [
    { run_id: 'another' }, { job_id: 'another' }, { attempt_number: 2 },
    { raw_artifact_id: 'another' }, { raw_relative_path: 'another.json' },
    { source_id: 'another' }, { source_context: {} }, { attempt_id: 'another' },
    ...[null, {}, { response_received_at: acquiredAt },
      { response_received_at: '2026-10-01', response_received_at_origin: 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT' },
      { response_received_at: '2026-02-30T00:00:00.000Z', response_received_at_origin: 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT' },
      { response_received_at: '2026-10-01T12:00:00+03:00', response_received_at_origin: 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT' },
      { response_received_at: acquiredAt, response_received_at_origin: 'PROVIDER' }]
      .map((acquisition_metadata) => ({ acquisition_metadata })),
  ]) {
    const f = fixture(); const selection = add(f, 'invalid');
    writeAcquisition(f, selection, changes);
    await assert.rejects(f.persist([selection]), /SERP|acquisition|metadata|Attempt/i);
  }
});

const acquisitionAt = (f, selection, response_received_at) => writeAcquisition(f, selection, {
  acquisition_metadata: { response_received_at, response_received_at_origin: 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT' },
});
const freshness = (result) => result.field_checks.find((check) => check.dataset_type === 'GOOGLE_SERP')?.serp_freshness;
const receipt = '2026-10-01T23:59:59.500Z';

for (const [name, evaluated_at, status, age_ms] of [
  ['six days', '2026-10-07T23:59:59.500Z', 'FRESH', 518400000],
  ['exactly seven days', '2026-10-08T23:59:59.500Z', 'FRESH', 604800000],
  ['seven days plus one second', '2026-10-09T00:00:00.500Z', 'STALE', 604801000],
  ['future receipt', '2026-10-01T23:59:58.500Z', 'FUTURE', -1000],
  ['zero age', receipt, 'FRESH', 0],
]) {
  test(`draft-time SERP freshness: ${name}`, async () => {
    const f = fixture(); const selection = add(f, 'boundary');
    acquisitionAt(f, selection, receipt);
    const draft = await f.persist([selection], evaluated_at);
    const result = await f.evaluate();
    assert.deepEqual(freshness(result), {
      evaluated_at, reference_origin: 'DRAFT_CREATED_AT', acquisition: draft.selected_evidence[0].serp_acquisition,
      capture_date: '2026-10-01', age_ms, maximum_age_ms: 604800000, status,
    });
    assert.equal(has(result, 'EVIDENCE_INVALID', 'serp_freshness'), status !== 'FRESH');
    for (const id of ['capture_date', 'freshness']) assert.equal(has(result, 'DECISION_REQUIRED', id), false);
    assert.equal(f.jobs.get(selection.job_id).validation_status, 'VALID');
    assert.deepEqual(result.selected_evidence, draft.selected_evidence);
    assert.equal(result.delivery_readiness, 'NOT_EVALUATED');
  });
}

test('capture_date is derived across UTC midnight with zero provider-observed count and linked full acquisition provenance', async () => {
  for (const [timestamp, expected] of [['2026-12-31T23:59:59.999Z', '2026-12-31'], ['2027-01-01T00:00:00.000Z', '2027-01-01']]) {
    const f = fixture(); const selected = add(f, 'utc');
    acquisitionAt(f, selected, timestamp);
    const draft = await f.persist([selected], '2027-01-01T00:00:01.000Z');
    const acquisition = draft.selected_evidence[0].serp_acquisition;
    const body = response(); const rawBefore = JSON.stringify(body);
    const result = inspect('serpapi', Buffer.from(rawBefore), context('utc'), acquiredAt, draft.created_at,
      { acquisition, evaluated_at: draft.created_at, reference_origin: 'DRAFT_CREATED_AT' });
    assert.equal(result.rows[0].capture_date, expected);
    assert.deepEqual(field(result, 'capture_date'), {
      field: 'capture_date', status: 'DERIVED', observed_count: 0, derived_count: 1, null_count: 0, absent_count: 0,
    });
    assert.equal(result.serp_provenance.capture_date, 'DERIVED_FROM_COLLECTOR_RESPONSE_RECEIPT');
    assert.deepEqual(result.serp_freshness.acquisition, acquisition);
    assert.equal(result.serp_freshness.capture_date, expected);
    assert.equal(JSON.stringify(body), rawBefore);
  }
});

test('explicit draft reevaluation becomes stale without cached pass, membership changes or automatic Run substitution', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2028-01-01T00:00:00.000Z') });
  const f = fixture(); const selection = add(f, 'recheck');
  const metadataFile = acquisitionAt(f, selection, receipt);
  const draft = await f.persist([selection], '2026-10-07T23:59:59.500Z');
  const files = [metadataFile, path.join(f.root, 'runs', selection.run_id, 'raw.json'),
    path.join(f.root, 'packages', 'draft', 'BLOG_DRAFT.json')];
  const bytesBefore = files.map((file) => fs.readFileSync(file));
  const first = await f.evaluate();
  assert.equal(freshness(first).status, 'FRESH', 'The host clock is not the default draft reference.');
  const newer = add(f, 'newer-recheck'); acquisitionAt(f, newer, '2026-10-09T00:00:00.000Z');
  for (const [evaluated_at, status] of [['2026-10-08T23:59:59.500Z', 'FRESH'], ['2026-10-09T00:00:00.500Z', 'STALE']]) {
    const result = await f.evaluate(undefined, evaluated_at);
    assert.equal(freshness(result).status, status);
    assert.equal(freshness(result).reference_origin, 'EXPLICIT_DRAFT_EVALUATION');
    assert.equal(freshness(result).evaluated_at, evaluated_at);
    assert.deepEqual(result.selected_evidence, draft.selected_evidence);
  }
  assert.deepEqual(await f.evaluate(), first, 'An explicit later evaluation does not overwrite the original draft reference.');
  files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), bytesBefore[i]));
  assert.deepEqual(await f.store.readDraft('draft'), draft);
  assert.equal(draft.readiness_status, 'NOT_EVALUATED');
  assert.equal(f.jobs.get(selection.job_id).validation_status, 'VALID');
});

test('legacy receipt absence and missing requester notification block freshness without creating capture_date', async () => {
  const f = fixture(); const selection = add(f, 'legacy-age');
  const draft = await f.persist([selection], acquiredAt);
  const result = await f.evaluate();
  assert.ok(has(result, 'FIELD_OBSERVATION_REQUIRED', 'serp_acquisition'));
  assert.equal(freshness(result).status, 'ACQUISITION_MISSING');
  assert.equal(freshness(result).capture_date, null);
  assert.equal(freshness(result).age_ms, null);
  assert.equal(freshness(result).acquisition, null);
  assert.equal(Object.hasOwn(draft.selected_evidence[0], 'serp_acquisition'), false);
  assert.deepEqual(result.selected_evidence, draft.selected_evidence);
});

test('malformed or unverifiable receipt metadata cannot reuse a prior freshness pass', async () => {
  for (const changes of [
    { acquisition_metadata: {} }, { acquisition_metadata: null },
    { acquisition_metadata: { response_received_at: '2026-02-30T00:00:00.000Z', response_received_at_origin: 'COLLECTOR_OBSERVED_RESPONSE_RECEIPT' } },
    { acquisition_metadata: { response_received_at: receipt, response_received_at_origin: 'PROVIDER' } },
    { raw_artifact_id: 'another-artifact' }, { attempt_id: 'another-attempt' },
  ]) {
    const f = fixture(); const selection = add(f, 'invalid-recheck');
    acquisitionAt(f, selection, receipt);
    const draft = await f.persist([selection], receipt);
    assert.equal(freshness(await f.evaluate()).status, 'FRESH');
    writeAcquisition(f, selection, changes);
    const result = await f.evaluate();
    assert.ok(has(result, 'EVIDENCE_INVALID', 'accepted_evidence_identity'));
    assert.equal(freshness(result), undefined);
    assert.deepEqual(result.selected_evidence, draft.selected_evidence);
    assert.deepEqual(await f.store.readDraft('draft'), draft);
  }
});

test('an invalid or incomplete explicit draft reference cannot fall back to draft time or the host clock', async () => {
  const f = fixture(); const selection = add(f, 'invalid-reference');
  acquisitionAt(f, selection, receipt);
  await f.persist([selection], receipt);
  for (const evaluated_at of [null, '', 'invalid', '2026-10-01', '2026-02-30T00:00:00.000Z']) {
    const result = await f.evaluate(undefined, evaluated_at);
    assert.ok(has(result, 'EVIDENCE_INVALID', 'serp_reference_time'));
    assert.equal(freshness(result).status, 'INVALID_REFERENCE');
    assert.equal(freshness(result).age_ms, null);
  }
});

test('current approved profile no longer labels capture and freshness as unresolved decisions', async () => {
  const f = fixture(); const selected = add(f, 'approved-clock');
  acquisitionAt(f, selected, receipt);
  await f.persist([selected], receipt);
  const result = await f.evaluate(BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS);
  assert.equal(freshness(result).status, 'FRESH');
  for (const id of ['capture_date', 'freshness']) assert.equal(has(result, 'DECISION_REQUIRED', id), false);
  assert.ok(has(result, 'DECISION_REQUIRED', 'query_coverage'));
  assert.equal(result.delivery_readiness, 'NOT_EVALUATED');
});

test('complete UTC draft references retain their instant with second or fractional-second precision', async () => {
  const f = fixture(); const selected = add(f, 'reference-precision');
  acquisitionAt(f, selected, '2026-10-01T23:59:59.000Z');
  await f.persist([selected], '2026-10-08T23:59:59Z');
  for (const evaluated_at of [undefined, '2026-10-08T23:59:59.0Z', '2026-10-08T23:59:59.00Z']) {
    const result = await f.evaluate(undefined, evaluated_at);
    assert.equal(freshness(result).status, 'FRESH');
    assert.equal(freshness(result).age_ms, 604800000);
    assert.equal(freshness(result).evaluated_at, evaluated_at ?? '2026-10-08T23:59:59Z');
  }
});
