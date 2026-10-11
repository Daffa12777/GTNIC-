import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { CONFIG } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api');
  const origins = CONFIG.FRONTEND_ORIGIN === '*' ? true : CONFIG.FRONTEND_ORIGIN.split(',').map((s) => s.trim());
  app.enableCors({ origin: origins, allowedHeaders: ['content-type', 'x-role'], methods: ['GET', 'POST', 'OPTIONS'] });
  await app.listen(CONFIG.PORT, '0.0.0.0');
  new Logger('Main').log(`API siap di http://localhost:${CONFIG.PORT}/api`);
}
bootstrap();
