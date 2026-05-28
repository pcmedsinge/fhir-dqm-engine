import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MeasureEngineConfig } from '../measure-engine/measure-engine.config';
import type { ValueSetEntry, ValueSetIntegrityEntry, ValueSetMap } from '../measure-engine/interfaces/loaded-measure.interface';

interface SupplementFile {
  valueSetOid: string;
  valueSetName?: string;
  reason?: string;
  addedCodes: ValueSetEntry[];
  sourceFile: string;
}

@Injectable()
export class ValueSetIntegrityService {
  private readonly logger = new Logger(ValueSetIntegrityService.name);

  constructor(private readonly config: MeasureEngineConfig) {}

  applySupplements(
    canonicalValueSets: ValueSetMap,
  ): { valueSets: ValueSetMap; metadata: ValueSetIntegrityEntry[] } {
    const supplementsDir = path.join(this.config.measuresPath, '_synthetic-supplements');
    const supplements = this.loadSupplements(supplementsDir);
    const supplementsByOid = new Map(supplements.map((s) => [s.valueSetOid, s]));

    const merged: ValueSetMap = {};
    const metadata: ValueSetIntegrityEntry[] = [];

    for (const [oid, entries] of Object.entries(canonicalValueSets)) {
      const supplement = supplementsByOid.get(oid);

      if (supplement && this.config.allowSyntheticSupplements) {
        const allEntries = [...entries, ...supplement.addedCodes];
        merged[oid] = allEntries;
        metadata.push({
          oid,
          name: supplement.valueSetName,
          classification: 'LOCAL-MODIFIED',
          canonicalCount: entries.length,
          activeCount: allEntries.length,
          supplementCount: supplement.addedCodes.length,
          contentHash: this.computeHash(allEntries),
          supplementFile: supplement.sourceFile,
          supplementReason: supplement.reason,
        });
        this.logger.warn(
          `ValueSet ${oid}: LOCAL-MODIFIED — ${supplement.addedCodes.length} synthetic codes added from ${supplement.sourceFile}. Results are NOT VSAC-spec-compliant.`,
        );
      } else {
        merged[oid] = entries;
        metadata.push({
          oid,
          classification: 'VSAC-CANONICAL',
          canonicalCount: entries.length,
          activeCount: entries.length,
          supplementCount: 0,
          contentHash: this.computeHash(entries),
        });
      }
    }

    return { valueSets: merged, metadata };
  }

  private loadSupplements(supplementsDir: string): SupplementFile[] {
    if (!existsSync(supplementsDir)) return [];
    return readdirSync(supplementsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const raw = JSON.parse(
          readFileSync(path.join(supplementsDir, f), 'utf8'),
        ) as Omit<SupplementFile, 'sourceFile'>;
        return { ...raw, sourceFile: f };
      });
  }

  private computeHash(entries: ValueSetEntry[]): string {
    const sorted = entries
      .map((e) => `${e.system}|${e.code}`)
      .sort()
      .join('\n');
    return createHash('sha256').update(sorted).digest('hex');
  }
}
