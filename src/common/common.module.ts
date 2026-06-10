import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './context/tenant-context.service';

/**
 * Utilidades transversales disponibles en toda la app (contexto de tenant, etc.).
 */
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class CommonModule {}
