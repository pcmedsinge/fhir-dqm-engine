import { Test } from '@nestjs/testing';
import { MeasureController } from './measure.controller';
import { MeasureLoaderService } from '../services/measure-loader.service';
import { CqlRuntimeService } from '../services/cql-runtime.service';
import { MeasureReportService } from '../services/measure-report.service';
import { FhirClientService } from '../../fhir/fhir.client.service';

describe('MeasureController', () => {
  let controller: MeasureController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [MeasureController],
      providers: [
        {
          provide: MeasureLoaderService,
          useValue: { listMeasureIds: () => ['cms165-cbp'], loadMeasure: jest.fn() },
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

  it('lists measures', () => {
    expect(controller.listMeasures()).toEqual({ measures: ['cms165-cbp'] });
  });
});
