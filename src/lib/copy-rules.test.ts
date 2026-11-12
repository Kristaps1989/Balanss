import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The app never criticises: facts and suggestions only, progress before what is
 * left. This scans every user-facing source (app screens, components, template
 * copy, seed data) for judgemental or deficit phrasing.
 */
const ROOT = path.resolve(__dirname, '../..');
const SOURCES = ['app', 'src', 'backend/src/ai/tone-templates.ts', 'backend/src/ai/question-templates.ts', 'backend/src/ai/food-ideas.ts', 'backend/src/seed-data.ts', 'backend/src/services'];
const BANNED: [RegExp, string][] = [
  [/virs mērķa/i, 'over-target judgement'],
  [/pārsnie(dz|gt|gā)/i, '"exceeded" framing'],
  [/par daudz/i, '"too much"'],
  [/\b(pie)?trūkst\b/i, 'deficit framing ("trūkst") — say what is there first, then "vēl …"'],
  [/pietrūkstoš/i, 'deficit framing'],
  [/\bslikt(a|i|s|u|ā)\b/i, '"bad" judgement'],
  [/izgāz/i, '"failed" judgement'],
];

function files(p: string): string[] {
  const abs = path.join(ROOT, p);
  if (fs.statSync(abs).isFile()) return [abs];
  return fs.readdirSync(abs, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => path.join(abs, f));
}

describe('copy rules', () => {
  const all = SOURCES.flatMap(files);

  it('scans the user-facing sources', () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it.each(BANNED)('no %s in user-facing copy (%s)', (re) => {
    const hits = all.flatMap((f) =>
      fs
        .readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${path.relative(ROOT, f)}:${i + 1}` }))
        .filter(({ line }) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && re.test(line))
        .map(({ at, line }) => `${at}: ${line.trim().slice(0, 120)}`),
    );
    expect(hits).toEqual([]);
  });
});

describe('brand name', () => {
  it('the old working name "Balanss" is not shown anywhere in the app UI', () => {
    const hits = ['app', 'src'].flatMap(files).flatMap((f) =>
      fs
        .readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${path.relative(ROOT, f)}:${i + 1}` }))
        // Internal identifiers stay: the balanss:// link scheme and storage keys ('balanss.theme').
        .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line) && /balans[su]/i.test(line.replace(/balanss:\/\/|'balanss\.[\w.]+'/g, '')))
        .map(({ at, line }) => `${at}: ${line.trim().slice(0, 100)}`),
    );
    expect(hits).toEqual([]);
  });
});
