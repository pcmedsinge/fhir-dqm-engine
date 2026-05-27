export interface PatientPopulationResult {
  initialPopulation: boolean;
  denominator: boolean;
  denominatorExclusion: boolean;
  numerator: boolean;
}

export type PatientResultsMap = Map<string, PatientPopulationResult>;
