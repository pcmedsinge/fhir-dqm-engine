import { Body, Controller, Get, Param, Post, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ComputeRequestDto } from '../dto/compute-request.dto';
import { MeasureLoaderService } from '../services/measure-loader.service';
import { CqlRuntimeService } from '../services/cql-runtime.service';
import { MeasureReportService } from '../services/measure-report.service';
import { FhirClientService } from '../../fhir/fhir.client.service';
import type { FhirResource } from '../../fhir/interfaces/fhir-resource.interface';
import type { CareGap } from '../interfaces/measure-report.interface';

type FhirMeasureReport = FhirResource & Record<string, unknown>;

@ApiTags('measures')
@Controller('v1/measures')
export class MeasureController {
  private readonly logger = new Logger(MeasureController.name);

  constructor(
    private readonly loader: MeasureLoaderService,
    private readonly runtime: CqlRuntimeService,
    private readonly reporter: MeasureReportService,
    private readonly fhirClient: FhirClientService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all measures the engine knows how to run' })
  listMeasures(): { measures: string[] } {
    return { measures: this.loader.listMeasureIds() };
  }

  @Post(':id/compute')
  @ApiOperation({ summary: 'Compute a measure and return a FHIR MeasureReport' })
  async compute(
    @Param('id') id: string,
    @Body() dto: ComputeRequestDto,
  ): Promise<Record<string, unknown>> {
    this.logger.log(`Computing measure ${id} for ${dto.periodStart}/${dto.periodEnd}`);
    const measure = this.loader.loadMeasure(id);
    const results = await this.runtime.execute(measure, dto.periodStart, dto.periodEnd);
    const report = this.reporter.assemble(measure, results, dto.periodStart, dto.periodEnd);
    await this.reporter.persist(report);
    return report;
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Fetch the most recent MeasureReport from HAPI for this measure' })
  async getReport(@Param('id') id: string): Promise<FhirMeasureReport> {
    return this.fhirClient.getResource<FhirMeasureReport>(
      'MeasureReport',
      `${id}-2026-01-01-2026-12-31`,
    );
  }

  @Get(':id/gaps')
  @ApiOperation({ summary: 'List patients with open care gaps (denom-met, numerator-not-met)' })
  async getGaps(
    @Param('id') id: string,
  ): Promise<{ measureId: string; openGapsCount: number; gaps: CareGap[] }> {
    const measure = this.loader.loadMeasure(id);
    const results = await this.runtime.execute(measure, '2026-01-01', '2026-12-31');
    const gaps = this.reporter.deriveGaps(results, id);
    return { measureId: id, openGapsCount: gaps.length, gaps };
  }
}
