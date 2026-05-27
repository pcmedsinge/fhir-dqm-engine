import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { FhirModule } from '../fhir/fhir.module';
import { MeasureEngineModule } from '../measure-engine/measure-engine.module';
import { HealthController } from './health.controller';
import { FhirHealthIndicator } from './indicators/fhir.health.indicator';
import { MeasureEngineHealthIndicator } from './indicators/measure-engine.health.indicator';

@Module({
  imports: [TerminusModule, FhirModule, MeasureEngineModule],
  controllers: [HealthController],
  providers: [FhirHealthIndicator, MeasureEngineHealthIndicator],
})
export class HealthModule {}
