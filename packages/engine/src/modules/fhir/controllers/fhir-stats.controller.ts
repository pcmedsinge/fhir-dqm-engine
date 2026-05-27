import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FhirClientService } from '../fhir.client.service';

const STAT_RESOURCE_TYPES = [
  'Patient',
  'Encounter',
  'Observation',
  'Condition',
  'Procedure',
  'MedicationRequest',
  'DiagnosticReport',
] as const;

@ApiTags('fhir')
@Controller('v1/fhir')
export class FhirStatsController {
  constructor(private readonly fhirClient: FhirClientService) {}

  @Get('stats')
  @ApiOperation({ summary: 'FHIR resource counts by type' })
  async getStats(): Promise<{
    fhirServerUrl: string;
    fhirVersion: string;
    resourceCounts: Record<string, number>;
  }> {
    const counts = await Promise.all(
      STAT_RESOURCE_TYPES.map(async (type) => ({
        type,
        count: await this.fhirClient.getResourceCount(type),
      })),
    );

    let fhirVersion = 'unknown';
    try {
      const cap = await this.fhirClient.getCapabilityStatement();
      fhirVersion = cap.fhirVersion;
    } catch {
      // non-fatal — stats still useful even if metadata fails
    }

    const resourceCounts = Object.fromEntries(counts.map(({ type, count }) => [type, count]));

    return {
      fhirServerUrl: this.fhirClient.fhirServerUrl,
      fhirVersion,
      resourceCounts,
    };
  }
}
