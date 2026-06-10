import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateWaitlistDto {
  @ApiProperty()
  @IsString()
  personId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiProperty({ example: '2026-06-10T00:00:00Z' })
  @IsISO8601()
  desiredFrom!: string;

  @ApiProperty({ example: '2026-06-12T00:00:00Z' })
  @IsISO8601()
  desiredTo!: string;
}
