import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CohortService } from './cohort.service';

@ApiTags('cohorts')
@Controller('v1/cohorts')
export class CohortController {
  constructor(private readonly cohortService: CohortService) {}

  @Get()
  @ApiOperation({ summary: 'List all FHIR Group resources registered as cohorts' })
  async listCohorts() {
    const groups = await this.cohortService.listCohorts();
    return {
      count: groups.length,
      cohorts: groups.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        memberCount: g.member?.length ?? 0,
      })),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific cohort Group by ID' })
  async getCohort(@Param('id') id: string) {
    return this.cohortService.getCohort(id);
  }
}
