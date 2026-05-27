import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import path from 'node:path';

@Injectable()
export class MeasureEngineConfig {
  readonly measuresPath: string;
  readonly persistToFhir: boolean;

  constructor(config: ConfigService) {
    this.measuresPath = config.get<string>(
      'MEASURES_PATH',
      path.resolve('packages/engine/measures'),
    );
    this.persistToFhir = config.get<string>('MEASUREREPORT_PERSIST_TO_FHIR', 'true') === 'true';
  }
}
