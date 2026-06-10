import { ApiProperty } from '@nestjs/swagger';

export class AdminMetricsTotalsDto {
  @ApiProperty({ type: Number })
  activeProfessionals!: number;
  @ApiProperty({ type: Number, description: 'MRR en centavos' })
  mrrCents!: number;
  @ApiProperty({ type: Number })
  newThisMonth!: number;
  @ApiProperty({ type: Number })
  churnThisMonth!: number;
}

export class ActiveByMonthDto {
  @ApiProperty({ example: 'Ene' })
  label!: string;
  @ApiProperty({ type: Number })
  activos!: number;
}

export class MrrByMonthDto {
  @ApiProperty({ example: 'Ene' })
  label!: string;
  @ApiProperty({ type: Number })
  cents!: number;
}

export class GrowthByMonthDto {
  @ApiProperty({ example: 'Ene' })
  label!: string;
  @ApiProperty({ type: Number })
  altas!: number;
  @ApiProperty({ type: Number })
  bajas!: number;
}

export class AdminMetricsDto {
  @ApiProperty({ type: AdminMetricsTotalsDto })
  totals!: AdminMetricsTotalsDto;
  @ApiProperty({ type: ActiveByMonthDto, isArray: true })
  activeByMonth!: ActiveByMonthDto[];
  @ApiProperty({ type: MrrByMonthDto, isArray: true })
  mrrByMonth!: MrrByMonthDto[];
  @ApiProperty({ type: GrowthByMonthDto, isArray: true })
  growthByMonth!: GrowthByMonthDto[];
}
