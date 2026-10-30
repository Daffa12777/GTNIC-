import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { CONFIG } from './config';
import { configureHttpSecurity } from './security/http-security';
import type { Server } from 'http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'], bodyParser: false });
  app.setGlobalPrefix('api');
  configureHttpSecurity(app);
  const server: Server = app.getHttpServer();
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000; server.maxHeadersCount = 100;
  await app.listen(CONFIG.PORT, '0.0.0.0');
  new Logger('Main').log(`API siap di http://localhost:${CONFIG.PORT}/api`);
}
bootstrap();
