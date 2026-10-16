const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
const {fixture,syntheticRequirements,BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS}=require('./blog-v2-readiness-fixture.cjs');
const {context,page,bundle}=require('./blog-v2-ga4-fixture.cjs');
const {inspectBlogWritingPackV2Fields:inspect}=require(path.join(process.argv[2],'main/blog-writing-packs/blog-writing-pack-v2-field-compliance.js'));
const {normalizeGoogleAnalytics4Rows}=require(path.join(process.argv[2],'main/sources/google-analytics-4/google-analytics-4-parser.js'));
const inspectGa4=(body=bundle(),ctx=context())=>inspect('google-analytics-4',Buffer.from(JSON.stringify(body)),ctx);
const field=(result,name)=>result.fields.find((f)=>f.field===name);
const has=(result,code,id)=>result.blockers.some((b)=>b.dataset_type==='GA4_CONTENT_PERFORMANCE'&&b.code===code&&b.requirement_id===id);
const profile=()=>({...syntheticRequirements(),ga4_requested_dates:{start_date:'2026-09-01',end_date:'2026-09-28'}});
const add=(f,suffix,body=bundle(),ctx=context(),status='VALID')=>{
  const selected=f.add(suffix,'google-analytics-4','GA4_CONTENT_PERFORMANCE');const bytes=Buffer.from(JSON.stringify(body));
  fs.writeFileSync(path.join(f.root,'runs',selected.run_id,'raw.json'),bytes);
  Object.assign(f.artifacts.get(selected.artifact_id),{byte_size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),artifact_state:status==='VALID'?'ACCEPTED':'ACCEPTED_WITH_WARNING'});
  Object.assign(f.jobs.get(selected.job_id),{source_context:ctx,validation_status:status});
  f.validations.get(`validation_${suffix}`).validation_status=status;return selected;
};
const evaluate=async(body=bundle(),ctx=context(),status='VALID',requirements=profile())=>{
  const f=fixture();const selected=add(f,'ga4',body,ctx,status);const draft=await f.persist([selected]);
  return {f,selected,draft,result:await f.evaluate(requirements)};
};

test('A: actual Content Performance preserves native landingPage text, page-level metrics and provider metadata',async()=>{
  const inspected=inspectGa4();assert.equal(inspected.status,'SUPPORTED');
  assert.equal(inspected.rows[0].landing_page,'/synthetic?campaign=observed');
  assert.equal(field(inspected,'landing_page').status,'OBSERVED');assert.equal(inspected.fields.length,7);
  assert.deepEqual(inspected.ga4_context,{property_id:'123456789',requested_start_date:'2026-09-01',requested_end_date:'2026-09-28',
    dimension_headers:['landingPage'],metric_headers:page().metricHeaders.map((h)=>h.name),provider_metadata:{currency_code:'TRY',time_zone:'Europe/Istanbul'}});
  const {result}=await evaluate();assert.equal(result.field_checks[0].row_count,1);
  assert.deepEqual(result.field_checks[0].ga4_context,inspected.ga4_context);
  assert.equal(has(result,'DECISION_REQUIRED','field_compliance'),false);
  const body=page();body.rows[0].dimensionValues[0].value='(not set)';
  assert.equal(inspectGa4(bundle(body)).rows[0].landing_page,'(not set)');
});

test('placeholder-only evidence preserves raw/normalized rows but establishes zero identified landing pages',async()=>{
  const body=page();body.rows[0].dimensionValues[0].value='(not set)';
  const raw=bundle(body);const bytes=Buffer.from(JSON.stringify(raw));
  const expected=normalizeGoogleAnalytics4Rows('GA4_CONTENT_PERFORMANCE',raw).rows;
  const inspected=inspectGa4(raw);
  assert.deepEqual(inspected.rows,expected);assert.equal(inspected.rows[0].landing_page,'(not set)');
  const landing=field(inspected,'landing_page');
  assert.equal(landing.observed_count,0);assert.equal(landing.null_count,0);assert.equal(landing.absent_count,0);
  assert.equal(landing.status,'UNRESOLVED');
  const {f,selected,draft,result}=await evaluate(raw);
  assert.ok(has(result,'FIELD_OBSERVATION_REQUIRED','landing_page'));
  assert.equal(has(result,'FIELD_REPRESENTATION_INVALID','field_compliance'),false);
  assert.deepEqual(result.selected_evidence,draft.selected_evidence);
  assert.deepEqual(fs.readFileSync(path.join(f.root,'runs',selected.run_id,'raw.json')),bytes);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root,'packages','draft','BLOG_DRAFT.json'),'utf8')),draft);
  assert.equal(result.datasets[6].coverage_status,'BLOCKED');
});

test('mixed placeholder/path evidence counts only the identified path and retains independent rows and blockers',async()=>{
  const body=page();body.rows[0].dimensionValues[0].value='(not set)';
  const second=structuredClone(body.rows[0]);second.dimensionValues[0].value='/blog/example';
  body.rows.push(second);body.rowCount=2;const raw=bundle(body);const before=JSON.stringify(raw);
  const inspected=inspectGa4(raw);
  assert.deepEqual(inspected.rows,normalizeGoogleAnalytics4Rows('GA4_CONTENT_PERFORMANCE',raw).rows);
  assert.deepEqual(inspected.rows.map((row)=>row.landing_page),['(not set)','/blog/example']);
  assert.equal(field(inspected,'landing_page').observed_count,1);
  assert.equal(field(inspected,'landing_page').status,'UNRESOLVED');
  const {f,selected,draft,result}=await evaluate(raw);
  assert.equal(result.field_checks[0].row_count,2);
  assert.equal(result.field_checks[0].fields.find((entry)=>entry.field==='landing_page').observed_count,1);
  assert.ok(has(result,'FIELD_OBSERVATION_REQUIRED','landing_page'));
  assert.ok(has(result,'DECISION_REQUIRED','content_coverage'));
  assert.equal(has(result,'FIELD_REPRESENTATION_INVALID','field_compliance'),false);
  assert.deepEqual(result.selected_evidence,draft.selected_evidence);
  assert.equal(fs.readFileSync(path.join(f.root,'runs',selected.run_id,'raw.json'),'utf8'),before);
  assert.equal(JSON.stringify(raw),before);assert.equal(result.delivery_readiness,'NOT_EVALUATED');
});

test('blank, null and absent landingPage values retain their existing source behavior and exact raw representations',async()=>{
  for(const value of ['', '   ', null, undefined]){
    const body=page();body.rows[0].dimensionValues[0]={value};
    const raw=bundle(body);const before=JSON.stringify(raw);
    const {f,selected,result}=await evaluate(raw);
    if(typeof value==='string'){
      assert.equal(inspectGa4(raw).rows[0].landing_page,value);
      assert.ok(has(result,'FIELD_OBSERVATION_REQUIRED','landing_page'));
    }else{
      assert.ok(has(result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
      assert.equal(result.field_checks.length,0);
    }
    assert.equal(fs.readFileSync(path.join(f.root,'runs',selected.run_id,'raw.json'),'utf8'),before);
    assert.equal(JSON.stringify(raw),before);
  }
});

test('GA4 placeholder semantics never reinterpret the same literal in another source',()=>{
  const inspected=inspect('google-search-console-query-page',[{rows:[{
    keys:['(not set)','https://example.test/observed'],clicks:0,impressions:1,ctr:0,position:1,
  }]}]);
  assert.equal(inspected.rows[0].query,'(not set)');
  assert.equal(field(inspected,'query').status,'OBSERVED');assert.equal(field(inspected,'query').observed_count,1);
});

test('B/C/K: activeUsers never becomes users; unacquired totalUsers cannot silently extend the accepted source schema',async()=>{
  const inspected=inspectGa4();assert.equal(inspected.rows[0].active_users,7);
  assert.equal(Object.hasOwn(inspected.rows[0],'users'),false);assert.equal(field(inspected,'users').status,'UNSUPPORTED');
  const {result}=await evaluate();assert.ok(has(result,'DECISION_REQUIRED','users'));assert.ok(has(result,'SOURCE_CHANGE_REQUIRED','users'));
  const body=page();body.metricHeaders.push({name:'totalUsers',type:'TYPE_INTEGER'});body.rows[0].metricValues.push({value:'17'});
  const raw=bundle(body);const before=JSON.stringify(raw);
  assert.ok(has((await evaluate(raw)).result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
  assert.equal(JSON.stringify(raw),before);assert.equal(JSON.parse(raw.pages[0].raw_body_text).rows[0].metricValues.at(-1).value,'17');
});

test('D/N: absent metric values, explicit nulls and true zero stay distinct without reconstruction',async()=>{
  for(const [index,name] of [[1,'sessions'],[2,'engaged_sessions'],[3,'engagement_rate'],[4,'key_events']]){
    const body=page();body.rows[0].metricValues[index]={};
    assert.equal(field(inspectGa4(bundle(body)),name).status,'ABSENT');
    assert.ok(has((await evaluate(bundle(body))).result,'FIELD_ABSENT',name));
    body.rows[0].metricValues[index]={value:null};
    assert.equal(field(inspectGa4(bundle(body)),name).status,'NULL');assert.equal(inspectGa4(bundle(body)).rows[0][name],null);
    body.rows[0].metricValues[index]={value:'0'};
    assert.equal(inspectGa4(bundle(body)).rows[0][name],0);assert.equal(field(inspectGa4(bundle(body)),name).observed_count,1);
    body.rows[0].metricValues[index]={value:''};assert.equal(inspectGa4(bundle(body)).rows[0][name],null);
  }
});

test('E: engagementRate is the provider fraction, not a percent conversion or recomputed quotient',()=>{
  const row=inspectGa4().rows[0];assert.equal(row.sessions,0);assert.equal(row.engaged_sessions,3);assert.equal(row.engagement_rate,0.625);
});

test('F/G: no average duration alias or calculation is approved, and acquisition gaps remain explicit',async()=>{
  const inspected=inspectGa4();assert.equal(Object.hasOwn(inspected.rows[0],'average_engagement_time'),false);
  assert.equal(field(inspected,'average_engagement_time').status,'UNSUPPORTED');
  const {result}=await evaluate();assert.ok(has(result,'DECISION_REQUIRED','average_engagement_time'));
  assert.ok(has(result,'SOURCE_CHANGE_REQUIRED','average_engagement_time'));
  for(const name of ['userEngagementDuration','averageSessionDuration']){
    const body=page();body.metricHeaders.push({name,type:'TYPE_SECONDS'});body.rows[0].metricValues.push({value:'300'});
    assert.ok(has((await evaluate(bundle(body))).result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
  }
});

test('H: keyEvents retains its native fractional-capable metric; eventCount/conversions never substitute',async()=>{
  const body=page();body.rows[0].metricValues[4].value='1.5';assert.equal(inspectGa4(bundle(body)).rows[0].key_events,1.5);
  for(const name of ['eventCount','conversions']){
    body.metricHeaders[4].name=name;
    assert.ok(has((await evaluate(bundle(body))).result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
  }
});

test('I: explicit approved endpoints compare exactly with no inherited duration or observed-date invention',async()=>{
  const requirements=profile();requirements.ga4_requested_dates.start_date='2026-09-02';
  assert.ok(has((await evaluate(bundle(),context(),'VALID',requirements)).result,'WINDOW_MISMATCH','ga4_requested_dates'));
  const unapproved=syntheticRequirements();delete unapproved.ga4_requested_dates;
  assert.ok(has((await evaluate(bundle(),context(),'VALID',unapproved)).result,'DECISION_REQUIRED','ga4_requested_dates'));
  const f=fixture();await f.persist([add(f,'scope')]);
  for(const dates of [{start_date:'2026-02-30',end_date:'2026-09-28'},{start_date:'2026-09-29',end_date:'2026-09-28'}]){
    await assert.rejects(f.evaluate({...profile(),ga4_requested_dates:dates}),/GA4|requirements/);
  }
  assert.equal(Object.hasOwn(inspectGa4().rows[0],'performance_date'),false);
});

test('J: Paid Funnel identity or page/device/extra-date granularity cannot masquerade as Content Performance',async()=>{
  const paid=bundle();paid.dataset_type='GA4_PAID_FUNNEL';
  assert.ok(has((await evaluate(paid)).result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
  for(const name of ['landingPagePlusQueryString','pagePath','pageLocation']){
    const body=page();body.dimensionHeaders[0].name=name;
    assert.ok(has((await evaluate(bundle(body))).result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
  }
  const body=page();body.dimensionHeaders.push({name:'date'});body.rows[0].dimensionValues.push({value:'20260901'});
  assert.ok(has((await evaluate(bundle(body))).result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
  const bad=await evaluate(bundle(),{...context(),session_filter:{session_source:'google',session_medium:'cpc'}});
  assert.ok(has(bad.result,'EVIDENCE_INVALID','ga4_request_context'));
});

test('request property and window must match immutable context; legacy missing property stays explicit',async()=>{
  const body=bundle();body.request.property_id='987654321';
  assert.ok(has((await evaluate(body)).result,'EVIDENCE_INVALID','ga4_request_context'));
  const dates=bundle();dates.request.start_date='2026-09-02';
  assert.ok(has((await evaluate(dates)).result,'WINDOW_MISMATCH','ga4_request_window'));
  const ctx=context();delete ctx.property_id;const {result}=await evaluate(bundle(),ctx);
  assert.ok(has(result,'DECISION_REQUIRED','property_scope'));
  assert.equal(result.field_checks[0].ga4_context.property_id,'123456789');
  assert.equal(Object.hasOwn(result.selected_evidence[0].requested_context,'property_id'),false);
});

test('L: independent Jobs keep raw rows, duplicates, property/window separation and complete frozen provenance',async()=>{
  const f=fixture();const body=page();body.rows.push(structuredClone(body.rows[0]));body.rowCount=2;
  const first=add(f,'one',bundle(body));
  const secondBody=bundle();secondBody.request.start_date='2026-08-01';secondBody.request.end_date='2026-08-31';secondBody.request.property_id='987654321';
  const second=add(f,'two',secondBody,{...context(),property_id:'987654321',start_date:'2026-08-01',end_date:'2026-08-31'});
  const draft=await f.persist([first,second]);const filename=path.join(f.root,'packages','draft','BLOG_DRAFT.json');const before=fs.readFileSync(filename);
  const rawFile=path.join(f.root,'runs',first.run_id,'raw.json');const rawBefore=fs.readFileSync(rawFile);add(f,'newer');
  const result=await f.evaluate(profile());assert.deepEqual(result.selected_evidence,draft.selected_evidence);
  assert.deepEqual(result.field_checks.map((v)=>[v.run_id,v.job_id,v.artifact_id,v.row_count,v.ga4_context.property_id]),[[first.run_id,first.job_id,first.artifact_id,2,'123456789'],[second.run_id,second.job_id,second.artifact_id,1,'987654321']]);
  assert.ok(has(result,'DECISION_REQUIRED','multi_job_coverage'));assert.ok(has(result,'WINDOW_MISMATCH','ga4_requested_dates'));
  assert.deepEqual(fs.readFileSync(filename),before);assert.deepEqual(fs.readFileSync(rawFile),rawBefore);
});

test('M: empty VALID/NO_DATA/LOW_DATA cannot establish fields or mandatory coverage',async()=>{
  for(const status of ['VALID','NO_DATA','LOW_DATA']){
    const {result}=await evaluate(bundle(page([])),context(),status);
    assert.equal(result.field_checks[0].row_count,0);assert.ok(has(result,'FIELD_OBSERVATION_REQUIRED','sessions'));
    assert.ok(has(result,'SOURCE_CHANGE_REQUIRED','users'));assert.ok(has(result,'DECISION_REQUIRED','content_coverage'));
    if(status!=='VALID')assert.ok(has(result,'DECISION_REQUIRED','validation_outcome_coverage'));
    assert.equal(result.coverage_status,status==='VALID'?'PARTIAL':'NOT_READY');
  }
});

test('malformed schemas, headers/types, missing pages, incomplete row coverage and provider errors fail safely',async()=>{
  const invalid=[];
  const header=page();header.metricHeaders[1].type='TYPE_FLOAT';invalid.push(bundle(header));
  const missing=page();missing.metricHeaders.splice(1,1);missing.rows[0].metricValues.splice(1,1);invalid.push(bundle(missing));
  const short=page();short.rowCount=2;invalid.push(bundle(short));
  const pages=bundle();pages.pages=[];invalid.push(pages);
  const gap=bundle();gap.pages[0].offset=250000;invalid.push(gap);
  const bad=page();bad.rows[0].metricValues[1].value='synthetic-sensitive-marker';invalid.push(bundle(bad));
  invalid.push(bundle({error:{message:'synthetic-sensitive-marker'}}));
  for(const raw of invalid){
    const {result}=await evaluate(raw);assert.ok(has(result,'FIELD_REPRESENTATION_INVALID','field_compliance'));
    assert.equal(result.field_checks.length,0);assert.equal(JSON.stringify(result).includes('synthetic-sensitive-marker'),false);
  }
});

test('changed artifacts or frozen contexts block evaluation without replacing selections',async()=>{
  const {f,selected}=await evaluate();fs.appendFileSync(path.join(f.root,'runs',selected.run_id,'raw.json'),' ');
  assert.ok(has(await f.evaluate(profile()),'ARTIFACT_INTEGRITY_FAILED','artifact_integrity'));
  const g=await evaluate();g.f.jobs.get(g.selected.job_id).source_context.start_date='2026-09-02';
  assert.ok(has(await g.f.evaluate(profile()),'MEMBERSHIP_CHANGED','frozen_provenance'));
});

test('O: current real requirements remain blocked, all family states and delivery scope remain intact',async()=>{
  const {f}=await evaluate();const result=await f.evaluate(BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS);
  assert.equal(result.datasets[6].coverage_status,'BLOCKED');assert.equal(result.coverage_status,'PARTIAL');
  assert.equal(result.coverage_scope,'EXPLICIT_REQUIREMENTS_ONLY');assert.equal(result.delivery_readiness,'NOT_EVALUATED');
  assert.ok(has(result,'DECISION_REQUIRED','users'));assert.ok(has(result,'DECISION_REQUIRED','average_engagement_time'));
});
