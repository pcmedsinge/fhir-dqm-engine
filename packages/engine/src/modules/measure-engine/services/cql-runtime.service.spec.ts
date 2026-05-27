import { Test } from '@nestjs/testing';
import { CqlRuntimeService } from './cql-runtime.service';
import { FhirDataSourceAdapter } from '../adapters/fhir-data-source.adapter';
import { FhirClientService } from '../../fhir/fhir.client.service';

describe('CqlRuntimeService', () => {
  it('is defined', async () => {
    const module = await Test.createTestingModule({
      providers: [
        CqlRuntimeService,
        FhirDataSourceAdapter,
        {
          provide: FhirClientService,
          useValue: {
            searchResources: jest.fn(),
            fhirServerUrl: 'http://localhost:8080/fhir',
          },
        },
      ],
    }).compile();
    expect(module.get(CqlRuntimeService)).toBeDefined();
  });
});
