import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { Express, Request, Response } from 'express';
import { AppModule } from '../src/app.module';
import { configureHttpSecurity } from '../src/security/http-security';
import { randomUUID } from 'node:crypto';

let application: Promise<Express> | undefined;

async function initialize(): Promise<Express> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    bodyParser: false,
  });
  try {
    app.setGlobalPrefix('api');
    configureHttpSecurity(app);
    await app.init();
    return app.getHttpAdapter().getInstance() as Express;
  } catch (error: unknown) {
    await app.close().catch(() => {});
    throw error;
  }
}

export default async function handler(request: Request, response: Response): Promise<void> {
  application ??= initialize().catch((error: unknown) => {
    application = undefined;
    throw error;
  });
  try {
    const server = await application;
    server(request, response);
  } catch (error: unknown) {
    const requestId = randomUUID();
    console.error(`API initialization failed (${error instanceof Error ? error.name : 'UnknownError'}), requestId=${requestId}`);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Retry-After', '30');
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.status(503).json({ statusCode: 503, message: 'Layanan sementara tidak tersedia. Coba lagi nanti atau hubungi pengelola.', requestId });
  }
}
