import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { CombinationRuleType, DiscountType } from '@/common/enums';

export class CreateCombinationRuleDto {
  @ApiProperty({ format: 'uuid', description: 'Servicio trigger (el que habilita/afecta)' })
  @IsUUID()
  @IsNotEmpty()
  sourceServiceId!: string;

  @ApiProperty({ format: 'uuid', description: 'Servicio afectado por la regla' })
  @IsUUID()
  @IsNotEmpty()
  targetServiceId!: string;

  @ApiProperty({ enum: CombinationRuleType, enumName: 'CombinationRuleType' })
  @IsEnum(CombinationRuleType)
  ruleType!: CombinationRuleType;

  @ApiPropertyOptional({
    description:
      'Descripción opcional de la relación: qué se realiza al combinar estos servicios o ' +
      'qué tener en cuenta para relacionarlos',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Monto del descuento en centavos. Requerido cuando ruleType=discount',
  })
  @ValidateIf((o) => o.ruleType === CombinationRuleType.Discount)
  @IsInt()
  @Min(0)
  discountAmountCents?: number;

  @ApiPropertyOptional({
    enum: DiscountType,
    enumName: 'DiscountType',
    description: 'Tipo de descuento. Requerido cuando ruleType=discount',
  })
  @ValidateIf((o) => o.ruleType === CombinationRuleType.Discount)
  @IsEnum(DiscountType)
  discountType?: DiscountType;
}
