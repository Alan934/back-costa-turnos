import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ConsentType } from '@/common/enums';

export class RecordConsentDto {
  @ApiProperty({ enum: ConsentType })
  @IsEnum(ConsentType)
  type!: ConsentType;

  @ApiProperty({ example: 'v1.0', description: 'version del texto aceptado' })
  @IsString()
  @IsNotEmpty()
  version!: string;
}
