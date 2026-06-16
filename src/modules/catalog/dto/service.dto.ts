import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { TitleCase } from '@/common/decorators/title-case.decorator';

export class CreateServiceDto {
  @ApiProperty({ example: 'Corte de pelo' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  name!: string;

  @ApiProperty({ example: 30, description: 'duracion en minutos' })
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @ApiProperty({ example: 500000, description: 'precio (pago completo) en centavos' })
  @IsInt()
  @Min(0)
  priceCents!: number;

  // ---- Opciones de pago (checkboxes; se pueden combinar) ----
  @ApiPropertyOptional({ type: Boolean, description: 'Permitir reservar con seña' })
  @IsOptional()
  @IsBoolean()
  allowDeposit?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Permitir reservar con pago completo' })
  @IsOptional()
  @IsBoolean()
  allowFullPayment?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Permitir reservar sin pagar' })
  @IsOptional()
  @IsBoolean()
  allowNoPayment?: boolean;

  @ApiPropertyOptional({ example: 200000, description: 'monto de la seña en centavos' })
  @IsOptional()
  @IsInt()
  @Min(0)
  depositAmountCents?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Cuántos clientes pueden reservar el mismo horario (default 1)',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
