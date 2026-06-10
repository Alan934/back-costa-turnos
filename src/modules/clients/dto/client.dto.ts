import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { FichaFieldType } from '@/common/enums';

export class CreateFichaFieldDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ enum: FichaFieldType })
  @IsEnum(FichaFieldType)
  type!: FichaFieldType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVisibleToClient?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  displayOrder?: number;
}

export class UpdateFichaFieldDto extends PartialType(CreateFichaFieldDto) {}

export class CreateClientDto {
  @ApiProperty({ example: 'Maria Lopez' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+54 9 11 5555-5555' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'valores de ficha indexados por ficha_field.id' })
  @IsOptional()
  @IsObject()
  fichaValues?: Record<string, unknown>;
}

export class UpdateClientFichaDto {
  @ApiProperty({ description: 'valores de ficha indexados por ficha_field.id' })
  @IsObject()
  fichaValues!: Record<string, unknown>;
}

export class CreateClientNoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({ description: 'staff autor de la nota' })
  @IsOptional()
  @IsString()
  authorStaffId?: string;
}
