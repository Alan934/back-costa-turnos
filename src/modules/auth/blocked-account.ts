/**
 * Marca en Redis de las cuentas bloqueadas. Los access tokens son JWT sin estado: sin esto una
 * cuenta bloqueada seguiría operando hasta que venza el token. La estrategia JWT consulta esta
 * clave en cada request (una lectura de Redis). TTL largo: cubre cualquier vida razonable
 * de un access token; al reactivar la cuenta se borra.
 */
export const BLOCKED_ACCOUNT_PREFIX = 'auth:blocked:';
export const BLOCKED_ACCOUNT_TTL_S = 24 * 60 * 60;
