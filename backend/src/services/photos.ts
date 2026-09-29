import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { and, inArray, lt } from 'drizzle-orm';

import type { Config } from '../config';
import type { Db } from '../db/client';
import { meals, photos } from '../db/schema';
import { hmac, randomToken, safeEqual } from '../lib/crypto';

export type PhotoMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

const EXT: Record<PhotoMediaType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const TYPE_BY_EXT: Record<string, PhotoMediaType> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const KEY_PATTERN = /^[A-Za-z0-9_-]{24}\.(jpg|png|webp)$/;
export const PHOTO_URL_TTL_SEC = 24 * 60 * 60;
export const PHOTO_RETENTION_DAYS = 30;

/** Checks the file signature so a client cannot store arbitrary bytes as an "image". */
export function looksLikeImage(buf: Buffer, type: PhotoMediaType): boolean {
  if (type === 'image/jpeg') return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === 'image/png') return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
}

const filePath = (config: Config, key: string) => path.join(path.resolve(config.storageDir), key);

export async function savePhoto(db: Db, config: Config, userId: string, data: Buffer, mediaType: PhotoMediaType): Promise<string> {
  const key = `${randomToken(18)}.${EXT[mediaType]}`;
  await mkdir(path.resolve(config.storageDir), { recursive: true });
  await writeFile(filePath(config, key), data, { mode: 0o600 });
  await db.insert(photos).values({ key, userId, mediaType });
  return key;
}

export async function readPhoto(config: Config, key: string): Promise<{ data: Buffer; mediaType: PhotoMediaType } | null> {
  if (!KEY_PATTERN.test(key)) return null;
  try {
    const data = await readFile(filePath(config, key));
    return { data, mediaType: TYPE_BY_EXT[key.split('.').pop()!]! };
  } catch {
    return null;
  }
}

const signingKey = (config: Config) => `${config.jwtSecret}:photos`;

export function signedPhotoUrl(config: Config, key: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + PHOTO_URL_TTL_SEC;
  const sig = hmac(signingKey(config), `${key}.${exp}`);
  return `${config.publicApiUrl}/v1/photos/${key}?exp=${exp}&sig=${sig}`;
}

export function verifyPhotoSignature(config: Config, key: string, exp: string, sig: string, now = Date.now()): boolean {
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum * 1000 < now) return false;
  return safeEqual(hmac(signingKey(config), `${key}.${expNum}`), sig);
}

/** The storage key inside one of our photo URLs, or null for anything else. */
export function keyFromPhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/v1\/photos\/([A-Za-z0-9_-]{24}\.(?:jpg|png|webp))(?:\?|$)/.exec(url);
  return m ? m[1]! : null;
}

export async function deletePhotoFiles(config: Config, keys: string[]): Promise<void> {
  await Promise.all(keys.filter((k) => KEY_PATTERN.test(k)).map((k) => unlink(filePath(config, k)).catch(() => undefined)));
}

/** Retention: photos older than 30 days are deleted (meals keep their nutrition data). */
export async function cleanupOldPhotos(db: Db, config: Config, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const old = await db.select({ key: photos.key }).from(photos).where(lt(photos.createdAt, cutoff));
  if (!old.length) return 0;
  const keys = old.map((p) => p.key);
  await deletePhotoFiles(config, keys);
  await db.update(meals).set({ photoKey: null }).where(inArray(meals.photoKey, keys));
  await db.delete(photos).where(and(inArray(photos.key, keys), lt(photos.createdAt, cutoff)));
  return keys.length;
}
