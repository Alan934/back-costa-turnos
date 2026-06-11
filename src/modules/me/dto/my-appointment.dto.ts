import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@/common/enums';

export class MyAppointmentBusinessDto {
  @ApiProperty()
  name!: string;
  @ApiProperty()
  slug!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  address!: string | null;
  @ApiProperty({ type: Number })
  cancellationWindowHours!: number;
}

export class MyAppointmentDto {
  @ApiProperty()
  id!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  startAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  endAt!: string;
  @ApiProperty({ enum: AppointmentStatus, enumName: 'AppointmentStatus' })
  status!: AppointmentStatus;
  @ApiProperty({ type: Boolean })
  isProvisional!: boolean;
  @ApiProperty()
  serviceName!: string;
  @ApiProperty({ type: Number })
  priceCents!: number;
  @ApiProperty()
  staffName!: string;
  @ApiProperty({ type: MyAppointmentBusinessDto })
  business!: MyAppointmentBusinessDto;
}
