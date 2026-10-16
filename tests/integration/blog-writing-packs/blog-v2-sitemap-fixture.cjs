const root = 'https://bitkimark.com/sitemap.xml';
const acquiredAt = '2026-10-01T10:00:00.000Z';
const context = (requested_url = 'https://bitkimark.com/blogs.xml') => ({ source_id: 'bitkimark-sitemap', task_id: 'bitkimark-sitemap', source_mode: 'HTTP_XML', requested_url, expected_host: 'bitkimark.com', parent_sitemap_url: requested_url === root ? null : root });
const escape = (value) => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
// Configured host is required by the source; all page paths/XML here are synthetic.
const xml = (entries = [{ url: 'https://bitkimark.com/blog/synthetic-roofroom-page', lastmod: '2026-09-01' }], kind = 'urlset') => Buffer.from(`<${kind} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((row) => {
  const tag = kind === 'sitemapindex' ? 'sitemap' : 'url';
  return `<${tag}>${Object.hasOwn(row,'url') ? `<loc>${escape(row.url ?? '')}</loc>` : ''}${Object.hasOwn(row,'lastmod') ? `<lastmod>${escape(row.lastmod ?? '')}</lastmod>` : ''}${row.extra ?? ''}</${tag}>`;
}).join('')}</${kind}>`);
module.exports = { root, acquiredAt, context, xml };
