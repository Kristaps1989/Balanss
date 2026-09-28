import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';

import type { AppDeps } from './deps';
import { AppError, unauthorized } from './errors';
import { authRoutes } from './routes/auth';
import { copyRoutes } from './routes/copy';
import { dayRoutes } from './routes/day';
import { healthRoutes } from './routes/health';
import { mealRoutes } from './routes/meals';
import { meRoutes } from './routes/me';
import { publicRoutes } from './routes/public';
import { pushRoutes } from './routes/push';
import { verifyAccessToken } from './services/auth';

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
  interface FastifyRequest {
    userId: string;
  }
}

/** Never log secrets, e-mails or health values: mask tokens in URLs and redact sensitive fields. */
function safeUrl(url: string): string {
  return url
    .replace(/\/exports\/[^/?]+/, '/exports/[token]')
    .replace(/\/foods\/barcode\/[^/?]+/, '/foods/barcode/[ean]')
    .replace(/\?.*$/, (q) => (q.includes('sig=') || q.includes('token=') ? '?[redacted]' : q));
}

export const LOG_REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'email',
  '*.email',
  'token',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.idToken',
  '*.identityToken',
  '*.devToken',
];

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: { paths: LOG_REDACT, censor: '[redacted]' },
      serializers: {
        req: (req: FastifyRequest) => ({ method: req.method, url: safeUrl(req.url), reqId: req.id }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    },
    bodyLimit: 1024 * 1024,
    trustProxy: true,
  });

  app.decorate('deps', deps);
  app.decorateRequest('userId', '');

  // JSON bodies; an empty body counts as {} so body-less POSTs work with any client.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (!text.trim()) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new AppError(400, 'invalid_json', 'Request body is not valid JSON'), undefined);
    }
  });

  await app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    origin: config.corsOrigins === '*' ? true : config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, code: 'rate_limited', message: `Too many requests; retry in ${ctx.after}` }),
  });

  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    const status = err.statusCode ?? 500;
    if (status === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: err.message } });
    if (status === 413) return reply.status(413).send({ error: { code: 'payload_too_large', message: 'Request body is too large' } });
    if (err.validation) return reply.status(400).send({ error: { code: 'validation_error', message: err.message } });
    if (status < 500) return reply.status(status).send({ error: { code: 'bad_request', message: err.message } });
    req.log.error({ err: { name: err.name, message: err.message, stack: err.stack } }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'internal_error', message: 'Something went wrong' } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'not_found', message: 'Route not found' } }));

  app.get('/health', { config: { rateLimit: false } }, async () => ({ ok: true }));

  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: '/auth' });
      await v1.register(publicRoutes);
      await v1.register(async (secured) => {
        secured.addHook('onRequest', async (req) => {
          const header = req.headers.authorization;
          if (!header?.startsWith('Bearer ')) throw unauthorized();
          req.userId = await verifyAccessToken(config, header.slice(7).trim());
        });
        await secured.register(meRoutes);
        await secured.register(dayRoutes);
        await secured.register(mealRoutes);
        await secured.register(healthRoutes);
        await secured.register(copyRoutes);
        await secured.register(pushRoutes);
      });
    },
    { prefix: '/v1' },
  );

  return app;
}
