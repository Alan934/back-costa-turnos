# Row-Level Security (RLS)

RLS es **defensa en profundidad**, además del filtrado por `professional_id` que hace
el `TenantGuard` en NestJS. La idea:

- Cada request de un tenant ejecuta `SELECT set_config('app.tenant_id', '<uuid>', true)`
  dentro de su transacción (lo hace `TenantContextService`).
- Las políticas RLS de las tablas multi-tenant filtran por
  `current_setting('app.tenant_id', true)`.
- Si **no** hay tenant seteado (jobs del dueño, platform admin, migraciones), la política
  es permisiva y deja pasar todo. Por eso es una red de seguridad, no el único control.

Las políticas se crean en la migración inicial (`0000_init`). Este documento describe el
patrón; la fuente de verdad ejecutable es la migración.

```sql
-- patrón aplicado a cada tabla con columna professional_id
ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <tabla> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <tabla>
  USING (
    current_setting('app.tenant_id', true) IS NULL
    OR current_setting('app.tenant_id', true) = ''
    OR professional_id = current_setting('app.tenant_id', true)::uuid
  )
  WITH CHECK (
    current_setting('app.tenant_id', true) IS NULL
    OR current_setting('app.tenant_id', true) = ''
    OR professional_id = current_setting('app.tenant_id', true)::uuid
  );
```

Tablas con `professional_id` **nullable** (`notification`, `audit_log`) agregan
`OR professional_id IS NULL` para permitir filas globales.
