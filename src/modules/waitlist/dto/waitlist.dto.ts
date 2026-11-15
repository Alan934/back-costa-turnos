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

/** Entrada de la lista de espera con los datos que el profesional necesita para contactarla. */
export class WaitlistItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['waiting', 'notified', 'converted', 'expired'] })
  status!: 'waiting' | 'notified' | 'converted' | 'expired';

  @ApiProperty({ type: String, format: 'date-time' })
  desiredFrom!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  desiredTo!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Cuándo se anotó' })
  createdAt!: string;

  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  serviceId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  serviceName!: string | null;
}
