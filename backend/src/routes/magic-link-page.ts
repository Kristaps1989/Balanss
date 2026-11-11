import type { FastifyPluginAsync } from 'fastify';

import type { Config } from '../config';

const TOKEN = /^[A-Za-z0-9_-]{10,200}$/;

/**
 * GET /auth/open?token=… — the https link in the sign-in e-mail. Mail apps (Gmail in particular)
 * do not make custom-scheme links clickable, so the e-mail points here and this page hands the
 * token to the app. It only shows the token to the app; verifying happens in the app (single use).
 */
export const magicLinkPage: FastifyPluginAsync = async (app) => {
  const { config } = app.deps;
  app.get('/auth/open', async (req, reply) => {
    const token = (req.query as { token?: unknown }).token;
    reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .header('Referrer-Policy', 'no-referrer')
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'");
    if (typeof token !== 'string' || !TOKEN.test(token)) return reply.status(400).send(page(null, config));
    return reply.send(page(token, config));
  });
};

function page(token: string | null, config: Config): string {
  const body = token
    ? `<h1>Pieslēgšanās ZestWell</h1>
<p>Pieskaries pogai, lai atvērtu lietotni un pieslēgtos.</p>
<p><a class="btn" href="intent://auth?token=${token}#Intent;scheme=${config.appScheme};package=lv.balanss.app;end">Atvērt ZestWell</a></p>
<p class="small">Ja poga nestrādā (piemēram, iPhone), <a href="${config.appScheme}://auth?token=${token}">atver šo saiti</a>. Atver to tajā pašā telefonā, kurā ir instalēta lietotne.</p>
<p class="small">Saite ir derīga 15 minūtes un izmantojama vienu reizi.</p>`
    : `<h1>Saite nav derīga</h1>
<p>Pieprasi jaunu pieslēgšanās saiti lietotnē.</p>`;
  return `<!doctype html><html lang="lv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>ZestWell</title>
<meta name="color-scheme" content="light dark">
<style>:root{--bg:#F6F2EA;--card:#FFFFFF;--ink:#1F2420;--text2:#525852;--link:#2A6148;--btn:#2F6B4F;--on-btn:#FFFFFF}
@media (prefers-color-scheme:dark){:root{--bg:#121513;--card:#1C201D;--ink:#F2F1EC;--text2:#B8BCB6;--link:#7FD3A2;--btn:#6CCB94;--on-btn:#0E1A13}}
body{margin:0;font-family:Manrope,Arial,sans-serif;background:var(--bg);color:var(--ink);padding:24px 16px}
main{max-width:480px;margin:0 auto;background:var(--card);border-radius:24px;padding:28px}
h1{font-family:Fraunces,Georgia,serif;font-size:24px;margin:0 0 12px}p{font-size:16px;line-height:1.5;margin:0 0 20px}.small{font-size:14px;color:var(--text2);margin:0 0 8px}
a{color:var(--link)}.btn{display:inline-block;min-height:44px;box-sizing:border-box;background:var(--btn);color:var(--on-btn);text-decoration:none;font-weight:600;padding:14px 24px;border-radius:28px}</style>
</head><body><main>${body}</main></body></html>`;
}
