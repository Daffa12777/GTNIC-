import { randomUUID } from 'crypto';
import { json, type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { CONFIG } from '../config';
import { SafeExceptionFilter } from './safe-exception.filter';

export function allowedOrigins(value = CONFIG.FRONTEND_ORIGIN): Set<string> {
  const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length) throw new Error('FRONTEND_ORIGIN wajib berisi origin yang diizinkan.');
  for (const entry of entries) {
    const url = new URL(entry);
    if (!['http:', 'https:'].includes(url.protocol) || entry !== url.origin) throw new Error('FRONTEND_ORIGIN harus berupa origin HTTP/HTTPS tanpa wildcard, path, atau kredensial.');
  }
  return new Set(entries);
}
export function configureHttpSecurity(app: INestApplication, options: { origins?: string; trustProxy?: string; production?: boolean } = {}): void {
  const origins = allowedOrigins(options.origins);
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const trustProxy = (options.trustProxy ?? process.env.TRUST_PROXY ?? '').trim();
  if (/^(true|\d+)$/i.test(trustProxy)) throw new Error('TRUST_PROXY harus berupa IP/CIDR atau nama subnet tepercaya, bukan true atau jumlah hop.');
  if (production && process.env.AUTH_ENABLED === 'false') throw new Error('Mode tanpa autentikasi tidak diizinkan pada NODE_ENV=production.');
  if (production && [...origins].some((origin) => { const url = new URL(origin); return url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); })) throw new Error('Origin publik pada production wajib menggunakan HTTPS. Untuk demo HTTP gunakan lingkungan development.');
  const server: Express = app.getHttpAdapter().getInstance();
  server.disable('x-powered-by');
  server.set('trust proxy', trustProxy ? trustProxy.split(',').map((entry) => entry.trim()) : false);
  server.set('query parser', 'simple');
  app.use(helmet({
    strictTransportSecurity: production ? { maxAge: 31536000, includeSubDomains: false } : false,
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: production ? [] : null } },
    referrerPolicy: { policy: 'no-referrer' },
    xFrameOptions: { action: 'deny' },
  }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', randomUUID());
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, POST, OPTIONS'); res.status(405).json({ statusCode: 405, message: 'Metode HTTP tidak diizinkan.' }); return;
    }
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) { res.status(403).json({ statusCode: 403, message: 'Origin tidak diizinkan.' }); return; }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers['x-mm-client'] !== 'web' || (!origin && req.headers['sec-fetch-site'] === 'cross-site')) { res.status(403).json({ statusCode: 403, message: 'Header permintaan tidak valid.' }); return; }
      const encoding = req.headers['content-encoding'];
      if (encoding && encoding.toLowerCase() !== 'identity') { res.status(415).json({ statusCode: 415, message: 'Body terkompresi tidak diterima.' }); return; }
      const contentType = req.headers['content-type'];
      const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || !!req.headers['transfer-encoding'];
      if ((contentType || hasBody) && contentType?.split(';')[0].trim().toLowerCase() !== 'application/json') { res.status(415).json({ statusCode: 415, message: 'Content-Type wajib application/json.' }); return; }
    }
    next();
  });
  app.enableCors({ origin: [...origins], credentials: true, allowedHeaders: ['content-type', 'x-role', 'x-mm-client'], exposedHeaders: ['X-Request-Id', 'Retry-After', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'], methods: ['GET', 'HEAD', 'POST', 'OPTIONS'], maxAge: 600 });
  app.use(json({ limit: '128kb', strict: true, inflate: false }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, forbidUnknownValues: true, validationError: { target: false, value: false } }));
  app.useGlobalFilters(new SafeExceptionFilter());
}
