import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { CONFIG } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api');
  if (process.env.AUTH_ENABLED === 'true' && CONFIG.FRONTEND_ORIGIN === '*') throw new Error('FRONTEND_ORIGIN harus berisi origin yang diizinkan saat login aktif.');
  const origins = CONFIG.FRONTEND_ORIGIN === '*' ? true : CONFIG.FRONTEND_ORIGIN.split(',').map((s) => s.trim());
  app.enableCors({ origin: origins, credentials: true, allowedHeaders: ['content-type', 'x-role', 'x-mm-client'], methods: ['GET', 'POST', 'OPTIONS'] });
  await app.listen(CONFIG.PORT, '0.0.0.0');
  new Logger('Main').log(`API siap di http://localhost:${CONFIG.PORT}/api`);
}
bootstrap();
