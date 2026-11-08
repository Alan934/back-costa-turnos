import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, Matches } from 'class-validator';

export const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Feriado tal como lo ve UN profesional en UN comercio (con su decisión efectiva). */
export class MembershipHolidayDto {
  @ApiProperty({ example: '2026-05-25', description: 'YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ example: 'Día de la Revolución de Mayo' })
  name!: string;

  @ApiProperty({
    example: 'inamovible',
    description: 'inamovible | trasladable | puente | nolaborable',
  })
  kind!: string;

  @ApiProperty({
    description:
      'Decisión efectiva para este profesional: true = trabaja ese feriado (la agenda queda abierta), ' +
      'false = no trabaja (la agenda queda bloqueada). Sale de la excepción si hay, o del ajuste general.',
  })
  works!: boolean;

  @ApiProperty({
    description:
      'true si el profesional definió una excepción puntual para este feriado (pisa el ajuste general).',
  })
  overridden!: boolean;
}

export class HolidaysQueryDto {
  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Desde (YYYY-MM-DD). Default: 1 de enero del año actual.',
  })
  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: 'from debe ser YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Hasta (YYYY-MM-DD). Default: 31 de diciembre del año de `from`.',
  })
  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: 'to debe ser YYYY-MM-DD' })
  to?: string;
}

export class SetHolidayOverrideDto {
  @ApiProperty({
    description:
      'true = este feriado sí trabajo; false = este feriado no trabajo. Pisa el ajuste general ' +
      '(`worksHolidays`) solo para esta fecha.',
  })
  @IsBoolean()
  works!: boolean;
}
