const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Missing buildRoot or workRoot');
const load = (file) => require(path.join(buildRoot, file));
const { resolveDesktopDatePolicy } = load('shared/desktop-run-resolution.js');
const { DESKTOP_TASK_CATALOG } = load('desktop-task-catalog.js');
const { DesktopMultiSourceController } = load('main/app/desktop-multisource-controller.js');
const { createProductionCollectionRuntime } = load('main/app/production-collection-runtime.js');
const { GoogleApiRuntimeFactory } = load('main/sources/google-api/google-api-runtime.js');
const { initializeDatabase, getDatabasePath } = load('main/storage/database.js');
const { StateRepository } = load('main/storage/state-repository.js');
const { fetchGscQuery, fetchGscQueryPage } = load('main/sources/google-search-console/query-page-adapter.js');

const SOURCE = 'google-search-console-query-page';
const QUERY_SOURCE = 'google-search-console-query';
const POLICY_CURRENT = 'TODAY_MINUS_90_TO_YESTERDAY';
const POLICY_LONG = 'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY';

const expectedContextCurrent = {
  task_id: 'gsc-current-90-days', source_id: SOURCE,
  reference_date: '2026-09-17', date_policy: POLICY_CURRENT,
  requested_date_start: '2026-06-19', requested_date_end: '2026-09-16',
  site_url: 'sc-domain:bitkimark.com',
};

const credentials = {
  readCredential: async () => JSON.stringify({ client_id: 'fixture', refresh_token: 'fixture-refresh', developer_token: 'fixture-developer' }),
};

test('GSC-TASK-CATALOG-001: desktop catalog exposes the new 28-day GSC tasks', () => {
  const queryTask =
    DESKTOP_TASK_CATALOG.find(
      (task) =>
        task.task_id ===
        'gsc-query-current-previous-28-days',
    );

  assert.ok(
    queryTask,
    'GSC Query current + previous 28-day task must be present.',
  );
  assert.equal(
    queryTask.source_id,
    'google-search-console-query',
  );

  const queryPageTask =
    DESKTOP_TASK_CATALOG.find(
      (task) =>
        task.task_id ===
        'gsc-query-page-current-28-days',
    );

  assert.ok(
    queryPageTask,
    'GSC Query × Page current 28-day task must be present.',
  );
  assert.equal(
    queryPageTask.source_id,
    'google-search-console-query-page',
  );
  assert.equal(
    queryPageTask.date_policy,
    'TODAY_MINUS_28_TO_YESTERDAY',
  );
});

test('GSC-QUERY-READINESS-001: blocked Query Quick Run points to the Search Console Workspace setup', async (t) => {
  const root = path.join(workRoot, 'query-readiness');
  const directories = Object.fromEntries(
    ['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads']
      .map((key) => [key, path.join(root, key)]),
  );
  directories.app_data_root = root;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  assert.equal(initializeDatabase(directories).status, 'READY');

  const repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({
    workspace_name: 'GSC blocked readiness test',
  });
  const controller = new DesktopMultiSourceController({
    repository,
    application_version: 'test',
    readiness: {
      getReadiness: async (_workspaceId, sourceId) => ({
        readiness_status:
          sourceId === QUERY_SOURCE
            ? 'CONFIGURATION_REQUIRED'
            : 'READY',
      }),
    },
  });

  const draft = await controller.createDraft({
    workspace_id: workspace.workspace_id,
    origin: { kind: 'BLANK' },
  });
  const queryCard = draft.source_cards.find(
    (card) => card.source_id === QUERY_SOURCE,
  );
  assert.ok(queryCard);
  assert.equal(queryCard.readiness_status, 'CONFIGURATION_REQUIRED');
  assert.equal(
    queryCard.readiness_remediation.kind,
    'CONNECT_SOURCE',
  );
  assert.equal(
    queryCard.readiness_remediation.label,
    'Configure Google Search Console',
  );
});

test('GSC-DATE-28-001: current 28 days resolves to exactly 28 complete days ending yesterday', () => {
  const range = resolveDesktopDatePolicy(
    'TODAY_MINUS_28_TO_YESTERDAY',
    '2026-09-17',
  );

  assert.deepEqual(range, {
    reference_date: '2026-09-17',
    date_policy: 'TODAY_MINUS_28_TO_YESTERDAY',
    requested_date_start: '2026-08-20',
    requested_date_end: '2026-09-16',
  });
});

test('GSC-DATE-28-002: previous 28 days immediately precedes the current 28-day window', () => {
  const range = resolveDesktopDatePolicy(
    'TODAY_MINUS_56_TO_TODAY_MINUS_29',
    '2026-09-17',
  );

  assert.deepEqual(range, {
    reference_date: '2026-09-17',
    date_policy: 'TODAY_MINUS_56_TO_TODAY_MINUS_29',
    requested_date_start: '2026-07-23',
    requested_date_end: '2026-08-19',
  });
});

test('GSC-COUNTRY-FILTER-002: every paginated request retains country=TUR', async () => {
  const input = {
    site_url: 'sc-domain:bitkimark.com',
    start_date: '2026-08-20',
    end_date: '2026-09-16',
    country_filter: 'TUR',
  };

  const expectedFilter = [{
    groupType: 'and',
    filters: [{
      dimension: 'country',
      operator: 'equals',
      expression: 'TUR',
    }],
  }];

  for (const [fetch, dimensions, keys] of [
    [fetchGscQuery, ['query'], ['ficus']],
    [fetchGscQueryPage, ['query', 'page'], ['ficus', 'https://bitkimark.com/ficus']],
  ]) {
    const requests = [];

    await fetch(input, async (request) => {
      requests.push(request);

      return {
        status: 200,
        body: {
          rows: request.body.startRow === 0
            ? Array.from({ length: 25000 }, () => ({
                keys,
                clicks: 1,
                impressions: 2,
                ctr: 0.5,
                position: 3,
              }))
            : [],
        },
      };
    }, 2);

    assert.deepEqual(
      requests.map((request) => request.body.startRow),
      [0, 25000],
      'A full first page must trigger a second page.',
    );

    for (const request of requests) {
      assert.deepEqual(request.body.dimensions, dimensions);
      assert.equal(request.body.startDate, input.start_date);
      assert.equal(request.body.endDate, input.end_date);
      assert.deepEqual(
        request.body.dimensionFilterGroups,
        expectedFilter,
        'Each page must retain the exact TUR country filter.',
      );
    }
  }
});

test('GSC-COUNTRY-LEGACY-001: missing country scope preserves historical unfiltered requests', async () => {
  const requests = [];
  const input = {
    site_url: 'sc-domain:bitkimark.com',
    start_date: '2026-08-20',
    end_date: '2026-09-16',
  };

  for (const fetch of [fetchGscQuery, fetchGscQueryPage]) {
    await fetch(input, async (request) => {
      requests.push(request);
      return { status: 200, body: { rows: [] } };
    });
  }

  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map((request) => request.body.dimensions),
    [['query'], ['query', 'page']],
  );
  assert.deepEqual(
    requests.map((request) => request.body.dimensionFilterGroups),
    [undefined, undefined],
    'Legacy requests without a persisted country filter must not acquire a new filter.',
  );
});

test('GSC-COUNTRY-FILTER-001: both GSC grains request country=TUR without changing dimensions', async () => {
  const requests = [];
  const requester = async (request) => {
    requests.push(request);
    return { status: 200, body: { rows: [] } };
  };

  const input = {
    site_url: 'sc-domain:bitkimark.com',
    start_date: '2026-08-20',
    end_date: '2026-09-16',
    country_filter: 'TUR',
  };

  await fetchGscQuery(input, requester);
  await fetchGscQueryPage(input, requester);

  assert.equal(requests.length, 2);

  assert.deepEqual(
    requests.map((request) => request.body.dimensions),
    [['query'], ['query', 'page']],
    'GSC request dimensions must remain provider-native.',
  );

  const expectedCountryFilter = [{
    groupType: 'and',
    filters: [{
      dimension: 'country',
      operator: 'equals',
      expression: 'TUR',
    }],
  }];

  for (const request of requests) {
    assert.equal(request.body.startDate, input.start_date);
    assert.equal(request.body.endDate, input.end_date);
    assert.equal(request.body.startRow, 0);
    assert.deepEqual(
      request.body.dimensionFilterGroups,
      expectedCountryFilter,
      'Every GSC request must explicitly restrict results to TUR.',
    );
  }
});

test('GSC-QUERY-001: query-only adapter requests only the query dimension', async () => {
  const requests = [];

  const result = await fetchGscQuery(
    {
      site_url: 'sc-domain:bitkimark.com',
      start_date: '2026-08-20',
      end_date: '2026-09-16',
    },
    async (request) => {
      requests.push(request);
      return {
        status: 200,
        body: {
          rows: [
            {
              keys: ['ficus'],
              clicks: 3,
              impressions: 10,
              ctr: 0.3,
              position: 2.5,
            },
          ],
        },
      };
    },
  );

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.dimensions, ['query']);
  assert.deepEqual(result.rows, [
    {
      query: 'ficus',
      clicks: 3,
      impressions: 10,
      ctr: 0.3,
      position: 2.5,
    },
  ]);
});

test('GSC-QUERY-SOURCE-001: query source reuses the existing GSC connection and produces query-only raw artifact', async () => {
  const requestedConnectionSourceIds = [];
  const requests = [];

  const factory = new GoogleApiRuntimeFactory(
    {
      getSourceConnection: (_workspaceId, sourceId) => {
        requestedConnectionSourceIds.push(sourceId);

        if (sourceId !== SOURCE) {
          return null;
        }

        return {
          workspace_id: 'workspace-1',
          source_id: SOURCE,
          credential_ref: 'fixture-credential',
          safe_metadata: {
            site_url: 'sc-domain:bitkimark.com',
          },
        };
      },
      upsertSourceConnection: () => {},
    },
    credentials,
    async (request) => {
      if (request.url === 'https://oauth2.googleapis.com/token') {
        return {
          status: 200,
          body: {
            access_token: 'fixture-access',
            expires_in: 3600,
          },
        };
      }

      requests.push(request);

      return {
        status: 200,
        body: {
          rows: [
            {
              keys: ['ficus'],
              clicks: 3,
              impressions: 10,
              ctr: 0.3,
              position: 2.5,
            },
          ],
        },
      };
    },
  );

  const source = factory.createSearchConsoleQuerySource({
    workspace_id: 'workspace-1',
  });

  assert.equal(source.id, QUERY_SOURCE);
  assert.deepEqual(source.datasetTypes, ['QUERY']);

  const result = await source.collect({
    source_id: QUERY_SOURCE,
    source_context: {
      requested_date_start: '2026-08-20',
      requested_date_end: '2026-09-16',
    },
  });

  assert.deepEqual(
    requestedConnectionSourceIds,
    [SOURCE],
    'Query source must reuse the existing GSC Workspace connection.',
  );

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.dimensions, ['query']);

  assert.equal(result.result_type, 'ARTIFACT_PRODUCED');
  assert.equal(result.preferred_filename, 'gsc-query.json');
});

test('GSC-QUERY-REVIEW-001: Query Review resolves current and previous 28-day windows as two jobs', async (t) => {
  const directories = Object.fromEntries(
    ['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads']
      .map((key) => [key, path.join(workRoot, `query-review-${key}`)]),
  );
  directories.app_data_root = path.join(workRoot, 'query-review');
  directories.runs = path.join(directories.data, 'runs');

  for (const directory of Object.values(directories)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  assert.equal(initializeDatabase(directories).status, 'READY');

  const repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());

  const workspace = repository.createWorkspace({
    workspace_name: 'GSC Query 28-day test',
  });

  let clock = new Date('2026-09-17T12:00:00.000Z');

  const controller = new DesktopMultiSourceController({
    repository,
    application_version: 'test',
    now: () => clock,
    readiness: {
      getReadiness: async () => ({
        readiness_status: 'READY',
      }),
    },
  });

  const draft = await controller.createDraft({
    workspace_id: workspace.workspace_id,
    origin: { kind: 'BLANK' },
  });

  draft.reusable_configuration = {
    sources: {
      [QUERY_SOURCE]: {
        included: true,
        task_id: 'gsc-query-current-previous-28-days',
      },
    },
  };

  const review = await controller.reviewDraft(draft);

  assert.ok(
    review.reviewed_draft,
    'GSC Query Review must produce an absolute-date reviewed draft.',
  );

  const reviewedSource =
    review.reviewed_draft.resolved_configuration.sources[QUERY_SOURCE];

  assert.equal(
    reviewedSource.country_filter,
    'TUR',
    'New GSC Review must freeze the requested country in resolved configuration.',
  );

  assert.deepEqual(reviewedSource.date_ranges, [
    {
      job_key: 'gsc-query-current-28',
      task_id: 'gsc-query-current-previous-28-days',
      period: 'CURRENT_28_DAYS',
      requested_date_start: '2026-08-20',
      requested_date_end: '2026-09-16',
    },
    {
      job_key: 'gsc-query-previous-28',
      task_id: 'gsc-query-current-previous-28-days',
      period: 'PREVIOUS_28_DAYS',
      requested_date_start: '2026-07-23',
      requested_date_end: '2026-08-19',
    },
  ]);

  assert.equal(review.job_count, 2);
  assert.equal(review.can_start, true);

  const started = await controller.startDraft(review.reviewed_draft);

  assert.equal(started.jobs.length, 2);
  assert.ok(
    started.jobs.every((job) => job.source_context.country_filter === 'TUR'),
    'Both persisted GSC Jobs must retain their reviewed country scope.',
  );
  assert.deepEqual(
    started.jobs.map((job) => job.job_key).sort(),
    ['gsc-query-current-28', 'gsc-query-previous-28'],
  );
});

test('GSC-QUERY-PAGE-28-001: Query × Page Review resolves current 28 complete days', async (t) => {
  const directories = Object.fromEntries(
    ['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads']
      .map((key) => [key, path.join(workRoot, `query-page-28-${key}`)]),
  );
  directories.app_data_root = path.join(workRoot, 'query-page-28');
  directories.runs = path.join(directories.data, 'runs');

  for (const directory of Object.values(directories)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  assert.equal(initializeDatabase(directories).status, 'READY');

  const repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());

  const workspace = repository.createWorkspace({
    workspace_name: 'GSC Query Page 28-day test',
  });
  const selectedProperty = 'sc-domain:example.test';
  repository.upsertSourceConnection({
    workspace_id: workspace.workspace_id,
    source_id: SOURCE,
    credential_ref: 'fixture-credential',
    safe_metadata: { site_url: selectedProperty },
  });

  const controller = new DesktopMultiSourceController({
    repository,
    application_version: 'test',
    now: () => new Date('2026-09-17T12:00:00.000Z'),
    readiness: {
      getReadiness: async () => ({
        readiness_status: 'READY',
      }),
    },
  });

  const draft = await controller.createDraft({
    workspace_id: workspace.workspace_id,
    origin: { kind: 'BLANK' },
  });

  draft.reusable_configuration = {
    sources: {
      [SOURCE]: {
        included: true,
        task_id: 'gsc-query-page-current-28-days',
        date_policy: 'TODAY_MINUS_28_TO_YESTERDAY',
        site_url: selectedProperty,
      },
    },
  };

  const review = await controller.reviewDraft(draft);

  assert.ok(
    review.reviewed_draft,
    'GSC Query × Page 28-day Review must produce an absolute-date artifact.',
  );

  const reviewedSource =
    review.reviewed_draft.resolved_configuration.sources[SOURCE];

  assert.equal(
    reviewedSource.country_filter,
    'TUR',
    'Query Page Review must freeze the requested country.',
  );

  assert.deepEqual(reviewedSource.date_ranges, [
    {
      job_key: 'gsc-query-page-current-28-days',
      task_id: 'gsc-query-page-current-28-days',
      requested_date_start: '2026-08-20',
      requested_date_end: '2026-09-16',
    },
  ]);

  assert.equal(review.job_count, 1);
  assert.equal(review.can_start, true);
  assert.equal(reviewedSource.site_url, selectedProperty);

  const started = await controller.startDraft(review.reviewed_draft);
  assert.equal(started.jobs[0].source_context.site_url, selectedProperty);
});

test('GSC-REVIEW-BOUND-001: Review → atomic persisted Job → production requester survives next-day Start and reopen (Current 90 Days)', async (t) => {
  const directories = Object.fromEntries(['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads'].map(key => [key, path.join(workRoot, key)]));
  directories.app_data_root = workRoot;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');
  let repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'GSC test' });
  repository.upsertSourceConnection({ workspace_id: workspace.workspace_id, source_id: SOURCE, credential_ref: 'fixture-credential', safe_metadata: { site_url: 'sc-domain:bitkimark.com' } });

  let clock = new Date('2026-09-17T12:00:00.000Z');
  const controller = new DesktopMultiSourceController({ repository, application_version: 'test', now: () => clock, readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) } });

  const draft = await controller.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  draft.reusable_configuration = { sources: { [SOURCE]: { included: true, task_id: 'gsc-current-90-days', date_policy: POLICY_CURRENT, site_url: 'sc-domain:bitkimark.com' } } };

  const review = await controller.reviewDraft(draft);
  assert.ok(review.reviewed_draft, 'GSC Review must return an absolute-date artifact');
  assert.equal(review.can_start, true);
  const reviewed = structuredClone(review.reviewed_draft);
  const reviewedSource = reviewed.resolved_configuration.sources[SOURCE];
  assert.equal(reviewedSource.site_url, 'sc-domain:bitkimark.com');
  // 90 days before Sept 17 2026 is June 19 2026
  assert.equal(reviewedSource.date_ranges[0].requested_date_start, '2026-06-19');
  assert.equal(reviewedSource.date_ranges[0].requested_date_end, '2026-09-16');

  clock = new Date('2026-09-18T12:00:00.000Z');
  const started = await controller.startDraft(review.reviewed_draft);

  repository.close();
  repository = new StateRepository(getDatabasePath(directories));
  const jobs = repository.listJobs(started.run.run_id);
  assert.equal(jobs[0].source_context.requested_date_start, '2026-06-19');
  assert.equal(jobs[0].source_context.site_url, 'sc-domain:bitkimark.com');
  assert.equal(
    jobs[0].source_context.country_filter,
    'TUR',
    'Reopened persisted Job must retain the country scope.',
  );

  const requests = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
    assert.match(url, /www\.googleapis\.com\/webmasters\/v3\/sites/);
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    return Response.json({ rows: [{ keys: ['ficus', 'https://bitkimark.com/ficus'], clicks: 1, impressions: 2, ctr: 0.5, position: 1 }] });
  };

  const runtime = createProductionCollectionRuntime({ repository, directories, credentialStore: credentials, googleTrendsSource: { id: 'google-trends' } });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);


  const body = requests[0].body;
  assert.ok(
    requests[0].url.includes(`/sites/${encodeURIComponent('sc-domain:bitkimark.com')}/searchAnalytics/query`),
    'The native Query × Page request must use the frozen Domain property identity.',
  );
  assert.equal(body.startDate, '2026-06-19', 'Actual GSC request must contain the exactly reviewed start date');
  assert.equal(body.endDate, '2026-09-16', 'Actual GSC request must contain the exactly reviewed end date');
  assert.deepEqual(body.dimensions, ['query', 'page'], 'Dimensions must remain unchanged');
  assert.deepEqual(body.dimensionFilterGroups, [{
    groupType: 'and',
    filters: [{
      dimension: 'country',
      operator: 'equals',
      expression: 'TUR',
    }],
  }], 'Production request must use the persisted Job country scope.');
});

test('GSC-SOURCE-CONTEXT-001: source uses explicit context and rejects unsupported scope', async () => {
  const requests = [];
  const factory = new GoogleApiRuntimeFactory({ getSourceConnection: () => ({ source_id: SOURCE, credential_ref: 'fixture', safe_metadata: { site_url: 'sc-domain:bitkimark.com' } }) }, credentials, async request => {
    if (request.url === 'https://oauth2.googleapis.com/token') return { status: 200, body: { access_token: 'fixture', expires_in: 3600 } };
    requests.push(request);
    return { status: 200, body: { rows: [] } };
  });

  const source = factory.createSearchConsoleSource({ workspace_id: 'fixture', start_date: '1999-01-01', end_date: '1999-01-02' });
  const context = { source_id: SOURCE, source_context: expectedContextCurrent };

  assert.equal((await source.collect(context)).result_type, 'ARTIFACT_PRODUCED');
  assert.equal(requests[0].body.startDate, '2026-06-19');
  assert.equal(requests[0].body.endDate, '2026-09-16');

  const second = { ...expectedContextCurrent, requested_date_start: '2026-09-01', requested_date_end: '2026-09-17' };
  await source.collect({ ...context, source_context: second });
  assert.equal(requests[1].body.startDate, '2026-09-01');
  assert.equal(requests[1].body.endDate, '2026-09-17');

  const requestsBeforeMissingProperty = requests.length;
  const missingPropertyContext = { ...expectedContextCurrent };
  delete missingPropertyContext.site_url;
  const missingPropertyResult = await source.collect({
    ...context,
    source_context: missingPropertyContext,
  });
  assert.equal(missingPropertyResult.result_type, 'FAILED');
  assert.equal(requests.length, requestsBeforeMissingProperty);

  const legacyContext = { ...missingPropertyContext };
  delete legacyContext.task_id;
  const legacyResult = await source.collect({
    ...context,
    source_context: legacyContext,
  });
  assert.equal(legacyResult.result_type, 'ARTIFACT_PRODUCED');
  assert.ok(
    requests.at(-1).url.includes(`/sites/${encodeURIComponent('sc-domain:bitkimark.com')}/searchAnalytics/query`),
    'Taskless legacy Jobs must retain their configured-property compatibility.',
  );

  const requestsBeforeInvalidCountry = requests.length;
  const invalidCountry = await source.collect({
    ...context,
    source_context: {
      ...expectedContextCurrent,
      country_filter: 'USA',
    },
  });
  assert.equal(invalidCountry.result_type, 'FAILED');
  assert.equal(
    invalidCountry.error_code,
    'SOURCE_CONFIGURATION_INVALID',
  );
  assert.equal(
    requests.length,
    requestsBeforeInvalidCountry,
    'Invalid country scope must fail before contacting GSC.',
  );

  for (const invalid of [
    { ...expectedContextCurrent, requested_date_start: '2026-02-30' },
    { ...expectedContextCurrent, requested_date_start: '2026-09-18' },
    { ...expectedContextCurrent, requested_date_start: '2026-09-16', requested_date_end: '2026-09-10' }, // reversed
    {},
  ]) {
    assert.equal((await source.collect({ ...context, source_context: invalid })).result_type, 'FAILED');
  }
});

test('GSC-REVIEW-BOUND-002: Long 16 Months reviewed request binding', async (t) => {
  const directories = Object.fromEntries(['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads'].map(key => [key, path.join(workRoot, key)]));
  directories.app_data_root = workRoot;
  directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');
  const repository = new StateRepository(getDatabasePath(directories));
  t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'GSC test 2' });
  repository.upsertSourceConnection({ workspace_id: workspace.workspace_id, source_id: SOURCE, credential_ref: 'fixture-credential', safe_metadata: { site_url: 'sc-domain:bitkimark.com' } });

  let clock = new Date('2026-09-17T12:00:00.000Z');
  const controller = new DesktopMultiSourceController({ repository, application_version: 'test', now: () => clock, readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) } });

  const draft = await controller.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  draft.reusable_configuration = { sources: { [SOURCE]: { included: true, task_id: 'gsc-long-16-months', date_policy: POLICY_LONG, site_url: 'sc-domain:bitkimark.com' } } };

  const review = await controller.reviewDraft(draft);
  const reviewedSource = review.reviewed_draft.resolved_configuration.sources[SOURCE];
  // 16 months before Sept 2026 is May 2025. Start of May 2025 to yesterday (Sept 16 2026)
  assert.equal(reviewedSource.date_ranges[0].requested_date_start, '2025-05-17');
  assert.equal(reviewedSource.date_ranges[0].requested_date_end, '2026-09-16');

  const started = await controller.startDraft(review.reviewed_draft);

  const requests = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    return Response.json({ rows: [{ keys: ['long', 'https://bitkimark.com/long'], clicks: 1, impressions: 2, ctr: 0.5, position: 1 }] });
  };

  const runtime = createProductionCollectionRuntime({ repository, directories, credentialStore: credentials, googleTrendsSource: { id: 'google-trends' } });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);

  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.includes(`/sites/${encodeURIComponent('sc-domain:bitkimark.com')}/searchAnalytics/query`));
  const body = requests[0].body;
  assert.equal(body.startDate, '2025-05-17');
  assert.equal(body.endDate, '2026-09-16');
});

test('GSC-DATE-COVERAGE-001: companion final dates survive native validation, metadata persistence and SQLite restart', async (t) => {
  const root = path.join(workRoot, 'final-date-coverage');
  const directories = Object.fromEntries(['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads'].map(key => [key, path.join(root, key)]));
  directories.app_data_root = root; directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');
  let repository = new StateRepository(getDatabasePath(directories)); t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'Synthetic date coverage' });
  const selectedProperty = 'https://example.test/Prefix/';
  repository.upsertSourceConnection({ workspace_id: workspace.workspace_id, source_id: SOURCE, credential_ref: 'fixture', safe_metadata: { site_url: selectedProperty } });
  const instant = '2026-10-01T10:00:00.000Z';
  t.mock.timers.enable({ apis: ['Date'], now: new Date(instant) });
  const controller = new DesktopMultiSourceController({ repository, application_version: 'test', now: () => new Date(instant), readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) } });
  const draft = await controller.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  draft.reusable_configuration = { sources: { [SOURCE]: { included: true, site_url: selectedProperty, task_id: 'gsc-query-page-current-28-days', date_policy: 'TODAY_MINUS_28_TO_YESTERDAY' } } };
  const review = await controller.reviewDraft(draft); assert.equal(review.can_start, true);
  const started = await controller.startDraft(review.reviewed_draft);
  const queryPage = { rows: [{ keys: ['synthetic', 'https://example.test/page'], clicks: 0, impressions: 1, ctr: 0, position: 2 }] };
  const requests = []; const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'synthetic', expires_in: 3600 });
    const body = JSON.parse(options.body); requests.push({ url, body });
    if (body.dimensions[0] !== 'date') return Response.json(queryPage);
    const start = Date.parse(`${body.startDate}T00:00:00.000Z`);
    return Response.json({ rows: Array.from({ length: 28 }, (_, index) => ({ keys: [new Date(start + index * 86400000).toISOString().slice(0, 10)], clicks: 0, impressions: 1, ctr: 0, position: 2 })) });
  };
  const runtime = createProductionCollectionRuntime({ repository, directories, credentialStore: credentials, googleTrendsSource: { id: 'google-trends' } });
  await runtime.orchestrator.runUntilBlocked(started.run.run_id);
  repository.close(); repository = new StateRepository(getDatabasePath(directories));
  const [job] = repository.listJobs(started.run.run_id);
  assert.equal(job.validation_status, 'VALID'); assert.ok(job.accepted_artifact_id);
  const [attempt] = repository.listAttempts(job.job_id); const artifact = repository.getArtifact(job.accepted_artifact_id);
  const filename = path.join(directories.runs, job.run_id, SOURCE, 'metadata', `${job.job_key}.metadata.json`);
  const metadata = JSON.parse(fs.readFileSync(filename));
  assert.equal(metadata.attempt_id, attempt.attempt_id); assert.equal(metadata.raw_artifact_id, artifact.artifact_id);
  assert.equal(metadata.validation_status, 'VALID'); assert.deepEqual(metadata.source_context, job.source_context);
  assert.equal(job.source_context.site_url, selectedProperty);
  assert.ok(metadata.acquisition_metadata);
  const proof = metadata.acquisition_metadata.gsc_date_coverage;
  assert.equal(proof.response_received_at, instant);
  assert.equal(proof.request.site_url, selectedProperty);
  assert.equal(proof.request.search_type, 'web'); assert.equal(proof.request.data_state, 'final');
  assert.deepEqual([proof.request.start_date, proof.request.end_date], [job.source_context.requested_date_start, job.source_context.requested_date_end]);
  assert.equal(proof.raw_response.rows.length, 28);
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.url.includes(`/sites/${encodeURIComponent(selectedProperty)}/searchAnalytics/query`)));
  assert.equal(requests[1].body.dataState, 'final');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directories.runs, job.run_id, artifact.relative_path))), [queryPage]);
});

test('GSC-PROPERTY-BINDING-001: desktop rejects missing, invalid, changed and conflicting property selection', async (t) => {
  const root = path.join(workRoot, 'property-binding');
  const directories = Object.fromEntries(['config', 'data', 'database', 'browser_profiles', 'logs', 'public_downloads'].map(key => [key, path.join(root, key)]));
  directories.app_data_root = root; directories.runs = path.join(directories.data, 'runs');
  for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
  assert.equal(initializeDatabase(directories).status, 'READY');
  const repository = new StateRepository(getDatabasePath(directories)); t.after(() => repository.close());
  const workspace = repository.createWorkspace({ workspace_name: 'Synthetic explicit GSC property' });
  const setProperty = (site_url) => repository.upsertSourceConnection({ workspace_id: workspace.workspace_id, source_id: SOURCE, credential_ref: 'fixture', safe_metadata: { site_url } });
  setProperty('sc-domain:example.test');
  const controller = new DesktopMultiSourceController({ repository, application_version: 'test', now: () => new Date('2026-10-01T10:00:00.000Z'), readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) }, credential_availability: { hasCredential: async () => true } });
  const draft = await controller.createDraft({ workspace_id: workspace.workspace_id, origin: { kind: 'BLANK' } });
  const config = { included: true, task_id: 'gsc-query-page-current-28-days', date_policy: 'TODAY_MINUS_28_TO_YESTERDAY' };
  draft.reusable_configuration = { sources: { [SOURCE]: config } };
  for (const site_url of [undefined, '', 'not-a-property', 'sc-domain:', 'https://', ' sc-domain:example.test', 'sc-domain:other.test']) {
    const input = structuredClone(draft); if (site_url !== undefined) input.reusable_configuration.sources[SOURCE].site_url = site_url;
    assert.equal((await controller.reviewDraft(input)).can_start, false, `Invalid/missing selection: ${site_url}`);
  }
  config.site_url = 'sc-domain:example.test';
  for (const date_ranges of [[{ job_key: 'conflict', site_url: 'sc-domain:other.test', requested_date_start: '2026-09-03', requested_date_end: '2026-09-30' }]]) {
    const conflict = structuredClone(draft); conflict.reusable_configuration.sources[SOURCE].date_ranges = date_ranges;
    assert.equal((await controller.reviewDraft(conflict)).can_start, false, 'Managed reconstruction cannot erase a conflicting Job property.');
  }
  for (const task of DESKTOP_TASK_CATALOG.filter((entry) => entry.source_id === SOURCE)) {
    const input = structuredClone(draft); Object.assign(input.reusable_configuration.sources[SOURCE], { task_id: task.task_id, date_policy: task.date_policy });
    const reviewed = await controller.reviewDraft(input); assert.equal(reviewed.can_start, true, task.task_id);
    assert.equal(reviewed.reviewed_draft.resolved_configuration.sources[SOURCE].site_url, config.site_url);
  }
  const review = await controller.reviewDraft(draft); assert.equal(review.can_start, true);
  for (const target of ['resolved_configuration', 'reusable_configuration']) {
    const changed = structuredClone(review.reviewed_draft); changed[target].sources[SOURCE].site_url = 'sc-domain:other.test';
    await assert.rejects(controller.startDraft(changed), /property|site|ready|start/i);
  }
  const conflict = structuredClone(review.reviewed_draft); conflict.resolved_configuration.sources[SOURCE].date_ranges[0].site_url = 'sc-domain:other.test';
  await assert.rejects(controller.startDraft(conflict), /property|site|ready|start/i);
  setProperty('https://example.test/Prefix/');
  await assert.rejects(controller.startDraft(review.reviewed_draft), /property|site|ready|start/i);
  assert.equal(repository.listRuns(workspace.workspace_id).length, 0);
  const view = await controller.getWorkspaceConnections(workspace.workspace_id);
  assert.equal(view.find((entry) => entry.source_id === SOURCE).site_url, 'https://example.test/Prefix/');
});
