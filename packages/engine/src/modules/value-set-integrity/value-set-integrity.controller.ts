import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MeasureLoaderService } from '../measure-engine/services/measure-loader.service';
import { MeasureEngineConfig } from '../measure-engine/measure-engine.config';

@ApiTags('value-sets')
@Controller('v1/value-sets')
export class ValueSetIntegrityController {
  constructor(
    private readonly loader: MeasureLoaderService,
    private readonly config: MeasureEngineConfig,
  ) {}

  @Get('integrity')
  @ApiOperation({ summary: 'Value-set integrity report — classification and content hashes for all loaded measures' })
  @ApiQuery({ name: 'measureId', required: false, description: 'Filter to a single measure' })
  getIntegrityReport(@Query('measureId') measureId?: string) {
    const measures = this.loader
      .getLoadedMeasures()
      .filter((m) => !measureId || m.id === measureId);

    const report = measures.map((m) => ({
      measureId: m.id,
      allowSyntheticSupplements: this.config.allowSyntheticSupplements,
      valueSets: m.valueSetMetadata,
      summary: {
        total: m.valueSetMetadata.length,
        canonical: m.valueSetMetadata.filter((v) => v.classification === 'VSAC-CANONICAL').length,
        localModified: m.valueSetMetadata.filter((v) => v.classification === 'LOCAL-MODIFIED').length,
        localCustom: m.valueSetMetadata.filter((v) => v.classification === 'LOCAL-CUSTOM').length,
      },
    }));

    return {
      generatedAt: new Date().toISOString(),
      measures: report,
    };
  }
}
