import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
import { DepositMode } from '@/common/enums';
import { IsEnum } from 'class-validator';
import { TitleCase } from '@/common/decorators/title-case.decorator';

export class OnboardProfessionalDto {
  @ApiProperty({ example: 'Peluqueria Mi Pueblo' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  businessName!: string;

  @ApiProperty({ example: 'mi-peluqueria', description: 'slug unico para /r/:slug' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug debe ser kebab-case (a-z, 0-9, guiones)',
  })
  slug!: string;

  @ApiPropertyOptional({ example: 'America/Argentina/Buenos_Aires' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'Belgrano 245, Costa de Araujo, Mendoza' })
  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateProfessionalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @TitleCase()
  businessName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'Belgrano 245, Costa de Araujo, Mendoza' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ enum: DepositMode })
  @IsOptional()
  @IsEnum(DepositMode)
  defaultDepositMode?: DepositMode;

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @IsInt()
  @Min(0)
  cancellationWindowHours?: number;
}

export class CreateStaffDto {
  @ApiProperty({ example: 'Sillon 1 - Maria' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  displayName!: string;
}

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
