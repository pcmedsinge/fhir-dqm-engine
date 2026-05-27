import { Module } from '@nestjs/common';
import { FhirModule } from '../fhir/fhir.module';
import { MeasureEngineConfig } from './measure-engine.config';
import { MeasureLoaderService } from './services/measure-loader.service';
import { FhirDataSourceAdapter } from './adapters/fhir-data-source.adapter';
import { CqlRuntimeService } from './services/cql-runtime.service';
import { MeasureReportService } from './services/measure-report.service';
import { MeasurePublisherService } from './services/measure-publisher.service';
import { MeasureController } from './controllers/measure.controller';

@Module({
  imports: [FhirModule],
  providers: [
    MeasureEngineConfig,
    MeasureLoaderService,
    FhirDataSourceAdapter,
    CqlRuntimeService,
    MeasureReportService,
    MeasurePublisherService,
  ],
  controllers: [MeasureController],
  exports: [MeasureLoaderService, MeasureEngineConfig],
})
export class MeasureEngineModule {}
