import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Largo máximo de cada mensaje (WhatsApp corta los links muy largos; 1000 sobra para un aviso). */
export const WHATSAPP_MESSAGE_MAX = 1000;

const DESCRIPTION =
  'Texto personalizado. Admite {nombre}, {profesional}, {numero}, {personas}, {minutos} y ' +
  '{telefono}. Ausente o vacío = se usa el mensaje por defecto.';

/**
 * Mensajes de WhatsApp con los que el profesional avisa a quien espera en la sala, según la
 * situación del cliente. Cada uno es opcional: si falta, la app usa su texto por defecto.
 */
export class WaitingRoomWhatsappMessagesDto {
  @ApiPropertyOptional({
    type: String,
    description: `Cuando ya se lo llamó. ${DESCRIPTION}`,
    maxLength: WHATSAPP_MESSAGE_MAX,
  })
  @IsOptional()
  @IsString()
  @MaxLength(WHATSAPP_MESSAGE_MAX)
  called?: string;

  @ApiPropertyOptional({
    type: String,
    description: `Cuando es el siguiente en la fila. ${DESCRIPTION}`,
    maxLength: WHATSAPP_MESSAGE_MAX,
  })
  @IsOptional()
  @IsString()
  @MaxLength(WHATSAPP_MESSAGE_MAX)
  next?: string;

  @ApiPropertyOptional({
    type: String,
    description: `Cuando todavía hay gente antes. ${DESCRIPTION}`,
    maxLength: WHATSAPP_MESSAGE_MAX,
  })
  @IsOptional()
  @IsString()
  @MaxLength(WHATSAPP_MESSAGE_MAX)
  waiting?: string;
}
