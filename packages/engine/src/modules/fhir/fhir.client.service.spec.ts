import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { FhirClientService } from './fhir.client.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FhirClientService', () => {
  let service: FhirClientService;

  const mockConfigService = {
    get: jest.fn((key: string, def?: unknown) => {
      const vals: Record<string, unknown> = {
        FHIR_SERVER_URL: 'http://localhost:8080/fhir',
        FHIR_REQUEST_TIMEOUT_MS: 30_000,
        FHIR_HEALTH_CHECK_TIMEOUT_MS: 3_000,
      };
      return vals[key] ?? def;
    }),
  };

  const mockAxiosInstance = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    mockAxiosInstance.get.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [FhirClientService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<FhirClientService>(FhirClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(service.fhirServerUrl).toBe('http://localhost:8080/fhir');
  });

  describe('getResourceCount', () => {
    it('returns total from Bundle response', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { resourceType: 'Bundle', total: 250 },
      });
      const count = await service.getResourceCount('Patient');
      expect(count).toBe(250);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/Patient',
        expect.objectContaining({ params: { _summary: 'count' } }),
      );
    });

    it('returns 0 when total is missing', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { resourceType: 'Bundle' } });
      const count = await service.getResourceCount('Observation');
      expect(count).toBe(0);
    });
  });

  describe('getCapabilityStatement', () => {
    it('returns capability statement data', async () => {
      const cap = { resourceType: 'CapabilityStatement', fhirVersion: '4.0.1', status: 'active' };
      mockAxiosInstance.get.mockResolvedValueOnce({ data: cap });
      const result = await service.getCapabilityStatement();
      expect(result.fhirVersion).toBe('4.0.1');
    });
  });
});
