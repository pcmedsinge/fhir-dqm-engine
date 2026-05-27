export interface PopulationCount {
  code: string;
  count: number;
}

export interface MeasureReportSummary {
  measureId: string;
  periodStart: string;
  periodEnd: string;
  populations: PopulationCount[];
  measureScore: number;
  computedAt: string;
}

export interface CareGap {
  patientId: string;
  reason: string;
}
