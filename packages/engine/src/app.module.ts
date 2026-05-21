import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().integer().min(1).max(65535).default(3000),
        LOG_LEVEL: Joi.string()
          .valid('error', 'warn', 'info', 'debug', 'verbose')
          .default('info'),
      }),
    }),
    HealthModule,
  ],
})
export class AppModule {}
