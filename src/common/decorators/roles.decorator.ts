import { SetMetadata } from '@nestjs/common';
import { AppRole } from '@/common/enums';

export const ROLES_KEY = 'roles';

/** Restringe una ruta a los roles indicados (usado por RolesGuard). */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
