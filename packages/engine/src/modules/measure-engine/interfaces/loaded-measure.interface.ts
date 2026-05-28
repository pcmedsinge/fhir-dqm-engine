export interface LoadedMeasure {
  id: string;
  fhirMeasure: Record<string, unknown>;
  elmLibraries: Record<string, unknown>;
  valueSets: ValueSetMap;
  mainLibraryId: string;
  mainLibraryVersion: string;
  valueSetMetadata: ValueSetIntegrityEntry[];
}

export type ValueSetMap = Record<string, ValueSetEntry[]>;

export interface ValueSetEntry {
  code: string;
  system: string;
  version: string | null;
  display: string;
}

export interface ValueSetIntegrityEntry {
  oid: string;
  name?: string;
  classification: 'VSAC-CANONICAL' | 'LOCAL-MODIFIED' | 'LOCAL-CUSTOM';
  canonicalCount: number;
  activeCount: number;
  supplementCount: number;
  contentHash: string;
  supplementFile?: string;
  supplementReason?: string;
}
