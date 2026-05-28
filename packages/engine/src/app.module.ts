import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { HealthModule } from './modules/health/health.module';
import { FhirModule } from './modules/fhir/fhir.module';
import { CohortModule } from './modules/cohort/cohort.module';
import { MeasureEngineModule } from './modules/measure-engine/measure-engine.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().integer().min(1).max(65535).default(3000),
        LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'verbose').default('info'),
        FHIR_SERVER_URL: Joi.string().uri().default('http://localhost:8080/fhir'),
        FHIR_REQUEST_TIMEOUT_MS: Joi.number().integer().min(1).default(30000),
        FHIR_HEALTH_CHECK_TIMEOUT_MS: Joi.number().integer().min(1).default(3000),
        MEASURES_PATH: Joi.string().optional(),
        MEASUREREPORT_PERSIST_TO_FHIR: Joi.string().valid('true', 'false').default('true'),
        ALLOW_SYNTHETIC_VALUESET_SUPPLEMENTS: Joi.string().valid('true', 'false').default('true'),
      }),
    }),
    HealthModule,
    FhirModule,
    CohortModule,
    MeasureEngineModule,
  ],
})
export class AppModule {}
