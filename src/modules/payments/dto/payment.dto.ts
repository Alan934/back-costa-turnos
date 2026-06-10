import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';

export class CreatePreferenceDto {
  @ApiPropertyOptional({ example: 'cliente@mail.com' })
  @IsOptional()
  @IsEmail()
  payerEmail?: string;
}
