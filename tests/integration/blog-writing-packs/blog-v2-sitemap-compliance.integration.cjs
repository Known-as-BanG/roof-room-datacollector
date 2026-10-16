const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./blog-v2-readiness-fixture.cjs');
const { root, acquiredAt, context, xml } = require('./blog-v2-sitemap-fixture.cjs');
const { inspectBlogWritingPackV2Fields: inspect } = require(path.join(process.argv[2], 'main/blog-writing-packs/blog-writing-pack-v2-field-compliance.js'));
const { BitkimarkSitemapSource } = require(path.join(process.argv[2], 'main/sources/bitkimark/bitkimark-sitemap-source.js'));
const inspectSitemap = (bytes = xml(), ctx = context()) => inspect('bitkimark-sitemap', bytes, ctx, acquiredAt);
const field = (result, name) => result.fields.find((item) => item.field === name);
const add = (f, suffix, bytes = xml(), ctx = context(), status = 'VALID') => {
  const selected = f.add(suffix, 'bitkimark-sitemap', 'SITEMAP_URLS');
  fs.writeFileSync(path.join(f.root,'runs',selected.run_id,'raw.json'), bytes);
  Object.assign(f.artifacts.get(selected.artifact_id), { byte_size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), artifact_state: status === 'VALID' ? 'ACCEPTED' : 'ACCEPTED_WITH_WARNING' });
  Object.assign(f.jobs.get(selected.job_id), { source_context: ctx, validation_status: status });
  f.validations.get(`validation_${suffix}`).validation_status = status;
  return selected;
};
const evaluate = async (bytes = xml(), ctx = context(), status = 'VALID') => {
  const f = fixture(); const selected = add(f,'sitemap',bytes,ctx,status); const draft = await f.persist([selected]);
  return { f, selected, draft, result: await f.evaluate() };
};

test('A: observed page loc satisfies only URL field; requested sitemap URL is independent', async () => {
  const inspected = inspectSitemap();
  assert.equal(inspected.status,'SUPPORTED');
  assert.equal(inspected.rows[0].url,'https://bitkimark.com/blog/synthetic-roofroom-page');
  assert.equal(inspected.rows[0].source_url,context().requested_url);
  assert.equal(inspected.rows[0].entry_type,'URL');
  assert.equal(field(inspected,'url').status,'OBSERVED');
  assert.equal(inspected.fields.length,4);
  const { result } = await evaluate();
  assert.equal(result.field_checks[0].fields.find((v) => v.field === 'url').status,'OBSERVED');
  assert.equal(result.datasets[4].coverage_status,'BLOCKED');
});

test('B: missing, blank, malformed and off-host loc observations fail safely', async () => {
  for (const row of [{}, { url: '' }, { url: 'not-a-url-secret-marker' }, { url: 'https://example.test/unapproved' }]) {
    const { result } = await evaluate(xml([row]));
    assert.ok(result.blockers.some((b) => b.code === 'FIELD_REPRESENTATION_INVALID'));
    assert.equal(JSON.stringify(result).includes('secret-marker'),false);
  }
});

test('C/D/F: URL patterns, slugs, lastmod and source annotations never become page type, title or status', async () => {
  const inspected = inspectSitemap(xml([{ url: 'https://bitkimark.com/products/synthetic-roofroom-ficus', extra: '<changefreq>daily</changefreq><priority>0.9</priority><title>synthetic metadata</title>' }]));
  for (const name of ['page_type','title','status']) {
    assert.equal(Object.hasOwn(inspected.rows[0],name),false);
    assert.equal(field(inspected,name).status,'UNSUPPORTED');
  }
  assert.equal(Object.hasOwn(inspected.rows[0],'changefreq'),false);
  assert.equal(Object.hasOwn(inspected.rows[0],'priority'),false);
  const { result } = await evaluate();
  for (const name of ['page_type','title','status']) assert.ok(result.blockers.some((b) => b.code === 'SOURCE_CHANGE_REQUIRED' && b.requirement_id === name));
});

test('E: mocked successful sitemap fetch is one document request and never supplies per-page HTTP status', async () => {
  const calls = []; const bytes = xml();
  const source = new BitkimarkSitemapSource(async (url) => {
    calls.push(url); return { ok: true, status: 200, url, headers: { get: () => 'application/xml' }, arrayBuffer: async () => bytes };
  });
  const collected = await source.collect({ source_id: 'bitkimark-sitemap', source_context: context() });
  assert.equal(collected.acquisition_metadata.response_status,200);
  const inspected = inspectSitemap(collected.bytes);
  assert.equal(field(inspected,'status').status,'UNSUPPORTED');
  assert.equal(Object.hasOwn(inspected.rows[0],'status'),false);
  assert.deepEqual(calls,[context().requested_url]);
});

test('G/K: lastmod observations and nulls remain separate from acquisition time and unsupported page status', () => {
  const inspected = inspectSitemap(xml([{ url: 'https://bitkimark.com/synthetic-roofroom-one', lastmod: '2020-01-02' },{ url: 'https://bitkimark.com/synthetic-roofroom-two' },{ url: 'https://bitkimark.com/synthetic-roofroom-three', lastmod: null }]));
  assert.deepEqual(inspected.rows.map((r) => r.lastmod),['2020-01-02',null,null]);
  assert.ok(inspected.rows.every((r) => r.retrieved_at === acquiredAt));
  assert.ok(inspected.rows.every((r) => !Object.hasOwn(r,'status')));
});

test('sitemap index loc remains child-document evidence and never satisfies the webpage URL requirement', async () => {
  const bytes = xml([{ url: 'https://bitkimark.com/blogs.xml' }],'sitemapindex');
  const inspected = inspectSitemap(bytes,context(root));
  assert.equal(inspected.rows[0].entry_type,'SITEMAP');
  assert.equal(inspected.rows[0].document_kind,'SITEMAP_INDEX');
  assert.equal(field(inspected,'url').status,'UNRESOLVED');
  const { result } = await evaluate(bytes,context(root));
  assert.ok(result.blockers.some((b) => b.code === 'DECISION_REQUIRED' && b.requirement_id === 'sitemap_document_kind'));
});

test('existing duplicate-within-document and unverified-index-child rejection remain unchanged', async () => {
  const one = { url: 'https://bitkimark.com/synthetic-roofroom-duplicate' };
  for (const bytes of [xml([one,one]),xml([{ url: 'https://bitkimark.com/unapproved-synthetic-sitemap.xml' }],'sitemapindex')]) {
    const { result } = await evaluate(bytes,context(root));
    assert.ok(result.blockers.some((b) => b.code === 'FIELD_REPRESENTATION_INVALID'));
  }
});

test('H: overlapping page URLs in independent Jobs remain separate without draft or raw mutation', async () => {
  const f = fixture(); const bytes = xml();
  const first = add(f,'one',bytes); const second = add(f,'two',bytes,context('https://bitkimark.com/pages.xml'));
  const draft = await f.persist([first,second]);
  const filename = path.join(f.root,'packages','draft','BLOG_DRAFT.json'); const before = fs.readFileSync(filename);
  add(f,'newer');
  const result = await f.evaluate();
  assert.deepEqual(result.selected_evidence,draft.selected_evidence);
  assert.deepEqual(result.field_checks.map((r) => [r.run_id,r.job_id,r.artifact_id,r.row_count]),[[first.run_id,first.job_id,first.artifact_id,1],[second.run_id,second.job_id,second.artifact_id,1]]);
  assert.ok(result.blockers.some((b) => b.requirement_id === 'multi_job_coverage'));
  assert.deepEqual(fs.readFileSync(filename),before);
  assert.deepEqual(fs.readFileSync(path.join(f.root,'runs',first.run_id,'raw.json')),bytes);
});

test('I: a single accepted document never implies complete website inventory through empty decision lists', async () => {
  const { result } = await evaluate();
  assert.ok(result.blockers.some((b) => b.code === 'DECISION_REQUIRED' && b.requirement_id === 'scope'));
  assert.equal(result.coverage_scope,'EXPLICIT_REQUIREMENTS_ONLY');
  assert.equal(result.delivery_readiness,'NOT_EVALUATED');
});

test('J: empty VALID/NO_DATA/LOW_DATA evidence never vacuously proves observed URL or mandatory coverage', async () => {
  for (const status of ['VALID','NO_DATA','LOW_DATA']) {
    const { result } = await evaluate(xml([]),context(),status);
    assert.ok(result.blockers.some((b) => b.code === 'FIELD_OBSERVATION_REQUIRED' && b.requirement_id === 'url'));
    assert.equal(result.field_checks[0].row_count,0);
    if (status !== 'VALID') assert.ok(result.blockers.some((b) => b.requirement_id === 'validation_outcome_coverage'));
    assert.equal(result.datasets[4].coverage_status,'BLOCKED');
  }
});

test('invalid context and unsupported XML do not establish observations or leak source text', async () => {
  const badContext = await evaluate(xml(),{});
  assert.ok(badContext.result.blockers.some((b) => b.code === 'EVIDENCE_INVALID' && b.requirement_id === 'sitemap_request_context'));
  const badXml = await evaluate(Buffer.from('<html>synthetic-secret-marker</html>'));
  assert.ok(badXml.result.blockers.some((b) => b.code === 'FIELD_REPRESENTATION_INVALID'));
  assert.equal(JSON.stringify(badXml.result).includes('synthetic-secret-marker'),false);
});

test('existing loc preservation rules remain intact and missing acquisition provenance never falls back to lastmod or current time', () => {
  const url = 'https://BITKIMARK.COM/synthetic-roofroom-%7Ecase';
  const inspected = inspectSitemap(xml([{ url, lastmod: '2020-01-02' }]));
  assert.equal(inspected.rows[0].url,url);
  assert.equal(inspected.rows[0].parent_sitemap_url,root);
  assert.throws(() => inspect('bitkimark-sitemap',xml(),context()), /acquisition time/i);
});
