import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { Express, Request, Response } from 'express';
import { AppModule } from '../src/app.module';
import { configureHttpSecurity } from '../src/security/http-security';

let application: Promise<Express> | undefined;

async function initialize(): Promise<Express> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    bodyParser: false,
  });
  app.setGlobalPrefix('api');
  configureHttpSecurity(app);
  await app.init();
  return app.getHttpAdapter().getInstance() as Express;
}

export default async function handler(request: Request, response: Response): Promise<void> {
  application ??= initialize().catch((error: unknown) => {
    application = undefined;
    throw error;
  });
  const server = await application;
  server(request, response);
}
