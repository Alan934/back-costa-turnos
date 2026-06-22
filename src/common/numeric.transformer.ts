import { ValueTransformer } from 'typeorm';

/**
 * TypeORM devuelve las columnas `numeric`/`decimal` como string (preserva precisión).
 * Este transformer las convierte a `number` al leer y las deja pasar al escribir, para
 * trabajar con porcentajes/decimales como números en el dominio (p. ej. IVA 4.5).
 */
export const NumericTransformer: ValueTransformer = {
  to: (value?: number | null): number | null | undefined => value,
  from: (value?: string | null): number | null => (value == null ? null : parseFloat(value)),
};
