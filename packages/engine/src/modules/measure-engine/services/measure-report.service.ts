import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { FhirClientService } from '../../fhir/fhir.client.service';
import { MeasureEngineConfig } from '../measure-engine.config';
import type { PatientResultsMap } from '../interfaces/patient-results.interface';
import type { LoadedMeasure } from '../interfaces/loaded-measure.interface';
import type { CareGap } from '../interfaces/measure-report.interface';

@Injectable()
export class MeasureReportService {
  private readonly logger = new Logger(MeasureReportService.name);

  constructor(
    private readonly fhirClient: FhirClientService,
    private readonly config: MeasureEngineConfig,
  ) {}

  assemble(
    measure: LoadedMeasure,
    results: PatientResultsMap,
    periodStart: string,
    periodEnd: string,
  ): Record<string, unknown> {
    let ipp = 0;
    let denom = 0;
    let denomExcl = 0;
    let numerator = 0;

    for (const r of results.values()) {
      if (r.initialPopulation) ipp++;
      if (r.denominator) denom++;
      if (r.denominatorExclusion) denomExcl++;
      if (r.numerator) numerator++;
    }

    const effectiveDenom = denom - denomExcl;
    const measureScore = effectiveDenom > 0 ? numerator / effectiveDenom : 0;

    const report: Record<string, unknown> = {
      resourceType: 'MeasureReport',
      id: this.buildReportId(measure.id, periodStart, periodEnd),
      status: 'complete',
      type: 'summary',
      measure: `Measure/${measure.id}`,
      date: new Date().toISOString(),
      period: {
        start: periodStart,
        end: periodEnd,
      },
      group: [
        {
          population: [
            this.population('initial-population', ipp),
            this.population('denominator', denom),
            this.population('denominator-exclusion', denomExcl),
            this.population('numerator', numerator),
          ],
          measureScore: { value: Math.round(measureScore * 1000) / 1000 },
        },
      ],
    };

    this.logger.log(
      `MeasureReport assembled: IPP=${ipp}, Denom=${denom}, DenomExcl=${denomExcl}, Numerator=${numerator}, Score=${measureScore.toFixed(3)}`,
    );
    return report;
  }

  async persist(report: Record<string, unknown>): Promise<void> {
    if (!this.config.persistToFhir) return;
    const id = report['id'] as string;

    try {
      await axios.put(`${this.fhirClient.fhirServerUrl}/MeasureReport/${id}`, report, {
        headers: {
          'Content-Type': 'application/fhir+json',
          Accept: 'application/fhir+json',
        },
        timeout: 15_000,
      });
      this.logger.log(`MeasureReport/${id} persisted to HAPI`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to persist MeasureReport/${id}: ${message}`);
    }
  }

  deriveGaps(results: PatientResultsMap, _measureId: string): CareGap[] {
    const gaps: CareGap[] = [];
    for (const [patientId, r] of results) {
      if (r.denominator && !r.denominatorExclusion && !r.numerator) {
        gaps.push({
          patientId: `Patient/${patientId}`,
          reason: 'denominator-met, numerator-not-met',
        });
      }
    }
    return gaps;
  }

  buildReportId(measureId: string, periodStart: string, periodEnd: string): string {
    return `${measureId}-${periodStart}-${periodEnd}`;
  }

  private population(code: string, count: number): Record<string, unknown> {
    return {
      code: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/measure-population',
            code,
          },
        ],
      },
      count,
    };
  }
}
