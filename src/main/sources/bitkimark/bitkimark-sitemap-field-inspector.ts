import { parseBitkimarkSitemap } from './bitkimark-sitemap-parser';
import { createBitkimarkSitemapJobContext } from './bitkimark-sitemap-request';

export class SitemapContextError extends Error {
  constructor() { super('Sitemap evidence requires its accepted HTTP_XML context.'); }
}

export const inspectSitemapFields = (bytes: Uint8Array, requested_context: unknown, acquired_at: string | undefined) => {
  let context;
  try { context = createBitkimarkSitemapJobContext(requested_context); } catch { throw new SitemapContextError(); }
  // Match existing loader provenance: retrieval is acquisition time, not page observation time.
  if (acquired_at === undefined) throw new Error('Sitemap artifact acquisition time is unavailable.');
  const document = parseBitkimarkSitemap(bytes, {
    source_url: context.requested_url, expected_host: context.expected_host,
    parent_sitemap_url: context.parent_sitemap_url, retrieved_at: acquired_at,
  });
  return {
    rows: document.entries.map((entry) => ({ ...entry, document_kind: document.document_kind,
      source_url: document.source_url, parent_sitemap_url: document.parent_sitemap_url, retrieved_at: document.retrieved_at })),
    presence: document.entries.map(() => ({ url: true, page_type: false, title: false, status: false })),
    unsupported_fields: ['page_type', 'title', 'status'],
    unresolved_fields: document.document_kind === 'SITEMAP_INDEX' ? ['url'] : [],
  };
};
