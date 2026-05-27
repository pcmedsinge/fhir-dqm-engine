export interface LoadedMeasure {
  id: string;
  fhirMeasure: Record<string, unknown>;
  elmLibraries: Record<string, unknown>;
  valueSets: ValueSetMap;
  mainLibraryId: string;
  mainLibraryVersion: string;
}

export type ValueSetMap = Record<string, ValueSetEntry[]>;

export interface ValueSetEntry {
  code: string;
  system: string;
  version: string;
  display: string;
}
