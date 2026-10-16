const context = (job_key = 'synthetic', query = 'synthetic query') => ({
  task_id: 'serpapi-serp-snapshot', source_id: 'serpapi', source_mode: 'THIRD_PARTY_API',
  dataset_type: 'GOOGLE_SERP', job_key, query, country_code: 'TR', language_code: 'tr',
  device: 'desktop', engine: 'google', organic_limit: 10, snapshot_date: '2026-09-28',
});
const response = (q = 'synthetic query') => ({
  search_metadata: { status: 'Success', created_at: '2026-09-29 12:00:00 UTC', processed_at: '2026-09-29 12:00:01 UTC' },
  search_parameters: { q, gl: 'tr', hl: 'tr', device: 'desktop', engine: 'google', start: 0 },
  organic_results: [{ position: 3, title: 'Synthetic observed title', link: 'https://EXAMPLE.test/synthetic', domain: 'untrusted-domain.test' }],
});
module.exports = { context, response };
