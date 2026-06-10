import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRaffleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class CreatePrizeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'object_key del archivo en MinIO' })
  @IsOptional()
  @IsString()
  photoKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  displayOrder?: number;
}

export class AddEntryDto {
  @ApiProperty()
  @IsInt()
  number!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personId?: string;
}

export class ParticipantByEmailDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty()
  @IsInt()
  number!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;
}

export class AddParticipantsByEmailDto {
  @ApiProperty({ type: [ParticipantByEmailDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantByEmailDto)
  participants!: ParticipantByEmailDto[];
}
