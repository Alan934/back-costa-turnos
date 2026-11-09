import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { InvitationStatus, WaitingRoomStatus } from '@/common/enums';
import { TitleCase } from '@/common/decorators/title-case.decorator';
import { WaitingRoomWhatsappMessagesDto } from './waiting-room-whatsapp-messages.dto';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateComercioDto {
  @ApiProperty({ example: 'Peluquería Centro' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  name!: string;

  @ApiProperty({ example: 'peluqueria-centro', description: 'slug único para /r/:slug' })
  @IsString()
  @Matches(SLUG_REGEX, { message: 'slug debe ser kebab-case (a-z, 0-9, guiones)' })
  slug!: string;

  @ApiPropertyOptional({ example: 'Belgrano 245, Costa de Araujo, Mendoza' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'America/Argentina/Buenos_Aires' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateComercioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @TitleCase()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;
}

/** El profesional edita SU membresía en un comercio (p.ej. su dirección propia). */
export class UpdateMembershipDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Dirección propia en este comercio. null/"" = usa la del comercio (fallback).',
  })
  @IsOptional()
  @IsString()
  address?: string | null;

  @ApiPropertyOptional({
    type: Number,
    example: 8,
    description:
      'Anticipación mínima de reserva, en horas. Un cliente solo puede reservar un turno que empiece al menos estas horas en el futuro. 0 = sin restricción.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  minBookingHours?: number;

  @ApiPropertyOptional({
    type: Number,
    example: 30,
    description:
      'Ventana máxima de reserva, en días. Un cliente solo puede reservar un turno que empiece como mucho estos días en el futuro (7 = una semana, 30 = un mes). 0 = sin límite.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(730)
  maxBookingDays?: number;

  @ApiPropertyOptional({
    type: Boolean,
    example: false,
    description:
      'Si es true, un turno reservado sin seña (cuando el servicio admite pago) queda provisional y puede ser desplazado por otro cliente que pague la seña. false (default) = el turno sin seña queda firme.',
  })
  @IsOptional()
  @IsBoolean()
  allowProvisionalBookings?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    example: false,
    description:
      'Atiende SIEMPRE por orden de llegada: no ofrece turnos con horario. Reversible: al apagarlo, ' +
      'cada franja de trabajo vuelve a su modo (con turno / por orden de llegada).',
  })
  @IsOptional()
  @IsBoolean()
  walkInOnly?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    example: true,
    description:
      '¿Trabaja los feriados nacionales? true (default) = la agenda no se bloquea. false = cada ' +
      'feriado bloquea el día, salvo los que el profesional marque puntualmente como "sí trabajo" ' +
      '(PUT /comercios/:comercioId/holidays/:date). Con true también puede marcar un feriado ' +
      'puntual como "no trabajo".',
  })
  @IsOptional()
  @IsBoolean()
  worksHolidays?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    example: true,
    description:
      'Publica la sala de espera de esta agenda en /r/:slug/sala (la pantalla del QR del local).',
  })
  @IsOptional()
  @IsBoolean()
  waitingRoomEnabled?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    example: false,
    description:
      'Permite que el cliente se anote solo escaneando el QR. Entra como pendiente hasta que el profesional lo acepta.',
  })
  @IsOptional()
  @IsBoolean()
  waitingRoomSelfCheckIn?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    example: false,
    description:
      'Al anotarse por el QR el cliente elige el servicio. Apagado (default): solo se anota y el ' +
      'profesional completa el servicio al atenderlo (con un único servicio se asigna solo).',
  })
  @IsOptional()
  @IsBoolean()
  waitingRoomAskService?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    example: false,
    description:
      'Quien se anota por el QR entra directo a la fila. Apagado (default): queda pendiente hasta ' +
      'que el profesional lo acepta.',
  })
  @IsOptional()
  @IsBoolean()
  waitingRoomAutoAccept?: boolean;

  @ApiPropertyOptional({
    type: Number,
    example: 30,
    minimum: 5,
    maximum: 240,
    description:
      'Minutos que se demora con cada cliente de la sala que no tiene servicio (se anotó sin ' +
      'elegir). Default 30. Estima la espera de los que vienen detrás.',
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  waitingRoomDefaultMinutes?: number;

  @ApiPropertyOptional({
    enum: WaitingRoomStatus,
    enumName: 'WaitingRoomStatus',
    description: 'Estado que ve el cliente en la pantalla pública: open | paused | closed.',
  })
  @IsOptional()
  @IsEnum(WaitingRoomStatus)
  waitingRoomStatus?: WaitingRoomStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Aclaración libre para la pantalla pública ("vuelvo 15:30"). null/"" = sin nota.',
  })
  @IsOptional()
  @IsString()
  waitingRoomNote?: string | null;

  @ApiPropertyOptional({
    type: () => WaitingRoomWhatsappMessagesDto,
    nullable: true,
    description:
      'Mensajes de WhatsApp personalizados para avisar a quien espera (called | next | waiting). ' +
      'Se reemplazan completos; una clave ausente o vacía usa el texto por defecto. null = todos por defecto.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => WaitingRoomWhatsappMessagesDto)
  waitingRoomWhatsappMessages?: WaitingRoomWhatsappMessagesDto | null;

  @ApiPropertyOptional({
    type: Boolean,
    example: false,
    description:
      'Compartir con el dueño del comercio lo que cobrás y facturás (Métricas del equipo). ' +
      'false (default) = el comercio solo ve tu actividad, nunca tu plata.',
  })
  @IsOptional()
  @IsBoolean()
  shareIncomeWithComercio?: boolean;
}

export class InviteProfessionalDto {
  @ApiProperty({ example: 'profesional@mail.com' })
  @IsEmail()
  email!: string;
}

export class AcceptInvitationDto {
  @ApiProperty({ description: 'token recibido en el email de invitación' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}

/**
 * Datos públicos de una invitación, para que la landing decida si el profesional
 * debe registrarse o ingresar. No expone datos sensibles del comercio ni del usuario.
 */
export class InvitationPreviewDto {
  @ApiProperty({ example: 'Studio 34' })
  comercioName!: string;

  @ApiProperty({ example: 'pro@email.com', description: 'email invitado (pre-carga el form)' })
  email!: string;

  @ApiProperty({ enum: InvitationStatus, enumName: 'InvitationStatus' })
  status!: InvitationStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({
    description: 'true si ya existe una cuenta con login para ese email → guiar a ingresar',
  })
  accountExists!: boolean;

  @ApiProperty({ description: 'true si esa cuenta ya tiene perfil de profesional (informativo)' })
  isProfessional!: boolean;
}

/** Admin crea una cuenta comercial + su comercio. */
export class CreateComercialDto {
  @ApiProperty({ example: 'comercial@peluqueria.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Peluquería Centro' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  comercioName!: string;

  @ApiProperty({ example: 'peluqueria-centro' })
  @IsString()
  @Matches(SLUG_REGEX, { message: 'slug debe ser kebab-case (a-z, 0-9, guiones)' })
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;
}
