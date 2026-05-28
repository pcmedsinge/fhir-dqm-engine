import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ComputeRequestDto {
  @ApiProperty({ example: '2025-01-01', description: 'Measurement period start (ISO date)' })
  @IsNotEmpty()
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2025-12-31', description: 'Measurement period end (ISO date)' })
  @IsNotEmpty()
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({
    example: 'all-patients',
    description: 'FHIR Group ID to scope the compute to. Defaults to all patients.',
  })
  @IsOptional()
  @IsString()
  cohortId?: string;
}
