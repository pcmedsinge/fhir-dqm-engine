import { Module } from '@nestjs/common';
import { CohortService } from './cohort.service';
import { CohortController } from './cohort.controller';
import { FhirModule } from '../fhir/fhir.module';

@Module({
  imports: [FhirModule],
  providers: [CohortService],
  controllers: [CohortController],
  exports: [CohortService],
})
export class CohortModule {}
