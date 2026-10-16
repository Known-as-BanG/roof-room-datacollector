const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./blog-v2-readiness-fixture.cjs');
const { context, headers, product, workbook } = require('./blog-v2-ikas-fixture.cjs');
const { inspectBlogWritingPackV2Fields: inspect } = require(path.join(process.argv[2], 'main/blog-writing-packs/blog-writing-pack-v2-field-compliance.js'));
const inspectProducts = (bytes = workbook(), ctx = context()) => inspect('ikas-products', bytes, ctx);
const field = (result, name) => result.fields.find((f) => f.field === name);
const add = (f, name, bytes = workbook(), status = 'VALID', ctx = context()) => {
  const selection = f.add(name, 'ikas-products', 'PRODUCTS');
  fs.writeFileSync(path.join(f.root, 'runs', selection.run_id, 'raw.json'), bytes);
  Object.assign(f.artifacts.get(selection.artifact_id), { byte_size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), artifact_state: status === 'VALID' ? 'ACCEPTED' : 'ACCEPTED_WITH_WARNING' });
  Object.assign(f.jobs.get(selection.job_id), { source_context: ctx, validation_status: status });
  f.validations.get(`validation_${name}`).validation_status = status;
  return selection;
};
const evaluate = async (bytes = workbook(), status = 'VALID', ctx = context()) => {
  const f = fixture(); const selection = add(f, 'ikas', bytes, status, ctx);
  const draft = await f.persist([selection]);
  return { f, selection, draft, result: await f.evaluate() };
};

test('A/B: actual product-group identity, observed name and supplied URL map without losing variant rows', () => {
  const result = inspectProducts();
  assert.equal(result.status, 'SUPPORTED');
  assert.equal(result.rows[0].product_id, 'synthetic-product');
  assert.equal(result.rows[0].variant_id, 'synthetic-variant');
  assert.equal(result.rows[0].product_name, 'Synthetic product');
  assert.equal(result.rows[0].product_url, 'https://example.test/product');
  assert.equal(field(result, 'product_id').status, 'OBSERVED');
  assert.equal(result.fields.length, 8);
});

test('C: a variant ID never supplies a blank product ID', async () => {
  const bytes = workbook([product({ 'Product ID': '' })]);
  const inspected = inspectProducts(bytes);
  assert.equal(inspected.rows[0].product_id, null);
  assert.equal(inspected.rows[0].variant_id, 'synthetic-variant');
  const { result } = await evaluate(bytes);
  assert.ok(result.blockers.some((b) => b.code === 'FIELD_OBSERVATION_REQUIRED' && b.requirement_id === 'product_id'));
});

test('D: absent URL column differs from a blank URL and never uses slug/name/domain', async () => {
  const absent = workbook([product()], headers.filter((h) => h !== 'Product URL'));
  const inspected = inspectProducts(absent);
  assert.equal(inspected.rows[0].product_url, null);
  assert.equal(field(inspected, 'product_url').status, 'ABSENT');
  assert.ok((await evaluate(absent)).result.blockers.some((b) => b.code === 'FIELD_ABSENT' && b.requirement_id === 'product_url'));
  const blank = workbook([product({ 'Product URL': '' })]);
  assert.equal(field(inspectProducts(blank), 'product_url').status, 'NULL');
  assert.ok((await evaluate(blank)).result.blockers.some((b) => b.requirement_id === 'product_url' && b.code === 'FIELD_OBSERVATION_REQUIRED'));
});

test('E: multiple categories/type remain native and cannot silently become a singular category', async () => {
  const inspected = inspectProducts();
  assert.equal(inspected.rows[0].categories, 'Category A;Category B');
  assert.equal(inspected.rows[0].product_type, 'Synthetic type');
  assert.equal(Object.hasOwn(inspected.rows[0], 'category'), false);
  assert.equal(field(inspected, 'category').status, 'UNRESOLVED');
  assert.ok((await evaluate()).result.blockers.some((b) => b.requirement_id === 'category' && b.code === 'DECISION_REQUIRED'));
});

test('F/G: variant prices and sale prices stay separate, with unresolved product price and currency', async () => {
  const bytes = workbook([product(), product({ 'Variant ID': 'variant-two', Price: '45', 'Sale price': '40' })]);
  const inspected = inspectProducts(bytes);
  assert.deepEqual(inspected.rows.map((r) => [r.price,r.sale_price]), [[12.5,null],[45,40]]);
  assert.equal(field(inspected, 'price').status, 'UNRESOLVED');
  assert.equal(Object.hasOwn(inspected.rows[0], 'currency'), false);
  const { result } = await evaluate(bytes);
  assert.ok(result.blockers.some((b) => b.requirement_id === 'price' && b.code === 'DECISION_REQUIRED'));
  assert.ok(result.blockers.some((b) => b.requirement_id === 'currency_context' && b.code === 'SOURCE_CHANGE_REQUIRED'));
});

test('H/I: derived variant availability cannot fabricate stock or lifecycle status', async () => {
  const bytes = workbook([product({ Stock: '5' }), product({ 'Variant ID': 'v2', Stock: '', 'Continue selling': '' })]);
  const inspected = inspectProducts(bytes);
  assert.equal(inspected.rows[0].availability, 'AVAILABLE');
  assert.equal(inspected.rows[1].availability, 'UNKNOWN');
  assert.equal(inspected.rows[1].stock, null);
  for (const name of ['stock_status','product_status']) {
    assert.equal(Object.hasOwn(inspected.rows[0], name), false);
    assert.equal(field(inspected, name).status, 'UNSUPPORTED');
  }
  assert.equal(field(inspected, 'availability').status, 'UNRESOLVED');
  const { result } = await evaluate(bytes);
  for (const name of ['stock_status','product_status']) assert.ok(result.blockers.some((b) => b.requirement_id === name && b.code === 'SOURCE_CHANGE_REQUIRED'));
  assert.ok(result.blockers.some((b) => b.requirement_id === 'availability' && b.code === 'DECISION_REQUIRED'));
});

test('J: null, absent price column, invalid numeric data and actual zero remain distinct', async () => {
  const inspected = inspectProducts(workbook([product({ Price: '0' }), product({ 'Variant ID': 'v2', Price: '' })]));
  assert.deepEqual(inspected.rows.map((r) => r.price), [0,null]);
  assert.equal(field(inspected, 'price').observed_count, 1);
  assert.equal(field(inspected, 'price').null_count, 1);
  const absent = workbook([product()], headers.filter((h) => h !== 'Price'));
  assert.equal(field(inspectProducts(absent), 'price').status, 'ABSENT');
  const { result } = await evaluate(workbook([product({ Price: 'invalid-secret-marker' })]));
  assert.ok(result.blockers.some((b) => b.code === 'FIELD_REPRESENTATION_INVALID'));
  assert.equal(JSON.stringify(result).includes('invalid-secret-marker'), false);
});

test('K: accepted NO_DATA/LOW_DATA empty workbooks cannot establish mandatory field coverage', async () => {
  for (const status of ['NO_DATA','LOW_DATA']) {
    const { result } = await evaluate(workbook([]), status);
    assert.ok(result.blockers.some((b) => b.code === 'FIELD_REPRESENTATION_INVALID' || b.code === 'FIELD_OBSERVATION_REQUIRED'));
    assert.ok(result.blockers.some((b) => b.requirement_id === 'validation_outcome_coverage'));
    assert.equal(result.datasets[3].coverage_status, 'BLOCKED');
  }
});

test('L: acquisition time remains provenance; no provider timestamp or freshness policy is invented', async () => {
  const { result, draft } = await evaluate();
  assert.ok(result.blockers.some((b) => b.requirement_id === 'freshness' && b.code === 'DECISION_REQUIRED'));
  assert.equal(result.selected_evidence[0].acquired_at, draft.selected_evidence[0].acquired_at);
  assert.equal(result.selected_evidence[0].observed_context, null);
});

test('M: multiple Jobs retain exact independent provenance, duplicate rows and immutable draft/artifact bytes', async () => {
  const f = fixture(); const bytes = workbook([product(),product()]);
  const first = add(f, 'first', bytes); const second = add(f, 'second', bytes);
  const draft = await f.persist([first,second]);
  const filename = path.join(f.root, 'packages', 'draft', 'BLOG_DRAFT.json'); const before = fs.readFileSync(filename);
  f.add('newer', 'ikas-products', 'PRODUCTS');
  const result = await f.evaluate();
  assert.deepEqual(result.selected_evidence, draft.selected_evidence);
  assert.deepEqual(result.field_checks.map((v) => [v.run_id,v.job_id,v.artifact_id,v.row_count]), [[first.run_id,first.job_id,first.artifact_id,2],[second.run_id,second.job_id,second.artifact_id,2]]);
  assert.deepEqual(fs.readFileSync(filename), before);
  assert.deepEqual(fs.readFileSync(path.join(f.root,'runs',first.run_id,'raw.json')), bytes);
  assert.ok(result.blockers.some((b) => b.requirement_id === 'multi_job_coverage'));
  assert.equal(result.delivery_readiness, 'NOT_EVALUATED');
});

test('invalid context, identity/schema and malformed bytes fail closed without exposing provider data', async () => {
  const invalidContext = await evaluate(workbook(), 'VALID', {});
  assert.ok(invalidContext.result.blockers.some((b) => b.code === 'EVIDENCE_INVALID' && b.requirement_id === 'ikas_request_context'));
  const missingIdentity = await evaluate(workbook([product()], headers.filter((h) => h !== 'Product ID')));
  assert.ok(missingIdentity.result.blockers.some((b) => b.code === 'FIELD_REPRESENTATION_INVALID'));
  const bad = await evaluate(Buffer.from('malformed synthetic provider bytes'));
  assert.ok(bad.result.blockers.some((b) => b.code === 'FIELD_REPRESENTATION_INVALID'));
});

test('a raw availability column remains unresolved when the legacy parser replaces it with derived variant availability', async () => {
  const columns = headers.filter((h) => !['Stock','Deleted','Variant active','Continue selling'].includes(h)).concat('Availability');
  const bytes = workbook([product({ Availability: 'unavailable' })], columns);
  const inspected = inspectProducts(bytes);
  assert.equal(field(inspected, 'availability').status, 'UNRESOLVED');
  assert.equal(inspected.rows[0].availability, 'UNKNOWN');
  assert.equal(inspected.rows[0].stock, null);
  const { result } = await evaluate(bytes);
  assert.ok(result.blockers.some((b) => b.requirement_id === 'availability' && b.code === 'DECISION_REQUIRED'));
});

test('blank observed names are not reconstructed and unsupported storefront URL representations fail safely', async () => {
  const blank = workbook([product({ 'Product title': '' })]);
  assert.equal(inspectProducts(blank).rows[0].product_name, null);
  assert.ok((await evaluate(blank)).result.blockers.some((b) => b.requirement_id === 'product_name' && b.code === 'FIELD_OBSERVATION_REQUIRED'));
  for (const url of ['relative-path', 'javascript:synthetic']) {
    const { result } = await evaluate(workbook([product({ 'Product URL': url })]));
    assert.ok(result.blockers.some((b) => b.code === 'FIELD_REPRESENTATION_INVALID'));
  }
});
