import { Test } from '@nestjs/testing';
import { MeasureReportService } from './measure-report.service';
import { FhirClientService } from '../../fhir/fhir.client.service';
import { MeasureEngineConfig } from '../measure-engine.config';
import type { PatientResultsMap } from '../interfaces/patient-results.interface';
import type { LoadedMeasure } from '../interfaces/loaded-measure.interface';

const MOCK_MEASURE: Pick<LoadedMeasure, 'id' | 'fhirMeasure'> = {
  id: 'cms165-cbp',
  fhirMeasure: {},
};

function makeResults(rows: Array<[boolean, boolean, boolean, boolean]>): PatientResultsMap {
  const map: PatientResultsMap = new Map();
  rows.forEach(([ipp, denom, denomExcl, num], i) => {
    map.set(`patient-${i.toString()}`, {
      initialPopulation: ipp,
      denominator: denom,
      denominatorExclusion: denomExcl,
      numerator: num,
    });
  });
  return map;
}

describe('MeasureReportService', () => {
  let service: MeasureReportService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MeasureReportService,
        {
          provide: FhirClientService,
          useValue: { fhirServerUrl: 'http://localhost:8080/fhir' },
        },
        {
          provide: MeasureEngineConfig,
          useValue: { persistToFhir: false },
        },
      ],
    }).compile();
    service = module.get(MeasureReportService);
  });

  it('assembles MeasureReport with correct population counts', () => {
    const results = makeResults([
      [true, true, false, true],
      [true, true, false, false],
      [false, false, false, false],
    ]);
    const report = service.assemble(
      MOCK_MEASURE as LoadedMeasure,
      results,
      '2026-01-01',
      '2026-12-31',
    );

    expect(report['resourceType']).toBe('MeasureReport');
    expect(report['status']).toBe('complete');
    expect(report['type']).toBe('summary');

    type PopEntry = { code: { coding: Array<{ code: string }> }; count: number };
    type GroupEntry = { population: PopEntry[]; measureScore: { value: number } };
    const group = (report['group'] as GroupEntry[])[0];
    const popMap = Object.fromEntries(
      group.population.map((p) => [p.code.coding[0].code, p.count]),
    );
    expect(popMap['initial-population']).toBe(2);
    expect(popMap['denominator']).toBe(2);
    expect(popMap['denominator-exclusion']).toBe(0);
    expect(popMap['numerator']).toBe(1);
    expect(group.measureScore.value).toBeCloseTo(0.5, 2);
  });

  it('handles denominator exclusions correctly', () => {
    const results = makeResults([
      [true, true, true, false],
      [true, true, false, true],
    ]);
    const report = service.assemble(
      MOCK_MEASURE as LoadedMeasure,
      results,
      '2026-01-01',
      '2026-12-31',
    );

    type PopEntry = { code: { coding: Array<{ code: string }> }; count: number };
    type GroupEntry = { population: PopEntry[]; measureScore: { value: number } };
    const group = (report['group'] as GroupEntry[])[0];
    const popMap = Object.fromEntries(
      group.population.map((p) => [p.code.coding[0].code, p.count]),
    );
    expect(popMap['denominator-exclusion']).toBe(1);
    expect(group.measureScore.value).toBeCloseTo(1.0, 2);
  });

  it('derives care gaps for denominator-met but numerator-not-met patients', () => {
    const results = makeResults([
      [true, true, false, true],
      [true, true, false, false],
      [true, true, true, false],
    ]);
    const gaps = service.deriveGaps(results, 'cms165-cbp');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].patientId).toBe('Patient/patient-1');
    expect(gaps[0].reason).toContain('numerator-not-met');
  });

  it('builds deterministic report ID from measure + period', () => {
    const id = service.buildReportId('cms165-cbp', '2026-01-01', '2026-12-31');
    expect(id).toBe('cms165-cbp-2026-01-01-2026-12-31');
  });
});
