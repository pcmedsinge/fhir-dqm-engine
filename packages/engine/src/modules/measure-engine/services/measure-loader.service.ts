import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { MeasureEngineConfig } from '../measure-engine.config';
import type { LoadedMeasure, ValueSetMap } from '../interfaces/loaded-measure.interface';

@Injectable()
export class MeasureLoaderService {
  private readonly logger = new Logger(MeasureLoaderService.name);
  private readonly cache = new Map<string, LoadedMeasure>();

  constructor(private readonly config: MeasureEngineConfig) {}

  listMeasureIds(): string[] {
    return readdirSync(this.config.measuresPath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => d.name);
  }

  loadMeasure(id: string): LoadedMeasure {
    if (this.cache.has(id)) return this.cache.get(id)!;

    const measureDir = path.join(this.config.measuresPath, id);
    if (!existsSync(measureDir)) throw new NotFoundException(`Measure '${id}' not found`);

    const elmDir = path.join(measureDir, 'elm');
    const elmLibraries: Record<string, unknown> = {};
    let mainLibraryId = '';
    let mainLibraryVersion = '';

    for (const file of readdirSync(elmDir)) {
      if (!file.endsWith('.json')) continue;
      const elm = JSON.parse(readFileSync(path.join(elmDir, file), 'utf8')) as Record<
        string,
        unknown
      >;
      const libInfo = (elm as { library?: { identifier?: { id?: string; version?: string } } })
        .library?.identifier;
      const libId = libInfo?.id ?? file.replace('.json', '');
      elmLibraries[libId] = elm;
    }

    if (!mainLibraryId) {
      const candidates = Object.keys(elmLibraries).filter(
        (k) => !['FHIRHelpers', 'QICoreCommon', 'SupplementalDataElements'].includes(k),
      );
      mainLibraryId =
        candidates.sort((a, b) => b.length - a.length)[0] ?? Object.keys(elmLibraries)[0];
      const elm = elmLibraries[mainLibraryId] as {
        library?: { identifier?: { version?: string } };
      };
      mainLibraryVersion = elm.library?.identifier?.version ?? '0.1.000';
    }

    const measureFiles = readdirSync(measureDir).filter(
      (f) => f.startsWith('Measure-') && f.endsWith('.json'),
    );
    const fhirMeasure: Record<string, unknown> =
      measureFiles.length > 0
        ? (JSON.parse(readFileSync(path.join(measureDir, measureFiles[0]), 'utf8')) as Record<
            string,
            unknown
          >)
        : {};

    const vsPath = path.join(measureDir, 'value-sets', 'valueSets.json');
    const valueSets: ValueSetMap = existsSync(vsPath)
      ? (JSON.parse(readFileSync(vsPath, 'utf8')) as ValueSetMap)
      : {};

    const loaded: LoadedMeasure = {
      id,
      fhirMeasure,
      elmLibraries,
      valueSets,
      mainLibraryId,
      mainLibraryVersion,
    };
    this.cache.set(id, loaded);
    this.logger.log(`Loaded measure '${id}' (${Object.keys(elmLibraries).length} libraries)`);
    return loaded;
  }
}
