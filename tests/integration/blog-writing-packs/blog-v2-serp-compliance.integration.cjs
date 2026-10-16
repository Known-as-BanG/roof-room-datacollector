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

test('A: accepted actual fields are checked with explicit origins, while capture meaning remains unresolved', async () => {
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
    query: 'REQUEST_DIMENSION_VERIFIED_BY_PROVIDER', capture_date: 'UNAPPROVED',
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

test('C/D: provider generation metadata, requested date and local acquisition time never become capture_date', async () => {
  const body=response(); const before=JSON.stringify(body);
  const inspected=inspectSerp(body);
  assert.equal(Object.hasOwn(inspected.rows[0],'capture_date'),false);
  assert.equal(field(inspected,'capture_date').observed_count,0);
  assert.equal(JSON.stringify(body),before);
  const { result,draft }=await evaluate(body);
  assert.ok(has(result,'DECISION_REQUIRED','capture_date'));
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
  assert.ok(has((await evaluate(body)).result,'DECISION_REQUIRED','position_semantics'));
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

test('J: clearing decisions never approves required query coverage, snapshot meaning, rank scope, context or freshness', async () => {
  const { result }=await evaluate();
  for(const id of ['query_coverage','capture_date','position_semantics','search_context','freshness']) assert.ok(has(result,'DECISION_REQUIRED',id),id);
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
  assert.ok(has(result,'DECISION_REQUIRED','capture_date'));
  assert.equal(result.coverage_status,'PARTIAL');assert.equal(result.delivery_readiness,'NOT_EVALUATED');
});
