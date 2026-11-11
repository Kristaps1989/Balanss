import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { faviconSvg, layout } from './layout';
import { PAGES, notFoundBody } from './pages';

/**
 * Public website on the web domain (PUBLIC_WEB_URL, e.g. https://zestwell.app). The same Railway
 * service answers on api.zestwell.app and zestwell.app; these routes match only the web host, so
 * the API keeps its JSON 404s.
 */
export function siteHosts(webUrl: string): { host: string } {
  return { host: new URL(webUrl).hostname };
}

/** Our own CSP for the static pages: no scripts at all, inline styles and inline SVG only. */
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function html(reply: FastifyReply, body: string, status = 200) {
  return reply
    .status(status)
    .header('Content-Type', 'text/html; charset=utf-8')
    .header('Cache-Control', 'public, max-age=600')
    .header('Content-Security-Policy', CSP)
    .send(body);
}

export function renderNotFound(webUrl: string): string {
  return layout({ title: 'Lapa nav atrasta', description: 'Šāda lapa nav atrasta.', path: '/404', body: notFoundBody(), webUrl });
}

export const siteRoutes: FastifyPluginAsync = async (app) => {
  const webUrl = app.deps.config.publicWebUrl;
  const { host } = siteHosts(webUrl);
  const onSite = { constraints: { host } };

  for (const page of PAGES) {
    const rendered = layout({ ...page, webUrl, body: page.body() });
    app.get(page.path, onSite, async (_req, reply) => html(reply, rendered));
  }

  const favicon = faviconSvg();
  app.get('/favicon.svg', onSite, async (_req, reply) =>
    reply.header('Content-Type', 'image/svg+xml').header('Cache-Control', 'public, max-age=86400').send(favicon),
  );
  app.get('/favicon.ico', onSite, async (_req, reply) => reply.redirect('/favicon.svg', 301));
  app.get('/robots.txt', onSite, async (_req, reply) =>
    reply.header('Content-Type', 'text/plain; charset=utf-8').send(`User-agent: *\nAllow: /\nSitemap: ${webUrl}/sitemap.xml\n`),
  );
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(
    (p) => `  <url><loc>${webUrl}${p.path}</loc></url>`,
  ).join('\n')}\n</urlset>\n`;
  app.get('/sitemap.xml', onSite, async (_req, reply) => reply.header('Content-Type', 'application/xml; charset=utf-8').send(sitemap));
};
