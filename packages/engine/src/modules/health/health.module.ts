import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { FhirModule } from '../fhir/fhir.module';
import { HealthController } from './health.controller';
import { FhirHealthIndicator } from './indicators/fhir.health.indicator';

@Module({
  imports: [TerminusModule, FhirModule],
  controllers: [HealthController],
  providers: [FhirHealthIndicator],
})
export class HealthModule {}
