import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource, EntityManager } from 'typeorm';

interface TenantStore {
  tenantId?: string;
}

/**
 * Contexto de tenant por request (AsyncLocalStorage) + helper para correr una
 * transaccion con `SET LOCAL app.tenant_id`, activando RLS de forma real.
 *
 * El filtrado por professional_id en cada query del servicio es el control
 * principal; RLS dentro de runWithTenant es la red de seguridad para las
 * operaciones criticas (p. ej. el pago de sena con lock).
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  constructor(private readonly dataSource: DataSource) {}

  /** Ejecuta `fn` con el tenantId disponible via getTenantId(). */
  run<T>(tenantId: string | undefined, fn: () => T): T {
    return this.als.run({ tenantId }, fn);
  }

  getTenantId(): string | undefined {
    return this.als.getStore()?.tenantId;
  }

  /**
   * Abre una transaccion, fija app.tenant_id a nivel transaccion (SET LOCAL)
   * y ejecuta `work` con ese EntityManager. RLS aplica dentro de la transaccion.
   */
  async runWithTenant<T>(
    tenantId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      // set_config(parametro, valor, is_local=true) => vive solo en esta tx.
      await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      return work(manager);
    });
  }
}
