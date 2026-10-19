import type { KeywordPlannerRow } from '../../../shared/google-api';
import { requireApiObject, requireArray } from '../google-api/api-helpers';
import { normalizeKeywordPlanner } from './keyword-planner-adapter';
import { createKeywordPlannerJobContext } from './keyword-planner-request';
import { parseKeywordPlannerManualCsv } from './keyword-planner-csv-parser';
import { KEYWORD_PLANNER_CSV_SOURCE_MODE, KEYWORD_PLANNER_CSV_TASK_ID } from './keyword-planner-csv-request';

export class KeywordPlannerEvidenceError extends Error {
  constructor(readonly requirement_id: 'keyword_planner_request_context' | 'observed_keyword') {
    super('Keyword Planner evidence cannot establish the required source meaning.');
  }
}

// Inspect accepted bytes only; acquisition and import normalization remain unchanged.
export const inspectKeywordPlannerFields = (source_id: string, bytes: Uint8Array, requested_context: unknown, publication_at?: string): {
  rows: KeywordPlannerRow[];
  presence: Array<Record<string, boolean>>;
  limitations: Array<'currency_context' | 'manual_csv_scope' | 'competition_semantics'>;
  derivations?: Record<string, { expression: string; approved_for_blog: boolean }>;
  publication_issues?: Array<{ code: 'DECISION_REQUIRED' | 'FIELD_OBSERVATION_REQUIRED' | 'EVIDENCE_INVALID'; requirement_id: string; actual: string }>;
  publication_time_context?: Record<string, unknown>;
} => {
  const publication_issues: Array<{ code: 'DECISION_REQUIRED' | 'FIELD_OBSERVATION_REQUIRED' | 'EVIDENCE_INVALID'; requirement_id: string; actual: string }> = [];
  if (publication_at !== undefined) publication_issues.push({ code: 'DECISION_REQUIRED', requirement_id: 'keyword_planner_calendar_context',
    actual: 'The approved Planner contract does not establish which calendar timezone maps a publication UTC instant to the last completed month; host timezone cannot be substituted.' });
  if (source_id === 'google-keyword-planner-csv') {
    const context = requireApiObject(requested_context, 'Keyword Planner import context');
    // Accepted provenance sanitizes file_path; never reopen the original import path.
    if (context.source_id !== source_id || context.source_mode !== KEYWORD_PLANNER_CSV_SOURCE_MODE
      || context.task_id !== KEYWORD_PLANNER_CSV_TASK_ID) {
      throw new KeywordPlannerEvidenceError('keyword_planner_request_context');
    }
    const parsed = parseKeywordPlannerManualCsv(bytes);
    return { rows: parsed.rows, presence: parsed.rows.map(() => ({
      returned_keyword: true, avg_monthly_searches: true, competition: true,
      top_of_page_bid_low: true, top_of_page_bid_high: true,
    })), limitations: ['manual_csv_scope'], ...(publication_at === undefined ? {} : {
      publication_issues, publication_time_context: { reference_at: publication_at, calendar_timezone: null },
    }) };
  }
  if (source_id !== 'google-keyword-planner') throw new Error('Unsupported Keyword Planner representation.');
  let context;
  try {
    context = createKeywordPlannerJobContext(requested_context);
  } catch {
    throw new KeywordPlannerEvidenceError('keyword_planner_request_context');
  }
  const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const rawRows = requireArray(requireApiObject(body, 'Keyword Planner response').results, 'Keyword Planner results')
    .map((row) => requireApiObject(row, 'Keyword Planner result'));
  if (rawRows.some((row) => typeof row.text !== 'string' || row.text.trim().length === 0)) {
    throw new KeywordPlannerEvidenceError('observed_keyword');
  }
  const rows = normalizeKeywordPlanner(body, context.group_id, context.keywords);
  if (publication_at !== undefined) {
    const start = Date.parse(`${context.requested_date_start}T00:00:00.000Z`);
    const first = new Date(start);
    const expectedMonths = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1)))
      .map((date) => `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`);
    if (rows.some((row) => expectedMonths.some((month) => row.monthly_history.filter((observation) => `${observation.year}-${observation.month}` === month && observation.searches !== null).length !== 1))) {
      publication_issues.push({ code: 'FIELD_OBSERVATION_REQUIRED', requirement_id: 'keyword_planner_monthly_observations',
        actual: 'Each selected keyword requires actual, nonduplicated observations for all twelve requested months; aggregates and missing/null values cannot fill them.' });
    }
    if (rows.some((row) => new Set(row.monthly_history.map((item) => `${item.year}-${item.month}`)).size !== row.monthly_history.length)) {
      publication_issues.push({ code: 'EVIDENCE_INVALID', requirement_id: 'keyword_planner_monthly_observations', actual: 'Monthly observations contain duplicate month identities.' });
    }
  }
  const presence = rawRows.map((row) => {
    const metrics = row.keywordMetrics == null ? {} : requireApiObject(row.keywordMetrics, 'Keyword Planner metrics');
    return Object.fromEntries(Object.entries({ returned_keyword: 'text', avg_monthly_searches: 'avgMonthlySearches',
      competition: 'competition', top_of_page_bid_low: 'lowTopOfPageBidMicros', top_of_page_bid_high: 'highTopOfPageBidMicros',
    }).map(([field, provider]) => [field, Object.hasOwn(field === 'returned_keyword' ? row : metrics, provider)]));
  });
  return { rows, presence, derivations: {
    top_of_page_bid_low: { expression: 'observed lowTopOfPageBidMicros / 1000000', approved_for_blog: true },
    top_of_page_bid_high: { expression: 'observed highTopOfPageBidMicros / 1000000', approved_for_blog: true },
    change_3_month: { expression: 'normalizeKeywordPlanner.change_3_month from observed monthly_history only', approved_for_blog: true },
    change_yoy: { expression: 'normalizeKeywordPlanner.change_yoy from observed monthly_history only', approved_for_blog: true },
  }, ...(publication_at === undefined ? {} : { publication_issues, publication_time_context: {
    reference_at: publication_at, calendar_timezone: null, requested_date_start: context.requested_date_start, requested_date_end: context.requested_date_end,
  } }), limitations: ['currency_context',
    ...(rows.some((row) => row.competition !== null && !['LOW', 'MEDIUM', 'HIGH'].includes(row.competition))
      ? ['competition_semantics' as const] : []),
  ] };
};
