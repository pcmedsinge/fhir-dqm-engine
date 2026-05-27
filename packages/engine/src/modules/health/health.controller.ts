import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ServiceUnavailableException } from '@nestjs/common';
import pkg from '../../../package.json';
import { FhirHealthIndicator } from './indicators/fhir.health.indicator';
import { MeasureEngineHealthIndicator } from './indicators/measure-engine.health.indicator';

type HealthResponse = HealthCheckResult & { version: string; node: string; uptime: number };

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly fhirIndicator: FhirHealthIndicator,
    private readonly measureEngineIndicator: MeasureEngineHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Service health check (includes FHIR server and measure engine status)',
  })
  async check(): Promise<HealthResponse> {
    const extra = {
      version: pkg.version,
      node: process.version,
      uptime: process.uptime(),
    };

    try {
      const result = await this.health.check([
        (): Promise<HealthIndicatorResult> => Promise.resolve({ service: { status: 'up' } }),
        (): Promise<HealthIndicatorResult> => this.fhirIndicator.isHealthy(),
        (): HealthIndicatorResult => this.measureEngineIndicator.isHealthy(),
      ]);
      return { ...result, ...extra };
    } catch (err) {
      // Terminus throws ServiceUnavailableException when any indicator is down.
      // We deliberately return HTTP 200 anyway so /health is usable in dev
      // without HAPI running. The fhir indicator's details communicate the state.
      if (err instanceof ServiceUnavailableException) {
        const body = err.getResponse() as HealthCheckResult;
        return { ...body, ...extra };
      }
      throw err;
    }
  }
}
