import { Injectable, Logger } from '@nestjs/common';
import { Library, Executor, CodeService, Repository, DateTime, Interval } from 'cql-execution';
import type { ValueSetDictionary } from 'cql-execution';
import { PatientSource } from 'cql-exec-fhir';
import type { LoadedMeasure, ValueSetMap } from '../interfaces/loaded-measure.interface';
import type {
  PatientResultsMap,
  PatientPopulationResult,
} from '../interfaces/patient-results.interface';
import { FhirDataSourceAdapter } from '../adapters/fhir-data-source.adapter';

const POPULATION_NAMES = {
  initialPopulation: 'Initial Population',
  denominator: 'Denominator',
  denominatorExclusion: 'Denominator Exclusion',
  numerator: 'Numerator',
} as const;

function toValueSetDictionary(vsMap: ValueSetMap): ValueSetDictionary {
  const dict: ValueSetDictionary = {};
  for (const [oid, entries] of Object.entries(vsMap)) {
    dict[oid] = { '': entries };
  }
  return dict;
}

@Injectable()
export class CqlRuntimeService {
  private readonly logger = new Logger(CqlRuntimeService.name);

  constructor(private readonly dataSource: FhirDataSourceAdapter) {}

  async execute(
    measure: LoadedMeasure,
    periodStart: string,
    periodEnd: string,
  ): Promise<PatientResultsMap> {
    this.logger.log(`Executing ${measure.id} for ${periodStart}/${periodEnd}`);

    const patientBundles = await this.dataSource.buildPatientBundles();
    this.logger.log(`Processing ${patientBundles.length} patients...`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repository = new Repository(measure.elmLibraries as any);
    const library = repository.resolve(
      measure.mainLibraryId,
      measure.mainLibraryVersion,
    ) as Library;

    const codeService = new CodeService(toValueSetDictionary(measure.valueSets));

    const start = DateTime.parse(`${periodStart}T00:00:00.000`);
    const end = DateTime.parse(`${periodEnd}T23:59:59.999`);
    const measurementPeriod = new Interval(start, end, true, true);

    const patientSource = PatientSource.FHIRv401();
    patientSource.loadBundles(patientBundles as Parameters<typeof patientSource.loadBundles>[0]);

    const executor = new Executor(library, codeService, {
      'Measurement Period': measurementPeriod,
    });
    const results = await executor.exec(patientSource);

    const resultsMap: PatientResultsMap = new Map();
    const patientResults = results.patientResults as Record<string, Record<string, unknown>>;

    for (const [patientId, expressions] of Object.entries(patientResults)) {
      const popResult: PatientPopulationResult = {
        initialPopulation: Boolean(expressions[POPULATION_NAMES.initialPopulation]),
        denominator: Boolean(expressions[POPULATION_NAMES.denominator]),
        denominatorExclusion: Boolean(expressions[POPULATION_NAMES.denominatorExclusion]),
        numerator: Boolean(expressions[POPULATION_NAMES.numerator]),
      };
      resultsMap.set(patientId, popResult);
    }

    this.logger.log(`Execution complete: ${resultsMap.size} patients evaluated`);
    return resultsMap;
  }
}
