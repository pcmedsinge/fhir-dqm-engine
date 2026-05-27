import { IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ComputeRequestDto {
  @ApiProperty({ example: '2026-01-01', description: 'Measurement period start (ISO date)' })
  @IsNotEmpty()
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-12-31', description: 'Measurement period end (ISO date)' })
  @IsNotEmpty()
  @IsDateString()
  periodEnd!: string;
}
