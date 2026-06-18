import { Transform } from 'class-transformer';

/**
 * Normaliza un texto a "Title Case": recorta espacios extra y pone en mayúscula
 * la primera letra de cada palabra (resto en minúscula). Pensado para atributos
 * visibles por el usuario (nombres de personas, comercios, servicios).
 *
 * Ej: "  alan   sanjurjo " -> "Alan Sanjurjo"
 *     "peluquería ARISTIDES" -> "Peluquería Aristides"
 *
 * Respeta separadores comunes en nombres compuestos (guion y apóstrofo):
 *     "ana-maria" -> "Ana-Maria",  "o'connor" -> "O'Connor"
 */
export function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es')
    .replace(
      /(^|[\s\-'’])([\p{L}])/gu,
      (_m, sep: string, char: string) => sep + char.toLocaleUpperCase('es'),
    );
}

/** Aplica {@link toTitleCase} a un campo string de DTO durante la transformación. */
export function TitleCase(): PropertyDecorator {
  return Transform(({ value }) => (typeof value === 'string' ? toTitleCase(value) : value));
}
