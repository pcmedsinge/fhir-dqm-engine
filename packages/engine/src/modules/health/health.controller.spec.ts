import { Test, TestingModule } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { FhirHealthIndicator } from './indicators/fhir.health.indicator';
import { MeasureEngineHealthIndicator } from './indicators/measure-engine.health.indicator';

const mockFhirIndicator = {
  isHealthy: jest.fn(),
};

const mockMeasureEngineIndicator = {
  isHealthy: jest.fn(),
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    mockFhirIndicator.isHealthy.mockResolvedValue({
      fhir: {
        status: 'up',
        url: 'http://localhost:8080/fhir',
        fhirVersion: '4.0.1',
        responseTimeMs: 5,
      },
    });

    mockMeasureEngineIndicator.isHealthy.mockReturnValue({
      measureEngine: { status: 'up', loadedMeasures: ['cms165-cbp'], cqlExecutionVersion: '3.3.0' },
    });

    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: FhirHealthIndicator, useValue: mockFhirIndicator },
        { provide: MeasureEngineHealthIndicator, useValue: mockMeasureEngineIndicator },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /health returns status ok with version, node, uptime, fhir, and measureEngine indicators', async () => {
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.node).toMatch(/^v\d+/);
    expect(typeof result.uptime).toBe('number');
    expect(result.info?.['fhir']).toBeDefined();
    expect(result.info?.['measureEngine']).toBeDefined();
  });

  it('GET /health does not throw when FHIR is down (soft-down: HTTP stays 200)', async () => {
    mockFhirIndicator.isHealthy.mockResolvedValue({
      fhir: { status: 'down', url: 'http://localhost:8080/fhir', error: 'connect ECONNREFUSED' },
    });

    // Must not throw — the controller catches ServiceUnavailableException and returns 200.
    // result.status will be 'error' (Terminus body), but no exception propagates.
    const result = await expect(controller.check()).resolves.toBeDefined();
    void result;
  });
});
