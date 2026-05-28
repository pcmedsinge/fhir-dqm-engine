import { Body, Controller, Get, Param, Post, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ComputeRequestDto } from '../dto/compute-request.dto';
import { MeasureLoaderService } from '../services/measure-loader.service';
import { CqlRuntimeService } from '../services/cql-runtime.service';
import { MeasureReportService } from '../services/measure-report.service';
import { CohortService } from '../../cohort/cohort.service';
import { CareGapService } from '../../care-gap/care-gap.service';
import { FhirClientService } from '../../fhir/fhir.client.service';
import type { FhirResource } from '../../fhir/interfaces/fhir-resource.interface';

type FhirMeasureReport = FhirResource & Record<string, unknown>;

@ApiTags('measures')
@Controller('v1/measures')
export class MeasureController {
  private readonly logger = new Logger(MeasureController.name);

  constructor(
    private readonly loader: MeasureLoaderService,
    private readonly runtime: CqlRuntimeService,
    private readonly reporter: MeasureReportService,
    private readonly cohortService: CohortService,
    private readonly careGapService: CareGapService,
    private readonly fhirClient: FhirClientService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all measures the engine knows how to run' })
  listMeasures(): { measures: Array<{ id: string; title: string; description: string }> } {
    const ids = this.loader.listMeasureIds();
    const measures = ids.map((id) => {
      const m = this.loader.loadMeasure(id);
      const rawTitle = (m.fhirMeasure['title'] as string | undefined) ?? id;
      return {
        id,
        title: rawTitle.replace(/FHIR$/, '').trim(),
        description: (m.fhirMeasure['description'] as string | undefined) ?? '',
      };
    });
    return { measures };
  }

  @Post(':id/compute')
  @ApiOperation({ summary: 'Compute a measure and return a FHIR MeasureReport' })
  async compute(
    @Param('id') id: string,
    @Body() dto: ComputeRequestDto,
  ): Promise<Record<string, unknown>> {
    const cohortId = dto.cohortId ?? 'all-patients';
    this.logger.log(
      `Computing measure ${id} for ${dto.periodStart}/${dto.periodEnd} (cohort: ${cohortId})`,
    );
    const patientIds = await this.cohortService.resolvePatientIds(cohortId);
    const measure = this.loader.loadMeasure(id);
    const results = await this.runtime.execute(
      measure,
      dto.periodStart,
      dto.periodEnd,
      patientIds ?? undefined,
    );
    const report = this.reporter.assemble(measure, results, dto.periodStart, dto.periodEnd);
    await this.reporter.persist(report);
    return report;
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Fetch a MeasureReport from HAPI for this measure and period' })
  @ApiQuery({ name: 'periodStart', required: false, example: '2025-01-01' })
  @ApiQuery({ name: 'periodEnd', required: false, example: '2025-12-31' })
  async getReport(
    @Param('id') id: string,
    @Query('periodStart') periodStart = '2025-01-01',
    @Query('periodEnd') periodEnd = '2025-12-31',
  ): Promise<FhirMeasureReport> {
    const reportId = this.reporter.buildReportId(id, periodStart, periodEnd);
    return this.fhirClient.getResource<FhirMeasureReport>('MeasureReport', reportId);
  }

  @Get(':id/gaps')
  @ApiOperation({
    summary: 'Derive open care gaps from the stored MeasureReport. Run /compute first (returns 409 if no report exists).',
  })
  @ApiQuery({ name: 'periodStart', required: false, example: '2025-01-01' })
  @ApiQuery({ name: 'periodEnd', required: false, example: '2025-12-31' })
  @ApiQuery({ name: 'cohortId', required: false, example: 'all-patients' })
  async getGaps(
    @Param('id') id: string,
    @Query('periodStart') periodStart = '2025-01-01',
    @Query('periodEnd') periodEnd = '2025-12-31',
    @Query('cohortId') cohortId = 'all-patients',
  ) {
    const reportId = this.reporter.buildReportId(id, periodStart, periodEnd);
    return this.careGapService.deriveGapsFromReport(id, reportId, cohortId, periodStart, periodEnd);
  }

  @Get(':id/summary')
  @ApiOperation({ summary: 'HTML clinical summary card — open in browser for screenshots' })
  @ApiQuery({ name: 'periodStart', required: false, example: '2025-01-01' })
  @ApiQuery({ name: 'periodEnd', required: false, example: '2025-12-31' })
  async getSummary(
    @Param('id') id: string,
    @Query('periodStart') periodStart = '2025-01-01',
    @Query('periodEnd') periodEnd = '2025-12-31',
  ): Promise<string> {
    const measure = this.loader.loadMeasure(id);
    const reportId = this.reporter.buildReportId(id, periodStart, periodEnd);
    const report = await this.fhirClient.getResource<FhirMeasureReport>('MeasureReport', reportId);

    const group = (report['group'] as Array<Record<string, unknown>>)?.[0] ?? {};
    const pops = (group['population'] as Array<Record<string, unknown>>) ?? [];

    const getCount = (code: string): number => {
      const pop = pops.find((p) => {
        const coding =
          ((p['code'] as Record<string, unknown>)?.['coding'] as Array<Record<string, unknown>>) ??
          [];
        return coding[0]?.['code'] === code;
      });
      return (pop?.['count'] as number) ?? 0;
    };

    const ipp = getCount('initial-population');
    const denomExcl = getCount('denominator-exclusion');
    const numerator = getCount('numerator');
    const effectiveDenom = ipp - denomExcl;
    const score = ((group['measureScore'] as Record<string, unknown>)?.['value'] as number) ?? 0;
    const scorePercent = (score * 100).toFixed(1);
    const gaps = effectiveDenom - numerator;

    const pct = (n: number): number => (ipp > 0 ? Math.round((n / ipp) * 100) : 0);
    const numeratorPct = effectiveDenom > 0 ? Math.round((numerator / effectiveDenom) * 100) : 0;

    const rawTitle = (measure.fhirMeasure['title'] as string | undefined) ?? id;
    const title = rawTitle.replace(/FHIR$/, '').trim();
    const rawDesc = (measure.fhirMeasure['description'] as string | undefined) ?? '';
    const description = rawDesc.length > 220 ? rawDesc.slice(0, 217) + '…' : rawDesc;
    const measureFhirId = (measure.fhirMeasure['id'] as string | undefined) ?? id;

    return this.buildSummaryHtml({
      title,
      description,
      measureFhirId,
      periodStart,
      periodEnd,
      ipp,
      denomExcl,
      effectiveDenom,
      numerator,
      gaps,
      scorePercent,
      numeratorPct,
      pct,
    });
  }

  private buildSummaryHtml(d: {
    title: string;
    description: string;
    measureFhirId: string;
    periodStart: string;
    periodEnd: string;
    ipp: number;
    denomExcl: number;
    effectiveDenom: number;
    numerator: number;
    gaps: number;
    scorePercent: string;
    numeratorPct: number;
    pct: (n: number) => number;
  }): string {
    const {
      title,
      description,
      measureFhirId,
      periodStart,
      periodEnd,
      ipp,
      denomExcl,
      effectiveDenom,
      numerator,
      gaps,
      scorePercent,
      numeratorPct,
      pct,
    } = d;

    const row = (
      dot: string,
      label: string,
      barPct: number,
      barColor: string,
      count: number,
      countColor: string,
    ): string => `
      <div class="pop-row">
        <div class="pop-info">
          <div class="pop-dot" style="background:${dot};"></div>
          <div class="pop-name">${label}</div>
        </div>
        <div class="pop-bar-track">
          <div class="pop-bar-fill" style="width:${barPct}%;background:${barColor};"></div>
        </div>
        <div class="pop-count" style="color:${countColor};">${count}</div>
      </div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Pramana · ${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      background:#0f172a;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      min-height:100vh;
      display:flex;align-items:center;justify-content:center;
      padding:48px 20px;
    }
    .card{
      background:#1e293b;border-radius:20px;width:740px;
      overflow:hidden;
      box-shadow:0 32px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.06);
    }
    /* ── Header ── */
    .header{
      background:linear-gradient(135deg,#1d4ed8 0%,#6d28d9 100%);
      padding:36px 44px 30px;
    }
    .brand{
      font-size:11px;font-weight:700;
      color:rgba(255,255,255,0.5);
      text-transform:uppercase;letter-spacing:3px;
      margin-bottom:14px;
    }
    .measure-title{font-size:23px;font-weight:800;color:#fff;line-height:1.25;margin-bottom:10px;}
    .measure-desc{font-size:13px;color:rgba(255,255,255,0.58);line-height:1.6;margin-bottom:20px;}
    .period-badge{
      display:inline-flex;align-items:center;gap:7px;
      background:rgba(255,255,255,0.12);
      border:1px solid rgba(255,255,255,0.18);
      border-radius:100px;padding:5px 16px;
      font-size:12px;color:rgba(255,255,255,0.82);font-weight:500;
    }
    /* ── Body ── */
    .body{padding:40px 44px;}
    /* Score row */
    .score-section{
      display:flex;align-items:center;gap:32px;
      padding-bottom:36px;margin-bottom:36px;
      border-bottom:1px solid rgba(255,255,255,0.07);
    }
    .score-box{
      text-align:center;flex-shrink:0;
      background:rgba(16,185,129,0.08);
      border:2px solid rgba(16,185,129,0.28);
      border-radius:18px;padding:22px 32px;
    }
    .score-value{font-size:52px;font-weight:900;color:#10b981;line-height:1;letter-spacing:-2px;}
    .score-unit{font-size:12px;font-weight:700;color:rgba(16,185,129,0.65);text-transform:uppercase;letter-spacing:1.5px;margin-top:6px;}
    .score-context{flex:1;}
    .score-headline{font-size:16px;font-weight:600;color:rgba(255,255,255,0.9);line-height:1.55;margin-bottom:12px;}
    .score-headline strong{color:#10b981;}
    .score-sub{font-size:13px;color:rgba(255,255,255,0.4);line-height:1.6;}
    .score-sub strong{color:#ef4444;}
    /* Population breakdown */
    .section-label{
      font-size:11px;font-weight:700;
      color:rgba(255,255,255,0.3);
      text-transform:uppercase;letter-spacing:2px;
      margin-bottom:20px;
    }
    .pop-list{display:flex;flex-direction:column;gap:14px;}
    .pop-row{
      display:grid;
      grid-template-columns:1fr 180px 44px;
      align-items:center;gap:16px;
    }
    .pop-info{display:flex;align-items:center;gap:10px;}
    .pop-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}
    .pop-name{font-size:13px;color:rgba(255,255,255,0.6);}
    .pop-bar-track{height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;}
    .pop-bar-fill{height:100%;border-radius:3px;}
    .pop-count{font-size:15px;font-weight:700;text-align:right;}
    /* Footer */
    .footer{
      padding:18px 44px;
      background:rgba(0,0,0,0.22);
      border-top:1px solid rgba(255,255,255,0.05);
      display:flex;align-items:center;justify-content:space-between;
    }
    .status{display:flex;align-items:center;gap:7px;font-size:11px;color:rgba(255,255,255,0.3);}
    .status-dot{width:6px;height:6px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b981;}
    .footer-right{font-size:11px;color:rgba(255,255,255,0.22);}
  </style>
</head>
<body>
<div class="card">

  <div class="header">
    <div class="brand">Pramana &middot; HEDIS Quality Measure</div>
    <div class="measure-title">${title}</div>
    <div class="measure-desc">${description}</div>
    <div class="period-badge">&#128197; Measurement period: ${periodStart} &ndash; ${periodEnd}</div>
  </div>

  <div class="body">

    <div class="score-section">
      <div class="score-box">
        <div class="score-value">${scorePercent}%</div>
        <div class="score-unit">Measure Score</div>
      </div>
      <div class="score-context">
        <div class="score-headline">
          <strong>${numerator} of ${effectiveDenom}</strong> eligible patients had their
          blood pressure controlled (&lt;140/90&nbsp;mmHg) during the measurement period.
        </div>
        <div class="score-sub">
          <strong>${gaps}</strong> patient${gaps !== 1 ? 's' : ''} identified as open care gap${gaps !== 1 ? 's' : ''}
          &mdash; hypertensive but not at goal
        </div>
      </div>
    </div>

    <div class="section-label">Population Breakdown</div>
    <div class="pop-list">
      ${row('#3b82f6', 'Initial population &mdash; hypertensive, age 18&ndash;85, had a qualifying visit', 100, '#3b82f6', ipp, '#3b82f6')}
      ${row('#f59e0b', 'Excluded &mdash; kidney failure, dialysis, or pregnancy', pct(denomExcl), '#f59e0b', denomExcl, '#f59e0b')}
      ${row('#818cf8', 'Eligible denominator (after exclusions)', pct(effectiveDenom), '#818cf8', effectiveDenom, '#818cf8')}
      ${row('#10b981', 'Numerator &mdash; BP controlled (&lt;140/90&nbsp;mmHg)', numeratorPct, '#10b981', numerator, '#10b981')}
      ${row('#ef4444', 'Open care gaps &mdash; BP not at goal', pct(gaps), '#ef4444', gaps, '#ef4444')}
    </div>

  </div>

  <div class="footer">
    <div class="status">
      <div class="status-dot"></div>
      <span>Complete &middot; FHIR R4 MeasureReport</span>
    </div>
    <div class="footer-right">Pramana v0.3.0-alpha.1 &middot; cql-execution 3.3.0 &middot; Measure/${measureFhirId}</div>
  </div>

</div>
</body>
</html>`;
  }
}
