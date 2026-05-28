import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { FhirClientService } from '../fhir/fhir.client.service';
import type { FhirResource } from '../fhir/interfaces/fhir-resource.interface';

type FhirMeasureReport = FhirResource &
  Record<string, unknown> & {
    type?: string;
    group?: Array<{
      population?: Array<{
        code?: { coding?: Array<{ code?: string }> };
        count?: number;
        subjectResults?: { reference?: string };
      }>;
    }>;
    contained?: Array<FhirResource & Record<string, unknown>>;
  };

export interface CareGapEntry {
  patientId: string;
  reason: string;
}

export interface CareGapResponse {
  measureId: string;
  cohortId: string;
  source: string;
  periodStart: string;
  periodEnd: string;
  openGapsCount: number;
  gaps: CareGapEntry[];
}

@Injectable()
export class CareGapService {
  private readonly logger = new Logger(CareGapService.name);

  constructor(private readonly fhirClient: FhirClientService) {}

  async deriveGapsFromReport(
    measureId: string,
    reportId: string,
    cohortId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<CareGapResponse> {
    let report: FhirMeasureReport;
    try {
      report = await this.fhirClient.getResource<FhirMeasureReport>('MeasureReport', reportId);
    } catch {
      throw new HttpException(
        {
          statusCode: 409,
          error: 'Conflict',
          message: `No MeasureReport found for measure '${measureId}' and period ${periodStart}/${periodEnd}. Run POST /v1/measures/${measureId}/compute first.`,
        },
        HttpStatus.CONFLICT,
      );
    }

    const gaps = this.extractGapsFromReport(report);
    this.logger.log(`Derived ${gaps.length} open care gaps from MeasureReport/${reportId}`);

    return {
      measureId,
      cohortId,
      source: `MeasureReport/${reportId}`,
      periodStart,
      periodEnd,
      openGapsCount: gaps.length,
      gaps,
    };
  }

  private extractGapsFromReport(report: FhirMeasureReport): CareGapEntry[] {
    const group = report.group?.[0];
    if (!group) return [];

    const populations = group.population ?? [];
    const getPopulation = (code: string) =>
      populations.find((p) => p.code?.coding?.some((c) => c.code === code));

    const numeratorPop = getPopulation('numerator');
    const denomPop = getPopulation('denominator');
    const denomExclPop = getPopulation('denominator-exclusion');

    // summary-type report: derive from counts (approximate — cannot name individual patients)
    if (report.type === 'summary') {
      const denomCount = denomPop?.count ?? 0;
      const denomExclCount = denomExclPop?.count ?? 0;
      const numeratorCount = numeratorPop?.count ?? 0;
      const gapCount = Math.max(0, denomCount - denomExclCount - numeratorCount);

      // Return placeholder entries since individual patient IDs aren't in a summary report
      return Array.from({ length: gapCount }, (_, i) => ({
        patientId: `unknown-patient-${i.toString()}`,
        reason: 'denominator-met, numerator-not-met (summary report — recompute for patient IDs)',
      }));
    }

    // subject-list type: parse contained List resources for per-patient detail
    const contained = report.contained ?? [];
    const denomPatients = this.patientsFromContained(contained, denomPop?.subjectResults?.reference);
    const denomExclPatients = this.patientsFromContained(
      contained,
      denomExclPop?.subjectResults?.reference,
    );
    const numeratorPatients = this.patientsFromContained(
      contained,
      numeratorPop?.subjectResults?.reference,
    );

    return [...denomPatients]
      .filter((pid) => !denomExclPatients.has(pid) && !numeratorPatients.has(pid))
      .map((pid) => ({ patientId: pid, reason: 'denominator-met, numerator-not-met' }));
  }

  private patientsFromContained(
    contained: Array<FhirResource & Record<string, unknown>>,
    ref?: string,
  ): Set<string> {
    if (!ref) return new Set();
    const listId = ref.replace(/^#/, '');
    const list = contained.find((r) => r.id === listId && r.resourceType === 'List') as
      | (Record<string, unknown> & { entry?: Array<{ item?: { reference?: string } }> })
      | undefined;
    if (!list) return new Set();
    return new Set((list.entry ?? []).map((e) => e.item?.reference).filter((r): r is string => !!r));
  }
}
