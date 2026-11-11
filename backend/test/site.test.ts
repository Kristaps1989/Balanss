import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ANDROID_RELEASE } from '../src/site/download';
import { OWNER, ownerLine } from '../src/site/owner';
import { PAGES } from '../src/site/pages';
import { makeApp } from './helpers';

const WEB = 'zestwell.app';

describe('public website (zestwell.app)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await makeApp({ config: { publicWebUrl: `https://${WEB}` } }));
  });
  afterAll(() => app.close());

  it('names the controller; registration details appear only once they exist', () => {
    expect(OWNER.company).toBe('Zestwell');
    expect(ownerLine()).toEqual(OWNER.regNo ? expect.stringContaining(OWNER.regNo) : 'Zestwell (reģistrācija procesā)');
    for (const v of Object.values(OWNER)) expect(String(v)).not.toMatch(/TODO/);
  });

  it.each(PAGES.map((p) => [p.path, p.title]))('serves %s as Latvian HTML without scripts', async (url, title) => {
    const res = await app.inject({ url, headers: { host: WEB } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.body).toContain('<html lang="lv">');
    expect(res.body).toContain(title);
    expect(res.body).not.toMatch(/<script/i);
    // Old name allowed only in the repo URL and the "uninstall the old test build" hint.
    expect(res.body.replaceAll(ANDROID_RELEASE.url, '').replaceAll('ZestWell vai Balanss testa versija', '')).not.toContain('Balanss');
  });

  it('privacy policy names the controller, contact, AI provider, EU hosting and the supervisory authority', async () => {
    const body = (await app.inject({ url: '/privatums', headers: { host: WEB } })).body;
    for (const text of [ownerLine(), OWNER.email, 'Anthropic', 'Railway', 'Datu valsts inspekcij', '30 dienas', 'Health Connect']) {
      expect(body).toContain(text);
    }
  });

  it('account deletion page explains the in-app path and the e-mail route (Google Play data deletion URL)', async () => {
    const body = (await app.inject({ url: '/dzest-kontu', headers: { host: WEB } })).body;
    expect(body).toContain('Dzēst visus datus un kontu');
    expect(body).toContain(`mailto:${OWNER.email}`);
  });

  it('home page offers the Android download with version and checksum', async () => {
    const body = (await app.inject({ url: '/', headers: { host: WEB } })).body;
    expect(body).toContain(`href="${ANDROID_RELEASE.url}"`);
    expect(body).toContain(ANDROID_RELEASE.version);
    expect(ANDROID_RELEASE.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body).toContain(ANDROID_RELEASE.sha256);
  });

  it('serves favicon, robots.txt and sitemap', async () => {
    expect((await app.inject({ url: '/favicon.svg', headers: { host: WEB } })).headers['content-type']).toContain('image/svg+xml');
    expect((await app.inject({ url: '/robots.txt', headers: { host: WEB } })).body).toContain(`Sitemap: https://${WEB}/sitemap.xml`);
    expect((await app.inject({ url: '/sitemap.xml', headers: { host: WEB } })).body).toContain(`https://${WEB}/privatums`);
  });

  it('unknown pages on the website get an HTML 404; the API host keeps JSON', async () => {
    const page = await app.inject({ url: '/nav-tadas', headers: { host: WEB } });
    expect(page.statusCode).toBe(404);
    expect(page.headers['content-type']).toContain('text/html');
    const api = await app.inject({ url: '/nav-tadas', headers: { host: 'api.zestwell.app' } });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('pages are not served on the API host', async () => {
    const res = await app.inject({ url: '/privatums', headers: { host: 'api.zestwell.app' } });
    expect(res.statusCode).toBe(404);
  });
});
