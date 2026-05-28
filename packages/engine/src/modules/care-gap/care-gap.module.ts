import { Module } from '@nestjs/common';
import { CareGapService } from './care-gap.service';
import { FhirModule } from '../fhir/fhir.module';

@Module({
  imports: [FhirModule],
  providers: [CareGapService],
  exports: [CareGapService],
})
export class CareGapModule {}
