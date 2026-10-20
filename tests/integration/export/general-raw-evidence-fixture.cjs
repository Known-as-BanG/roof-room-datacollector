const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

module.exports = async (buildRoot, workRoot, t, options = {}) => {
  const load = (name) => require(path.join(buildRoot, name));
  const { DesktopMultiSourceController } = load('main/app/desktop-multisource-controller.js');
  const { createProductionCollectionRuntime } = load('main/app/production-collection-runtime.js');
  const { initializeDatabase, getDatabasePath } = load('main/storage/database.js');
  const { StateRepository } = load('main/storage/state-repository.js');
  const { StorageManager } = load('main/storage/storage-manager.js');
  const { ProductionDataPackageLoader } = load('main/export/production-data-package-loader.js');
  const SOURCE = 'bitkimark-sitemap';
  const XML = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\r\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://bitkimark.com/blog/synthetic-raw</loc></url>\n</urlset>\r\n');
  const API_BODY = { rows: [{ keys: ['synthetic API query'], clicks: 0, impressions: 7, ctr: 0, position: 2 }],
  responseAggregationType: 'byProperty', native_marker: { preserved: 'raw JSON, not normalized rows' } };

  fs.mkdirSync(workRoot, { recursive: true });
  const root = options.root ?? fs.realpathSync(fs.mkdtempSync(path.join(workRoot, 'raw-export-')));
  fs.mkdirSync(root, { recursive: true });
  const directories = Object.fromEntries(['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads'].map((key) => [key, path.join(root, key)]));
  directories.app_data_root = root; directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');
  let repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = options.workspace ?? repository.createWorkspace({ workspace_name: 'Synthetic raw export' });
  const readiness = { getReadiness: async () => ({ readiness_status: 'READY' }) };
  const planner = new DesktopMultiSourceController({ repository, readiness, application_version: 'test' });
  const draft = await planner.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  draft.reusable_configuration = { sources: { [SOURCE]: { included: true, task_id: 'bitkimark-sitemap',
    sitemaps: ['blogs.xml', ...(options.mixed ? ['pages.xml'] : [])].map((name) => ({
      source_id: SOURCE, task_id: 'bitkimark-sitemap', source_mode: 'HTTP_XML',
      requested_url: `https://bitkimark.com/${name}`, expected_host: 'bitkimark.com', parent_sitemap_url: 'https://bitkimark.com/sitemap.xml',
    })) } } };
  const expectedRaw = new Map([[SOURCE, { bytes: options.empty ? Buffer.from('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>') : XML,
    media_type: 'application/xml', extension: '.xml', dataset_type: 'SITEMAP_URLS',
    filename: `bitkimark-sitemap-${sha('https://bitkimark.com/blogs.xml').slice(0, 12)}.xml` }]]);
  if (options.multi_source) {
    const importBytes = require('../blog-writing-packs/blog-v2-ikas-fixture.cjs').workbook();
    const filePath = path.join(root, 'selected-products.xlsx'); fs.writeFileSync(filePath, importBytes);
    repository.upsertSourceConnection({ workspace_id: workspace.workspace_id, source_id: 'google-search-console-query-page',
      credential_ref: 'synthetic-google', safe_metadata: { site_url: 'sc-domain:example.test' } });
    draft.reusable_configuration.sources['google-search-console-query'] = { included: true, site_url: 'sc-domain:example.test',
      date_ranges: [{ job_key: 'native-api-json', requested_date_start: '2026-09-01', requested_date_end: '2026-09-02' }] };
    draft.reusable_configuration.sources['ikas-products'] = { included: true, task_id: 'ikas-products-import', file_path: filePath };
    expectedRaw.set('google-search-console-query', { bytes: Buffer.from(JSON.stringify([API_BODY])),
      media_type: 'application/json', extension: '.json', dataset_type: 'QUERY', filename: 'gsc-query.json' });
    expectedRaw.set('ikas-products', { bytes: importBytes,
      media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx', dataset_type: 'PRODUCTS', filename: 'ikas-products.xlsx' });
    const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
    globalThis.fetch = async (url, request) => {
      if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'synthetic-token', expires_in: 3600 });
      assert.ok(url.includes(`/sites/${encodeURIComponent('sc-domain:example.test')}/searchAnalytics/query`), 'Unexpected URL must never reach a live provider');
      assert.deepEqual(JSON.parse(request.body).dimensions, ['query']);
      return Response.json(API_BODY);
    };
  }
  let started;
  if (options.low_data) {
    const queryGroup = { query_group_id: 'GT01', query_group_name: 'generic_commercial',
      queries: ['canlı bitki', 'online bitki', 'bitki satın al', 'bitki siparişi', 'saksılı bitki'] };
    started = repository.createRunFromJobPlans({ workspace_id: workspace.workspace_id, application_version: 'test',
      configuration_snapshot: { config_version: 1, source_id: 'google-trends', source_mode: 'GOOGLE_TRENDS_UI',
        country_code: 'TR', language_code: null, requested_date_start: '2024-08-18', requested_date_end: '2026-08-17',
        category_id: null, category_name: 'All Categories', search_type: 'Web Search', selection_type: 'Search Term',
        dataset_type: 'INTEREST_OVER_TIME', selected_query_groups: [queryGroup] },
      job_plans: [{ source_id: 'google-trends', job_key: 'GT01', query_group_id: 'GT01', source_context: { query_group: queryGroup } }] });
  } else {
    const review = await planner.reviewDraft(draft); assert.equal(review.can_start, true);
    started = await planner.startDraft(review.reviewed_draft);
  }
  const bytes = options.low_data
    ? Buffer.from(fs.readFileSync(path.join(__dirname, '../../fixtures/google-trends/interest-over-time/gt01-valid-5-queries.csv'), 'utf8')
      .replace(/^(\d{4}-\d{2}-\d{2}),.*$/gm, '$1,0,0,0,0,0'))
    : options.empty ? Buffer.from('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>') : XML;
  const runtime = createProductionCollectionRuntime({ repository, directories,
    credentialStore: { readCredential: async () => {
      if (options.multi_source) return JSON.stringify({ client_id: 'synthetic-client', refresh_token: 'synthetic-refresh' });
      throw new Error('No credentials needed');
    } },
    bitkimarkFetcher: async (url) => ({ ok: !options.failed && !url.endsWith('pages.xml'),
      status: options.failed || url.endsWith('pages.xml') ? 503 : 200, url,
      headers: { get: () => 'application/xml; charset=utf-8' }, arrayBuffer: async () => bytes }),
    googleTrendsSource: { id: 'google-trends',
      checkReadiness: async () => ({ source_id: 'google-trends', readiness_status: 'READY', checked_at: new Date().toISOString(), message: null }),
      collect: async () => {
      assert.equal(options.low_data, true, 'Only the native LOW_DATA fixture may acquire Trends evidence');
      return { result_type: 'ARTIFACT_PRODUCED', preferred_filename: 'GT01_TR_24M_interest_over_time.csv', media_type: 'text/csv', bytes };
    } },
  });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);
  repository.close(); repository = new StateRepository(getDatabasePath(directories));
  const storage = new StorageManager(directories);
  const loader = new ProductionDataPackageLoader(repository, storage);
  const controller = new DesktopMultiSourceController({ repository, readiness, application_version: 'test',
    package_directory: directories.runs, load_export: (id) => loader.loadRunExport(id) });
  if (options.failed || options.mixed) {
    await assert.rejects(controller.exportRun(started.run.run_id, 'ALL'), /not terminal/i);
    await controller.cancelRun(started.run.run_id);
  }
  const jobs = repository.listJobs(started.run.run_id);
  const job = jobs.find((item) => item.accepted_artifact_id);
  const artifact = job && repository.getArtifact(job.accepted_artifact_id);
  const rawPath = artifact && storage.resolveRunRelativePath(started.run.run_id, artifact.relative_path);
  const metadataPath = job && path.join(directories.runs, started.run.run_id, SOURCE, 'metadata', `${job.job_key}.metadata.json`);
  return { root, directories, repository, storage, loader, controller, workspace, run_id: started.run.run_id, jobs, job, artifact, rawPath, metadataPath, bytes, expectedRaw };

};
