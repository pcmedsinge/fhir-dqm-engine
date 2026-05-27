import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { MeasureLoaderService } from '../../measure-engine/services/measure-loader.service';

@Injectable()
export class MeasureEngineHealthIndicator extends HealthIndicator {
  constructor(private readonly loader: MeasureLoaderService) {
    super();
  }

  isHealthy(): HealthIndicatorResult {
    try {
      const loadedMeasures = this.loader.listMeasureIds();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { version } = require('cql-execution/package.json') as { version: string };
      return this.getStatus('measureEngine', true, {
        loadedMeasures,
        cqlExecutionVersion: version,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.getStatus('measureEngine', false, { error: message.slice(0, 120) });
    }
  }
}
