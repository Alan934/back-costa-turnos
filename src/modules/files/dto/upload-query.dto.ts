import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches } from 'class-validator';

/**
 * Query de POST /files. `ownerType` termina formando parte del object_key en el bucket, así que
 * se restringe a un identificador simple (nada de "/", "..", espacios, etc.).
 */
export class UploadFileQueryDto {
  @ApiProperty({
    example: 'service',
    description: 'Tipo de dueño (service, professional_logo, client_ficha…)',
  })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,40}$/, {
    message: 'ownerType debe ser minúsculas, números y guion bajo (2-41 caracteres)',
  })
  ownerType!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ownerId!: string;
}
