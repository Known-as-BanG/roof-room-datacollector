const assert = require('node:assert/strict');
const path = require('node:path');
const [buildRoot] = process.argv.slice(2);
if (!buildRoot) throw new Error('Expected compiled build root.');
const { GoogleAdsSearchTermsSource } = require(path.join(buildRoot, 'main/sources/google-ads/google-ads-sources.js'));
const { createFetchApiRequester } = require(path.join(buildRoot, 'main/sources/google-api/api-helpers.js'));
const { fetchGscQueryPage } = require(path.join(buildRoot, 'main/sources/google-search-console/query-page-adapter.js'));
const { fetchSearchTerms, normalizeSearchTerms } = require(path.join(buildRoot, 'main/sources/google-ads/search-terms-adapter.js'));
const { fetchKeywordPlanner } = require(path.join(buildRoot, 'main/sources/google-ads/keyword-planner-adapter.js'));
(async () => {
  let gscCalls = 0;
  const gsc = await fetchGscQueryPage({ site_url: 'sc-domain:bitkimark.com', start_date: '2026-06-12', end_date: '2026-09-09' }, async ({ body }) => { gscCalls += 1; return { status: 200, body: gscCalls === 1 ? { rows: Array.from({ length: 25000 }, (_, i) => ({ keys: [`q${i}`, `https://bitkimark.com/p${i}`], clicks: i, impressions: i + 1, ctr: null, position: 3.5 })) } : { rows: [{ keys: ['q-last', 'https://bitkimark.com/last'], clicks: 0, impressions: 0, ctr: 0, position: null }] } }; });
  assert.equal(gscCalls, 2); assert.equal(gsc.rows.length, 25001); assert.equal(gsc.rows[0].query, 'q0');
  const canonicalAdsBody = [{
    results: [{
      searchTermView: { searchTerm: 'ficus', status: 'NONE' },
      campaign: { id: '1', name: 'Search Campaign', advertisingChannelType: 'SEARCH' },
      adGroup: { id: '2', name: 'Ficus Group' },
      segments: {
        keyword: {
          adGroupCriterion: 'customers/123/adGroupCriteria/2~3',
          info: { text: 'ficus plant', matchType: 'PHRASE' },
        },
        searchTermMatchType: 'NEAR_PHRASE',
        date: '2026-09-01',
      },
      metrics: {
        averageCpc: '1250000',
        costMicros: '0',
        impressions: '2',
        clicks: '1',
        ctr: '0.5',
        conversions: '0',
        conversionsValue: null,
      },
    }],
  }];
  const ads = await fetchSearchTerms({ customer_id: '123', query: 'SELECT search_term_view.search_term FROM search_term_view' }, async () => ({ status: 200, body: canonicalAdsBody }));
  assert.equal(ads.raw, canonicalAdsBody, 'Canonical raw response must remain untouched');
  assert.equal(ads.rows[0].search_term, 'ficus');
  assert.equal(ads.rows[0].keyword, 'ficus plant');
  assert.equal(ads.rows[0].match_type, 'NEAR_PHRASE');
  assert.equal(ads.rows[0].campaign, 'Search Campaign');
  assert.equal(ads.rows[0].ad_group, 'Ficus Group');
  assert.equal(ads.rows[0].average_cpc, 1.25); assert.equal(ads.rows[0].cost, 0);
  const legacyAds = normalizeSearchTerms([
    {
      search_term: 'historical accepted artifact',
      average_cpc_micros: '0',
      cost_micros: null,
      impressions: '0',
      clicks: null,
    },
  ]);
  assert.equal(legacyAds[0].search_term, 'historical accepted artifact');
  assert.equal(legacyAds[0].average_cpc, 0);
  assert.equal(legacyAds[0].cost, null);
  const planner = await fetchKeywordPlanner(
    {
      customer_id: '123',
      group_id: 'KWP-FICUS',
      keywords: ['ficus', 'ficus çeşitleri'],
      requested_date_start: '2025-09-01',
      requested_date_end: '2026-08-31',
      country_code: 'TR',
      language_code: 'tr',
      keyword_plan_network: 'GOOGLE_SEARCH',
    },
    async () => ({
      status: 200,
      body: {
        results: [
          {
            text: 'ficus',
            keywordMetrics: {
              avgMonthlySearches: '100',
              competition: 'LOW',
              competitionIndex: null,
              lowTopOfPageBidMicros: '500000',
              highTopOfPageBidMicros: null,
              monthlySearchVolumes: [
                {
                  year: '2026',
                  month: 'JUNE',
                  monthlySearches: '100',
                },
                {
                  year: '2026',
                  month: 'JULY',
                  monthlySearches: '120',
                },
                {
                  year: '2026',
                  month: 'AUGUST',
                  monthlySearches: '150',
                },
              ],
            },
          },
        ],
      },
    }),
  );
  assert.equal(planner.rows[0].top_of_page_bid_low, 0.5); assert.equal(planner.rows[0].top_of_page_bid_high, null); assert.equal(planner.rows[0].monthly_history[0].searches, 100);
  assert.equal(
    planner.rows[0].change_3_month,
    50,
    '3 month change must compare the latest month with two months prior.',
  );

  const zeroBaselinePlanner = await fetchKeywordPlanner(
    {
      customer_id: '123',
      group_id: 'KWP-ZERO',
      keywords: ['zero baseline'],
      requested_date_start: '2025-09-01',
      requested_date_end: '2026-08-31',
      country_code: 'TR',
      language_code: 'tr',
      keyword_plan_network: 'GOOGLE_SEARCH',
    },
    async () => ({
      status: 200,
      body: {
        results: [
          {
            text: 'zero baseline',
            keywordMetrics: {
              monthlySearchVolumes: [
                {
                  year: '2026',
                  month: 'JUNE',
                  monthlySearches: '0',
                },
                {
                  year: '2026',
                  month: 'JULY',
                  monthlySearches: '10',
                },
                {
                  year: '2026',
                  month: 'AUGUST',
                  monthlySearches: '20',
                },
              ],
            },
          },
        ],
      },
    }),
  );

  assert.equal(
    zeroBaselinePlanner.rows[0].change_3_month,
    null,
    '3 month change must remain null when the comparison baseline is zero.',
  );

  const yoyPlanner = await fetchKeywordPlanner(
    {
      customer_id: '123',
      group_id: 'KWP-YOY',
      keywords: ['year over year'],
      requested_date_start: '2025-08-01',
      requested_date_end: '2026-08-31',
      country_code: 'TR',
      language_code: 'tr',
      keyword_plan_network: 'GOOGLE_SEARCH',
    },
    async () => ({
      status: 200,
      body: {
        results: [
          {
            text: 'year over year',
            keywordMetrics: {
              monthlySearchVolumes: [
                {
                  year: '2025',
                  month: 'AUGUST',
                  monthlySearches: '100',
                },
                {
                  year: '2026',
                  month: 'JUNE',
                  monthlySearches: '120',
                },
                {
                  year: '2026',
                  month: 'JULY',
                  monthlySearches: '130',
                },
                {
                  year: '2026',
                  month: 'AUGUST',
                  monthlySearches: '150',
                },
              ],
            },
          },
        ],
      },
    }),
  );

  assert.equal(
    yoyPlanner.rows[0].change_yoy,
    50,
    'YoY change must compare the latest month with the same month in the previous year.',
  );

  const yoyZeroBaselinePlanner = await fetchKeywordPlanner(
    {
      customer_id: '123',
      group_id: 'KWP-YOY-ZERO',
      keywords: ['yoy zero baseline'],
      requested_date_start: '2025-08-01',
      requested_date_end: '2026-08-31',
      country_code: 'TR',
      language_code: 'tr',
      keyword_plan_network: 'GOOGLE_SEARCH',
    },
    async () => ({
      status: 200,
      body: {
        results: [
          {
            text: 'yoy zero baseline',
            keywordMetrics: {
              monthlySearchVolumes: [
                {
                  year: '2025',
                  month: 'AUGUST',
                  monthlySearches: '0',
                },
                {
                  year: '2026',
                  month: 'AUGUST',
                  monthlySearches: '25',
                },
              ],
            },
          },
        ],
      },
    }),
  );

  assert.equal(
    yoyZeroBaselinePlanner.rows[0].change_yoy,
    null,
    'YoY change must remain null when the previous-year baseline is zero.',
  );

  const collectionContext = {
    run_id: 'run-diagnostic-test',
    job_id: 'job-diagnostic-test',
    attempt_id: 'attempt-diagnostic-test',
    attempt_number: 1,
    source_id: 'google-ads-search-terms',
    job_key: 'search-terms-1',
    query_group_id: null,
    requested_configuration: null,
    source_context: {
      task_id: 'google-ads-search-terms',
      source_id: 'google-ads-search-terms',
      source_mode: 'search_term_view',
      campaign_type: 'SEARCH',
      requested_date_start: '2026-10-01',
      requested_date_end: '2026-10-12',
    },
  };
  const mockProviderResponse = (status, body, requestId) => ({
    status,
    headers: {
      get(name) {
        if (name === 'content-type') return 'application/json';
        return name === 'request-id' ? requestId : null;
      },
    },
    arrayBuffer: async () => Buffer.from(JSON.stringify(body)),
  });
  const collectFailure = async (status, body, requestId = null) => {
    const requester = createFetchApiRequester(async () =>
      mockProviderResponse(status, body, requestId));
    const source = new GoogleAdsSearchTermsSource('123', requester);
    return source.collect(collectionContext);
  };
  const googleAdsFailure = (status, detail, requestId) => ({
    error: {
      code: status,
      message: 'PRIVATE_PROVIDER_MESSAGE_MUST_NOT_ESCAPE',
      status: detail.status,
      details: [{
        '@type': 'type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure',
        requestId,
        errors: [{
          errorCode: detail.errorCode,
          message: 'PRIVATE_ERROR_MESSAGE_MUST_NOT_ESCAPE',
        }],
      }],
    },
  });

  const invalidRequest = await collectFailure(400, googleAdsFailure(
    400,
    { status: 'INVALID_ARGUMENT', errorCode: { queryError: 'UNRECOGNIZED_FIELD' } },
    'request-invalid-42',
  ));
  assert.equal(invalidRequest.result_type, 'FAILED');
  assert.match(invalidRequest.error_code, /GOOGLE_ADS_API_FAILED_HTTP_400_INVALID_REQUEST/u);
  assert.match(invalidRequest.error_code, /^[A-Z][A-Z0-9_]{0,63}$/u);
  assert.match(invalidRequest.message, /GoogleAdsFailure\.QueryError\.UNRECOGNIZED_FIELD/u);
  assert.match(invalidRequest.message, /request ID request-invalid-42/u);
  assert.equal(JSON.stringify(invalidRequest).includes('PRIVATE_'), false);

  const apiConfiguration = await collectFailure(403, googleAdsFailure(
    403,
    { status: 'PERMISSION_DENIED', errorCode: { authorizationError: 'CUSTOMER_NOT_ENABLED' } },
    'request-config-7',
  ));
  assert.equal(apiConfiguration.result_type, 'FAILED');
  assert.match(apiConfiguration.error_code, /HTTP_403_API_CONFIGURATION_ERROR/u);
  assert.match(apiConfiguration.message, /AuthorizationError\.CUSTOMER_NOT_ENABLED/u);
  assert.match(apiConfiguration.message, /request ID request-config-7/u);
  assert.equal(JSON.stringify(apiConfiguration).includes('PRIVATE_'), false);

  const projectAccess = await collectFailure(403, googleAdsFailure(
    403,
    { status: 'PERMISSION_DENIED', errorCode: { authorizationError: 'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION' } },
    'request-project-8',
  ));
  assert.match(projectAccess.error_code, /HTTP_403_API_CONFIGURATION_ERROR/u);
  assert.match(projectAccess.message, /AuthorizationError\.CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION/u);

  const authorizationFailure = await collectFailure(403, googleAdsFailure(
    403,
    { status: 'PERMISSION_DENIED', errorCode: { authorizationError: 'USER_PERMISSION_DENIED' } },
    'request-authz-5',
  ));
  assert.match(authorizationFailure.error_code, /HTTP_403_AUTHORIZATION_ERROR/u);
  assert.match(authorizationFailure.message, /AuthorizationError\.USER_PERMISSION_DENIED/u);

  const authenticationFailure = await collectFailure(401, googleAdsFailure(
    401,
    { status: 'UNAUTHENTICATED', errorCode: { authenticationError: 'OAUTH_TOKEN_REVOKED' } },
    'request-auth-3',
  ));
  assert.match(authenticationFailure.error_code, /HTTP_401_AUTHENTICATION_ERROR/u);
  assert.match(authenticationFailure.message, /AuthenticationError\.OAUTH_TOKEN_REVOKED/u);

  const rateLimited = await collectFailure(429, googleAdsFailure(
    429,
    { status: 'RESOURCE_EXHAUSTED', errorCode: { quotaError: 'RESOURCE_EXHAUSTED' } },
    null,
  ), 'request-rate-9');
  assert.match(rateLimited.error_code, /HTTP_429_RATE_LIMIT/u);
  assert.match(rateLimited.message, /request ID request-rate-9/u);

  const providerUnavailable = await collectFailure(503, {
    error: {
      code: 503,
      status: 'UNAVAILABLE',
      message: 'PRIVATE_PROVIDER_MESSAGE_MUST_NOT_ESCAPE',
    },
  });
  assert.equal(providerUnavailable.error_code, 'GOOGLE_ADS_API_FAILED_HTTP_503');
  assert.equal(JSON.stringify(providerUnavailable).includes('PRIVATE_'), false);

  const networkFailure = await new GoogleAdsSearchTermsSource(
    '123',
    createFetchApiRequester(async () => {
      throw new Error('PRIVATE_NETWORK_DETAIL_MUST_NOT_ESCAPE');
    }),
  ).collect(collectionContext);
  assert.equal(networkFailure.result_type, 'FAILED');
  assert.match(networkFailure.error_code, /GOOGLE_ADS_API_FAILED_NETWORK_FAILURE/u);
  assert.match(networkFailure.error_code, /^[A-Z][A-Z0-9_]{0,63}$/u);
  assert.equal(JSON.stringify(networkFailure).includes('PRIVATE_'), false);

  await assert.rejects(() => fetchSearchTerms({ customer_id: '123', query: 'x' }, async () => ({ status: 401, body: { error: 'unauthorized' } })));
  console.log('PASS GOOGLE-API-001: GSC pagination and Google Ads Search Terms/Keyword Planner normalization preserve raw responses and provider-native null/micros semantics');
})();
