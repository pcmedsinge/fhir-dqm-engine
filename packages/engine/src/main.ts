import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { SHARED_VERSION } from '@pramana/shared';
import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env['NODE_ENV'] === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Security headers
  app.use(helmet());

  // CORS — locked down by default; set CORS_ORIGINS env to open
  const allowedOrigins = process.env['CORS_ORIGINS']?.split(',').map((o) => o.trim()) ?? [];
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Body size limit
  app.use(
    (
      req: { headers: Record<string, string> },
      res: unknown,
      next: () => void,
    ) => {
      // NestJS / Express default is 100kb; enforce explicit 1mb cap via content-length check
      const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
      if (contentLength > 1_048_576) {
        // 1 MB
        (res as { status: (n: number) => { json: (b: unknown) => void } })
          .status(413)
          .json({ statusCode: 413, message: 'Payload Too Large' });
        return;
      }
      next();
    },
  );

  // Swagger at /api
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pramana — FHIR DQM Engine')
    .setDescription('Phase 1 scaffold — health endpoint only')
    .setVersion(process.env['npm_package_version'] ?? '0.1.0-alpha.1')
    .addTag('health')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  await app.listen(port);
  logger.log(`Pramana engine listening on port ${port.toString()}`);
  logger.log(`Swagger UI: http://localhost:${port.toString()}/api`);
  logger.log(`@pramana/shared v${SHARED_VERSION}`);
}

bootstrap().catch((err: unknown) => {
  logger.error('Fatal error during bootstrap', err);
  process.exit(1);
});
