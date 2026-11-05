import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl, ValidateNested } from 'class-validator';

export class PushKeysDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  auth!: string;
}

/** `PushSubscription.toJSON()` del navegador, tal cual. */
export class PushSubscriptionDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/…' })
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false })
  endpoint!: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class PushUnsubscribeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  endpoint!: string;
}

export class PushPublicKeyDto {
  @ApiProperty({ description: 'false = el servidor no tiene claves VAPID: ocultá el botón.' })
  enabled!: boolean;

  @ApiProperty({ description: 'Clave pública VAPID para `pushManager.subscribe`.' })
  publicKey!: string;
}
