import { Module } from '@nestjs/common';
import { ValueSetIntegrityService } from './value-set-integrity.service';

@Module({
  providers: [ValueSetIntegrityService],
  exports: [ValueSetIntegrityService],
})
export class ValueSetIntegrityModule {}
