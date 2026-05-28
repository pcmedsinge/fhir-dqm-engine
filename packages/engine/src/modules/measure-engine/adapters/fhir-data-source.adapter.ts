import { Injectable, Logger } from '@nestjs/common';
import { FhirClientService } from '../../fhir/fhir.client.service';
import type { FhirResource, FhirBundle } from '../../fhir/interfaces/fhir-resource.interface';

const QICORE_BP_PROFILE = 'http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-observation-bp';
const BP_LOINC_CODE = '85354-9';

type AnyResource = FhirResource & Record<string, unknown>;

function hasBpCode(obs: AnyResource): boolean {
  const codings =
    ((obs['code'] as Record<string, unknown>)?.['coding'] as Array<Record<string, unknown>>) ?? [];
  return codings.some((c) => c['code'] === BP_LOINC_CODE);
}

@Injectable()
export class FhirDataSourceAdapter {
  private readonly logger = new Logger(FhirDataSourceAdapter.name);

  constructor(private readonly fhirClient: FhirClientService) {}

  async buildPatientBundles(patientIds?: string[]): Promise<FhirBundle[]> {
    this.logger.log(
      patientIds
        ? `Building patient bundles for ${patientIds.length} cohort patients from HAPI...`
        : 'Building patient bundles (all patients) from HAPI...',
    );

    const patientParam: Record<string, string> = patientIds?.length
      ? { _id: patientIds.join(','), _count: String(patientIds.length) }
      : { _count: '1000' };

    const [patients, conditions, observations, encounters, procedures, medicationRequests] =
      await Promise.all([
        this.fetchAll('Patient', patientParam),
        this.fetchAll('Condition', { _count: '2000' }),
        this.fetchAll('Observation', { _count: '5000' }),
        this.fetchAll('Encounter', { _count: '2000' }),
        this.fetchAll('Procedure', { _count: '2000' }),
        this.fetchAll('MedicationRequest', { _count: '2000' }),
      ]);

    this.logger.log(
      `Fetched: ${patients.length} patients, ${conditions.length} conditions, ` +
        `${observations.length} obs, ${encounters.length} encounters, ` +
        `${procedures.length} procedures, ${medicationRequests.length} medreqs`,
    );

    // Tag BP panel observations with the QICore BP profile so CMS165 CQL can match them.
    // Only applied to observations that carry the BP LOINC code — other obs types are untouched.
    const taggedObs = observations.map((obs) => {
      if (!hasBpCode(obs)) return obs;
      const meta = (obs['meta'] as Record<string, unknown> | undefined) ?? {};
      const profiles = (meta['profile'] as string[] | undefined) ?? [];
      if (profiles.includes(QICORE_BP_PROFILE)) return obs;
      return { ...obs, meta: { ...meta, profile: [...profiles, QICORE_BP_PROFILE] } };
    });

    const patientSet = patientIds?.length
      ? new Set(patientIds.map((id) => (id.startsWith('Patient/') ? id : `Patient/${id}`)))
      : null;

    const byPatient = new Map<string, AnyResource[]>();
    for (const res of [
      ...conditions,
      ...taggedObs,
      ...encounters,
      ...procedures,
      ...medicationRequests,
    ]) {
      const ref = this.extractPatientRef(res);
      if (!ref) continue;
      if (patientSet && !patientSet.has(ref)) continue;
      if (!byPatient.has(ref)) byPatient.set(ref, []);
      byPatient.get(ref)!.push(res);
    }

    const targetPatients = patientSet
      ? patients.filter((p) => patientSet.has(`Patient/${p.id ?? ''}`))
      : patients;

    return targetPatients.map((patient) => {
      const patientRef = `Patient/${patient.id ?? ''}`;
      const relatedResources = byPatient.get(patientRef) ?? [];
      return {
        resourceType: 'Bundle' as const,
        type: 'collection',
        entry: [{ resource: patient }, ...relatedResources.map((r) => ({ resource: r }))],
      };
    });
  }

  private async fetchAll(
    resourceType: string,
    params: Record<string, string>,
  ): Promise<AnyResource[]> {
    const results: AnyResource[] = [];
    let bundle = await this.fhirClient.searchResources<AnyResource>(resourceType, params);

    while (true) {
      const entries: AnyResource[] =
        bundle.entry?.map((e) => e.resource as AnyResource).filter(Boolean) ?? [];
      results.push(...entries);

      const bundleAny = bundle as unknown as { link?: Array<{ relation: string; url: string }> };
      const nextLink = bundleAny.link?.find((l) => l.relation === 'next');
      if (!nextLink || entries.length === 0) break;

      bundle = await this.fhirClient.fetchPageByUrl<AnyResource>(nextLink.url);
    }

    return results;
  }

  private extractPatientRef(resource: AnyResource): string | null {
    const subject = resource['subject'] as { reference?: string } | undefined;
    const patient = resource['patient'] as { reference?: string } | undefined;
    const ref = subject?.reference ?? patient?.reference;
    if (!ref) return null;
    return ref.startsWith('Patient/') ? ref : `Patient/${ref}`;
  }
}
