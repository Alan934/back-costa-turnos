import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Filtro por estado de soft-delete para los listados admin.
 * `all` = activos + eliminados (default, no rompe el comportamiento previo).
 */
export enum ListStatusFilter {
  Active = 'active',
  Deleted = 'deleted',
  All = 'all',
}

/** Query de paginado + busqueda libre + filtro por estado. `page` arranca en 1. */
export class PaginationQueryDto {
  @ApiProperty({ required: false, description: 'Texto de busqueda libre' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({
    required: false,
    enum: ListStatusFilter,
    enumName: 'ListStatusFilter',
    default: ListStatusFilter.All,
    description: 'active = solo activos; deleted = solo eliminados; all = ambos (default)',
  })
  @IsOptional()
  @IsEnum(ListStatusFilter)
  status?: ListStatusFilter = ListStatusFilter.All;

  @ApiProperty({ required: false, default: 1, minimum: 1, description: 'Pagina (1-based)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

/**
 * Sobre de paginado. Es generico: cada endpoint declara su propio DTO de items
 * extendiendo este y tipando `items` (Swagger no infiere genericos).
 */
export class PaginatedDto<T> {
  items!: T[];

  @ApiProperty({ type: Number, description: 'Total de registros que matchean (sin paginar)' })
  total!: number;

  @ApiProperty({ type: Number, description: 'Pagina actual (1-based)' })
  page!: number;

  @ApiProperty({ type: Number })
  pageSize!: number;
}

/** Normaliza page/pageSize y calcula skip/take para TypeORM. */
export function resolvePagination(query: PaginationQueryDto): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
