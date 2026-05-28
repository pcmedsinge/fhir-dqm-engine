import { Test } from '@nestjs/testing';
import { MeasureController } from './measure.controller';
import { MeasureLoaderService } from '../services/measure-loader.service';
import { CqlRuntimeService } from '../services/cql-runtime.service';
import { MeasureReportService } from '../services/measure-report.service';
import { CohortService } from '../../cohort/cohort.service';
import { FhirClientService } from '../../fhir/fhir.client.service';

const MOCK_LOADED_MEASURE = {
  id: 'cms165-cbp',
  fhirMeasure: { title: 'Controlling High Blood Pressure FHIR', description: 'Test desc' },
  valueSetMetadata: [],
};

describe('MeasureController', () => {
  let controller: MeasureController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [MeasureController],
      providers: [
        {
          provide: MeasureLoaderService,
          useValue: {
            listMeasureIds: () => ['cms165-cbp'],
            loadMeasure: jest.fn().mockReturnValue(MOCK_LOADED_MEASURE),
          },
        },
        {
          provide: CqlRuntimeService,
          useValue: { execute: jest.fn().mockResolvedValue(new Map()) },
        },
        {
          provide: MeasureReportService,
          useValue: {
            assemble: jest.fn().mockReturnValue({ resourceType: 'MeasureReport' }),
            persist: jest.fn(),
            deriveGaps: jest.fn().mockReturnValue([]),
          },
        },
        {
          provide: CohortService,
          useValue: { resolvePatientIds: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: FhirClientService,
          useValue: {
            getResource: jest.fn(),
            fhirServerUrl: 'http://localhost:8080/fhir',
          },
        },
      ],
    }).compile();
    controller = module.get(MeasureController);
  });

  it('lists measures with id and title', () => {
    const result = controller.listMeasures();
    expect(result.measures).toHaveLength(1);
    expect(result.measures[0].id).toBe('cms165-cbp');
    expect(result.measures[0].title).toBe('Controlling High Blood Pressure');
  });
});
