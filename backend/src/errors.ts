import type { z } from 'zod';

/** An error with a stable machine-readable code; rendered as `{ error: { code, message } }`. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = (code = 'unauthorized', message = 'Authentication required') => new AppError(401, code, message);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);

/** Validate `data` with a Zod schema, throwing a 400 `validation_error` on failure. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    const path = first?.path.join('.') || 'body';
    throw new AppError(400, 'validation_error', `${path}: ${first?.message ?? 'invalid'}`);
  }
  return r.data;
}
