import { applyDecorators } from '@nestjs/common';
import { Matches } from 'class-validator';

/**
 * Celular argentino sin prefijos: 10 dígitos = característica (área) + número.
 * Ej: 2612465120 (261 = característica, resto = celular). Sin 0, sin 15, sin +54.
 */
export const PHONE_REGEX = /^\d{10}$/;

export const PHONE_DESCRIPTION =
  'Celular de 10 dígitos: característica + número, sin 0/15/+54. Ej: 2612465120';

/** Valida un celular de 10 dígitos. Combinar con @IsOptional() si es opcional. */
export function IsPhone(): PropertyDecorator {
  return applyDecorators(
    Matches(PHONE_REGEX, {
      message: 'El celular debe tener 10 dígitos (característica + número). Ej: 2612465120',
    }),
  );
}
