import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreatePreferenceDto {
  @ApiPropertyOptional({ example: 'cliente@mail.com' })
  @IsOptional()
  @IsEmail()
  payerEmail?: string;
}

export class DeferPaymentDto {
  @ApiPropertyOptional({ description: 'Motivo del pagaré (lo que quedaron en pagar después)' })
  @IsOptional()
  @IsString()
  note?: string;
}
