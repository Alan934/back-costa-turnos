import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca una ruta como publica (saltea JwtAuthGuard global). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
