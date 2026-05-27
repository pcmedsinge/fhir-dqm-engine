import { Injectable, Logger } from '@nestjs/common';
import { FhirClientService } from '../../fhir/fhir.client.service';
import type { FhirResource, FhirBundle } from '../../fhir/interfaces/fhir-resource.interface';

const QICORE_BP_PROFILE = 'http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-observation-bp';
const BP_LOINC_CODE = '85354-9';

type AnyResource = FhirResource & Record<string, unknown>;

@Injectable()
export class FhirDataSourceAdapter {
  private readonly logger = new Logger(FhirDataSourceAdapter.name);

  constructor(private readonly fhirClient: FhirClientService) {}

  async buildPatientBundles(): Promise<FhirBundle[]> {
    this.logger.log('Building patient bundles from HAPI...');

    const [patients, conditions, observations, encounters, procedures, medicationRequests] =
      await Promise.all([
        this.fetchAll('Patient', { _count: '1000' }),
        this.fetchAll('Condition', { _count: '2000' }),
        this.fetchAll('Observation', {
          code: `http://loinc.org|${BP_LOINC_CODE}`,
          _count: '5000',
        }),
        this.fetchAll('Encounter', { _count: '2000' }),
        this.fetchAll('Procedure', { _count: '2000' }),
        this.fetchAll('MedicationRequest', { _count: '2000' }),
      ]);

    this.logger.log(
      `Fetched: ${patients.length} patients, ${conditions.length} conditions, ` +
        `${observations.length} obs, ${encounters.length} encounters, ` +
        `${procedures.length} procedures, ${medicationRequests.length} medreqs`,
    );

    const taggedObs = observations.map((obs) => {
      const meta = (obs['meta'] as Record<string, unknown> | undefined) ?? {};
      const profiles = (meta['profile'] as string[] | undefined) ?? [];
      if (!profiles.includes(QICORE_BP_PROFILE)) {
        return {
          ...obs,
          meta: { ...meta, profile: [...profiles, QICORE_BP_PROFILE] },
        };
      }
      return obs;
    });

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
      if (!byPatient.has(ref)) byPatient.set(ref, []);
      byPatient.get(ref)!.push(res);
    }

    return patients.map((patient) => {
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
    let nextParams: Record<string, string> | null = params;

    while (nextParams) {
      const bundle = await this.fhirClient.searchResources<AnyResource>(resourceType, nextParams);
      const entries: AnyResource[] =
        bundle.entry?.map((e) => e.resource as AnyResource).filter(Boolean) ?? [];
      results.push(...entries);

      const bundleAny = bundle as unknown as { link?: Array<{ relation: string; url: string }> };
      const nextLink = bundleAny.link?.find((l) => l.relation === 'next');
      if (nextLink) {
        const url = new URL(nextLink.url);
        nextParams = Object.fromEntries(url.searchParams.entries());
      } else {
        nextParams = null;
      }

      if (entries.length === 0) break;
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
