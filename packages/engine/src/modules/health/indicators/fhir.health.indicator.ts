import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { FhirClientService } from '../../fhir/fhir.client.service';

@Injectable()
export class FhirHealthIndicator extends HealthIndicator {
  constructor(private readonly fhirClient: FhirClientService) {
    super();
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      const cap = await this.fhirClient.getCapabilityStatement();
      const responseTimeMs = Date.now() - start;
      return this.getStatus('fhir', true, {
        url: this.fhirClient.fhirServerUrl,
        fhirVersion: cap.fhirVersion,
        responseTimeMs,
      });
    } catch (err) {
      const responseTimeMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      // Return soft-down: indicator is "down" but we don't throw,
      // so overall /health still returns HTTP 200 with status: ok.
      return this.getStatus('fhir', false, {
        url: this.fhirClient.fhirServerUrl,
        responseTimeMs,
        error: message.slice(0, 120),
      });
    }
  }
}
