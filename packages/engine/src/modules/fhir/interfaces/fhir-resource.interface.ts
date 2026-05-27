/** Minimal FHIR R4 type shapes used by FhirClientService. */

export interface FhirResource {
  resourceType: string;
  id?: string;
}

export interface FhirBundle<T extends FhirResource = FhirResource> extends FhirResource {
  resourceType: 'Bundle';
  type: string;
  total?: number;
  entry?: Array<{ resource?: T }>;
}

export interface FhirCapabilityStatement extends FhirResource {
  resourceType: 'CapabilityStatement';
  fhirVersion: string;
  status: string;
}

export interface FhirOperationOutcome extends FhirResource {
  resourceType: 'OperationOutcome';
  issue: Array<{ severity: string; code: string; diagnostics?: string }>;
}
