import { Test, TestingModule } from '@nestjs/testing';
import { FhirStatsController } from './fhir-stats.controller';
import { FhirClientService } from '../fhir.client.service';

const mockFhirClient = {
  fhirServerUrl: 'http://localhost:8080/fhir',
  getResourceCount: jest.fn().mockResolvedValue(10),
  getCapabilityStatement: jest.fn().mockResolvedValue({
    resourceType: 'CapabilityStatement',
    fhirVersion: '4.0.1',
    status: 'active',
  }),
};

describe('FhirStatsController', () => {
  let controller: FhirStatsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FhirStatsController],
      providers: [{ provide: FhirClientService, useValue: mockFhirClient }],
    }).compile();

    controller = module.get<FhirStatsController>(FhirStatsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /v1/fhir/stats returns expected shape', async () => {
    const result = await controller.getStats();

    expect(result.fhirServerUrl).toBe('http://localhost:8080/fhir');
    expect(result.fhirVersion).toBe('4.0.1');
    expect(typeof result.resourceCounts['Patient']).toBe('number');
    expect(typeof result.resourceCounts['Encounter']).toBe('number');
  });
});
