import { Module } from '@nestjs/common';
import { FhirClientService } from './fhir.client.service';
import { FhirStatsController } from './controllers/fhir-stats.controller';

@Module({
  providers: [FhirClientService],
  controllers: [FhirStatsController],
  exports: [FhirClientService],
})
export class FhirModule {}
