const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const [buildRoot, workRoot] = process.argv.slice(2);
const evaluatorFile = path.join(buildRoot, 'main/blog-writing-packs/blog-writing-pack-v2-readiness.js');
const { evaluateBlogWritingPackV2Readiness } = fs.existsSync(evaluatorFile) ? require(evaluatorFile) : {};
const contractFile = path.join(buildRoot, 'shared/blog-writing-pack-v2-readiness.js');
const { BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS } = fs.existsSync(contractFile) ? require(contractFile) : {};
const { assembleBlogWritingPackV2Draft } = require(path.join(buildRoot, 'main/blog-writing-packs/blog-writing-pack-assembler.js'));
const { BlogWritingPackStore } = require(path.join(buildRoot, 'main/blog-writing-packs/blog-writing-pack-store.js'));
const { ProductionDataPackageLoader } = require(path.join(buildRoot, 'main/export/production-data-package-loader.js'));

const families = [
  ['google-ads-search-terms', 'SEARCH_TERMS'],
  ['google-search-console-query-page', 'QUERY_PAGE'],
  ['google-keyword-planner', 'KEYWORD_HISTORICAL_METRICS'],
  ['ikas-products', 'PRODUCTS'], ['bitkimark-sitemap', 'SITEMAP_URLS'],
  ['serpapi', 'GOOGLE_SERP'], ['google-analytics-4', 'GA4_CONTENT_PERFORMANCE'],
];
// Explicit synthetic endpoints approve no production period or unresolved family semantics.
const syntheticRequirements = () => ({
  requirements_version: 1, recipe_version: 2,
  datasets: Object.fromEntries(families.map(([, type]) => [type, {
    open_decisions: [], required_source_changes: [],
  }])),
  keyword_planner_scope: { requested_date_start: '2025-08-01', requested_date_end: '2026-07-31', country_code: 'TR', language_code: 'tr', keyword_plan_network: 'GOOGLE_SEARCH' },
  ads_requested_dates: { start_date: '2026-09-01', end_date: '2026-09-28' },
  gsc_requested_dates: { start_date: '2026-09-01', end_date: '2026-09-28' },
});
fs.mkdirSync(workRoot, { recursive: true });
const fixture = () => {
  const root = fs.mkdtempSync(path.join(workRoot, 'readiness-'));
  const runs = new Map(); const jobs = new Map(); const artifacts = new Map();
  const attempts = new Map(); const validations = new Map();
  const repository = {
    getRun: (id) => runs.get(id) ?? null,
    listJobs: (id) => [...jobs.values()].filter((job) => job.run_id === id),
    getArtifact: (id) => artifacts.get(id) ?? null,
    listAttempts: (id) => [...attempts.values()].filter((attempt) => attempt.job_id === id),
    getValidationSummary: (id) => validations.get(id) ?? null,
  };
  const loader = new ProductionDataPackageLoader(repository, {
    resolveRunRelativePath: (id, relative) => path.join(root, 'runs', id, relative),
  });
  const store = new BlogWritingPackStore(path.join(root, 'packages'));
  const add = (suffix, source_id = families[0][0], dataset_type = families[0][1]) => {
    const run_id = `run_${suffix}`; const job_id = `job_${suffix}`; const artifact_id = `artifact_${suffix}`;
    const raw = source_id === 'google-ads-search-terms' ? [{
      search_term: 'synthetic', campaign: 'Synthetic', ad_group: 'Synthetic',
      impressions: 10, clicks: 0, ctr: 0, cost_micros: 0, conversions: null, conversion_value: null,
    }] : source_id === 'google-search-console-query-page' ? [{ rows: [{
      keys: ['synthetic', 'https://example.test/page'], clicks: 0, impressions: 10, ctr: 0, position: 2,
    }] }] : source_id === 'google-keyword-planner' ? { results: [{ text: 'synthetic', keywordMetrics: { avgMonthlySearches: 0, competition: 'MEDIUM', lowTopOfPageBidMicros: null, highTopOfPageBidMicros: 0 } }] } : { fixture: suffix };
    const bytes = source_id === 'ikas-products' ? require('./blog-v2-ikas-fixture.cjs').workbook() : source_id === 'bitkimark-sitemap' ? require('./blog-v2-sitemap-fixture.cjs').xml() : Buffer.from(JSON.stringify(raw));
    fs.mkdirSync(path.join(root, 'runs', run_id), { recursive: true });
    fs.writeFileSync(path.join(root, 'runs', run_id, 'raw.json'), bytes);
    runs.set(run_id, { run_id, workspace_id: 'workspace_one', run_status: 'COMPLETED' });
    jobs.set(job_id, {
      run_id, job_id, source_id, job_key: suffix, execution_status: 'COMPLETED',
      accepted_artifact_id: artifact_id, validation_status: 'VALID',
      source_context: source_id === 'google-keyword-planner' ? {
        source_id, dataset_type, task_id: 'keyword-planner-historical-metrics', source_mode: 'OFFICIAL_API',
        group_id: 'synthetic', group_name: 'Synthetic', keywords: ['synthetic'],
        ...syntheticRequirements().keyword_planner_scope,
      } : source_id === 'ikas-products' ? require('./blog-v2-ikas-fixture.cjs').context() : source_id === 'bitkimark-sitemap' ? require('./blog-v2-sitemap-fixture.cjs').context() : { source_id, dataset_type, requested_date_start: '2026-09-01', requested_date_end: '2026-09-28' },
    });
    artifacts.set(artifact_id, {
      artifact_id, run_id, job_id, source_id, attempt_number: 1, artifact_kind: 'RAW_SOURCE_FILE',
      artifact_state: 'ACCEPTED', sha256: createHash('sha256').update(bytes).digest('hex'),
      byte_size: bytes.length, filename: 'raw.json', relative_path: 'raw.json',
      created_at: '2026-10-01T10:00:00.000Z', media_type: 'application/json',
    });
    attempts.set(`attempt_${suffix}`, { attempt_id: `attempt_${suffix}`, job_id, attempt_number: 1,
      execution_status: 'COMPLETED', candidate_artifact_id: artifact_id, validation_id: `validation_${suffix}` });
    validations.set(`validation_${suffix}`, { validation_id: `validation_${suffix}`, run_id, job_id,
      artifact_id, validation_status: 'VALID' });
    return { run_id, job_id, artifact_id };
  };
  const persist = async (selections) => {
    const draft = await assembleBlogWritingPackV2Draft({ package_id: 'draft', application_version: '1.0.0',
      created_at: '2026-10-15T12:00:00.000Z', selection: { recipe_version: 2, workspace_id: 'workspace_one', selections },
    }, { repository, loader });
    await store.saveDraft(draft);
    return draft;
  };
  const evaluate = (requirements = syntheticRequirements()) => evaluateBlogWritingPackV2Readiness({
    package_id: 'draft', workspace_id: 'workspace_one', requirements,
  }, { store, repository, loader });
  return { root, store, runs, jobs, artifacts, attempts, validations, add, persist, evaluate };
};


module.exports = { fixture, families, syntheticRequirements, BLOG_WRITING_PACK_V2_CURRENT_REQUIREMENTS };
