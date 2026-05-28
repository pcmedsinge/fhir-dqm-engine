import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import axios from 'axios';
import { MeasureLoaderService } from './measure-loader.service';
import { FhirClientService } from '../../fhir/fhir.client.service';

@Injectable()
export class MeasurePublisherService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MeasurePublisherService.name);

  constructor(
    private readonly loader: MeasureLoaderService,
    private readonly fhirClient: FhirClientService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedAllPatientsGroup().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not seed all-patients Group: ${message}`);
    });

    for (const id of this.loader.listMeasureIds()) {
      await this.publishMeasure(id).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Could not publish measure ${id}: ${message}`);
      });
    }
  }

  private async seedAllPatientsGroup(): Promise<void> {
    const baseUrl = this.fhirClient.fhirServerUrl;
    const headers = { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' };
    const group = {
      resourceType: 'Group',
      id: 'all-patients',
      type: 'person',
      actual: false,
      name: 'All Patients',
      code: { text: 'all-patients' },
    };
    await axios.put(`${baseUrl}/Group/all-patients`, group, { headers, timeout: 10_000 });
    this.logger.log('Seeded Group/all-patients (no-filter sentinel)');
  }

  private async publishMeasure(measureId: string): Promise<void> {
    const measure = this.loader.loadMeasure(measureId);
    const baseUrl = this.fhirClient.fhirServerUrl;
    const headers = {
      'Content-Type': 'application/fhir+json',
      Accept: 'application/fhir+json',
    };

    const fhirMeasureId = (measure.fhirMeasure['id'] as string | undefined) ?? measureId;
    await axios.put(`${baseUrl}/Measure/${fhirMeasureId}`, measure.fhirMeasure, {
      headers,
      timeout: 10_000,
    });
    this.logger.log(`Published Measure/${fhirMeasureId}`);
  }
}
