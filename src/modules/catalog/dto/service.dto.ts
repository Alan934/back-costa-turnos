import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { DepositMode } from '@/common/enums';

export class CreateServiceDto {
  @ApiProperty({ example: 'Corte de pelo' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 30, description: 'duracion en minutos' })
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @ApiProperty({ example: 500000, description: 'precio en centavos' })
  @IsInt()
  @Min(0)
  priceCents!: number;

  @ApiPropertyOptional({ enum: DepositMode })
  @IsOptional()
  @IsEnum(DepositMode)
  depositMode?: DepositMode;

  @ApiPropertyOptional({ example: 200000, description: 'sena en centavos' })
  @IsOptional()
  @IsInt()
  @Min(0)
  depositAmountCents?: number;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
