import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { LeisureResponse, Pantry, PantryScanResponse } from '../../../shared/api';
import { LEISURE_GENRES } from '../../../shared/leisure';
import { badRequest, parse } from '../errors';
import { suggestLeisure } from '../services/leisure';
import { getPantry, savePantry } from '../services/pantry';
import { getUser } from '../services/users';

const LeisureBody = z
  .object({
    kind: z.enum(['movie', 'book', 'event']),
    genre: z.string().max(30),
    where: z.enum(['cinema', 'go3', 'any']).optional(),
    when: z.enum(['today', 'weekend']).optional(),
  })
  .strict()
  .refine((b) => LEISURE_GENRES[b.kind].some((g) => g.key === b.genre), { message: 'unknown genre', path: ['genre'] });

const PantryBody = z.object({ items: z.array(z.string().max(60)).max(60) }).strict();
const ScanBody = z.object({ imageBase64: z.string().min(100).max(8_000_000) }).strict();

function mediaType(b64: string): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const head = Buffer.from(b64.slice(0, 24), 'base64');
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
  if (head[0] === 0x89 && head[1] === 0x50) return 'image/png';
  if (head.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/** Pantry ("Kas ir mājās") and free-time suggestions ("Brīvais laiks"). */
export const leisureRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.deps;

  app.get('/pantry', async (req): Promise<Pantry> => getPantry(db, req.userId, app.deps.now()));

  app.put('/pantry', async (req): Promise<Pantry> => {
    const { items } = parse(PantryBody, req.body);
    return savePantry(db, req.userId, items, app.deps.now());
  });

  // Photo → ingredient names. Nothing is stored: the user reviews the list and saves it with PUT /pantry.
  app.post('/pantry/scan', { bodyLimit: 8_500_000 }, async (req): Promise<PantryScanResponse> => {
    const { imageBase64 } = parse(ScanBody, req.body);
    const type = mediaType(imageBase64);
    if (!type) throw badRequest('unsupported_image', 'Use a JPEG, PNG or WebP photo');
    return { items: await app.deps.ai.food.scanPantry(imageBase64, type, req.log) };
  });

  app.post('/leisure/suggest', async (req): Promise<LeisureResponse> => {
    const body = parse(LeisureBody, req.body);
    const user = await getUser(db, req.userId);
    return suggestLeisure(app.deps, user, body, req.log);
  });
};
