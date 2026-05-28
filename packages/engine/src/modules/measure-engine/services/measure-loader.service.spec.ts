import { Test } from '@nestjs/testing';
import { MeasureLoaderService } from './measure-loader.service';
import { MeasureEngineConfig } from '../measure-engine.config';
import { ValueSetIntegrityService } from '../../value-set-integrity/value-set-integrity.service';
import path from 'node:path';

describe('MeasureLoaderService', () => {
  let service: MeasureLoaderService;

  beforeEach(async () => {
    const mockConfig = {
      measuresPath: path.resolve(__dirname, '../../../../measures'),
      persistToFhir: true,
      allowSyntheticSupplements: true,
    };
    const module = await Test.createTestingModule({
      providers: [
        MeasureLoaderService,
        { provide: MeasureEngineConfig, useValue: mockConfig },
        { provide: ValueSetIntegrityService, useValue: new ValueSetIntegrityService(mockConfig as MeasureEngineConfig) },
      ],
    }).compile();
    service = module.get(MeasureLoaderService);
  });

  it('lists measure IDs', () => {
    const ids = service.listMeasureIds();
    expect(ids).toContain('cms165-cbp');
  });

  it('loads cms165-cbp measure with ELM and value sets', () => {
    const m = service.loadMeasure('cms165-cbp');
    expect(m.id).toBe('cms165-cbp');
    expect(Object.keys(m.elmLibraries).length).toBeGreaterThanOrEqual(5);
    expect(m.mainLibraryId).toContain('ControllingHighBloodPressure');
    expect(Object.keys(m.valueSets).length).toBeGreaterThan(0);
  });

  it('throws NotFoundException for unknown measure', () => {
    expect(() => service.loadMeasure('unknown-measure')).toThrow();
  });
});
