import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FhirClientService } from '../fhir/fhir.client.service';
import type { FhirResource } from '../fhir/interfaces/fhir-resource.interface';

const ALL_PATIENTS_ID = 'all-patients';

type FhirGroup = FhirResource & {
  name?: string;
  type?: string;
  actual?: boolean;
  member?: Array<{ entity?: { reference?: string } }>;
};

@Injectable()
export class CohortService {
  private readonly logger = new Logger(CohortService.name);

  constructor(private readonly fhirClient: FhirClientService) {}

  /**
   * Resolve a cohortId to a patient-ID list.
   * Returns null if the cohort means "all patients" (no scoping).
   */
  async resolvePatientIds(cohortId: string): Promise<string[] | null> {
    if (!cohortId || cohortId === ALL_PATIENTS_ID) return null;

    const group = await this.fhirClient.getResource<FhirGroup>('Group', cohortId);
    if (!group) throw new NotFoundException(`Cohort Group '${cohortId}' not found`);

    const members = group.member ?? [];
    if (members.length === 0) {
      this.logger.warn(`Cohort '${cohortId}' has no members — treating as all patients`);
      return null;
    }

    return members
      .map((m) => m.entity?.reference)
      .filter((ref): ref is string => !!ref)
      .map((ref) => (ref.startsWith('Patient/') ? ref.replace('Patient/', '') : ref));
  }

  async listCohorts(): Promise<FhirGroup[]> {
    const bundle = await this.fhirClient.searchResources<FhirGroup>('Group', { _count: '100' });
    return (bundle.entry ?? []).map((e) => e.resource as FhirGroup).filter(Boolean);
  }

  async getCohort(id: string): Promise<FhirGroup> {
    return this.fhirClient.getResource<FhirGroup>('Group', id);
  }
}
