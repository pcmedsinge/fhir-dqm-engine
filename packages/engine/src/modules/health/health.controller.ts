import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import pkg from '../../../package.json';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Service health check' })
  async check(): Promise<HealthCheckResult & { version: string; node: string; uptime: number }> {
    const result = await this.health.check([
      (): Promise<HealthIndicatorResult> => Promise.resolve({ service: { status: 'up' } }),
    ]);
    return {
      ...result,
      version: pkg.version,
      node: process.version,
      uptime: process.uptime(),
    };
  }
}
