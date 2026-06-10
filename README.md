# Turnerito API

API backend de un **turnero SaaS multi-tenant** (NestJS + TypeScript + PostgreSQL + Redis).
Pensada para profesionales/negocios (peluquerías, etc.): turnos con sala de espera en vivo,
fichas de clientes dinámicas, señas (incluida la modalidad híbrida con desplazamiento),
lista de espera, suscripciones, notificaciones, sorteos y más.

El modelo de datos completo está documentado en [modelo-de-datos.md](modelo-de-datos.md).

## Stack

- **NestJS 11** + TypeScript (strict)
- **PostgreSQL** vía **TypeORM** (migraciones, sin `synchronize`)
- **Redis**: BullMQ (colas/jobs), caché y adapter de WebSocket
- **Auth**: JWT (access + refresh) + Google OAuth, hash con argon2
- **WebSockets** (Socket.IO) para la sala de espera en vivo
- **Swagger** en `/docs`, logs con pino, rate limiting, health checks
- Integraciones externas (MercadoPago, email/WhatsApp, MinIO) detrás de **puertos con stubs**

## Requisitos

- Node.js >= 20.11
- Docker + Docker Compose (para Postgres/Redis/MinIO en local), o servicios equivalentes

## Puesta en marcha (local)

```bash
# 1) Variables de entorno
cp .env.example .env        # ajustar secretos

# 2) Infraestructura (Postgres + Redis + MinIO)
docker-compose up -d postgres redis minio

# 3) Dependencias
npm install

# 4) Migraciones (crea todo el esquema + RLS)
npm run migration:run

# 5) (Opcional) Datos de ejemplo
npm run seed

# 6) Levantar la API en modo dev
npm run start:dev
```

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/health`

> El stack completo (incluida la API en contenedor) se levanta con
> `docker-compose --profile full up --build`.

### Credenciales del seed

- Platform admin: `admin@turnerito.app` / `admin12345`
- Professional demo: `dueno@peluqueria.com` / `dueno12345` (página pública: `/r/mi-peluqueria`)

## Scripts

| Script | Descripción |
|---|---|
| `npm run start:dev` | API con hot-reload |
| `npm run build` / `start:prod` | Build y ejecución de producción |
| `npm run migration:generate -- src/database/migrations/<Nombre>` | Generar migración desde entidades |
| `npm run migration:run` / `migration:revert` | Aplicar / revertir migraciones |
| `npm run seed` | Cargar datos de ejemplo |
| `npm run lint` / `npm test` / `npm run test:e2e` | Calidad y pruebas |

## Arquitectura

```
src/
  config/         configuración tipada + validación Joi de ENV
  common/         BaseEntity, guards (Jwt/Roles/Tenant), decoradores, contexto de tenant, filtros
  database/       DataSource, migraciones (esquema + RLS), seeds
  redis/          cliente ioredis compartido
  modules/
    identity/        account, person
    auth/            login local + Google + refresh + verification_token
    professionals/   professional (tenant) + staff + onboarding
    clients/         professional_client + ficha_field + client_note
    catalog/         service
    availability/    schedule_rule, time_off, cálculo de slots
    appointments/    turnos (seña híbrida con lock) + sala de espera (WebSocket)
    waitlist/        lista de espera
    payments/        pagos + puerto MercadoPago (stub) + webhook
    subscriptions/   suscripción + jobs de estado
    notifications/   cola persistida + BullMQ + senders (stub email/WhatsApp)
    raffles/         sorteos + alta de participantes por email
    files/           archivos en MinIO (URLs firmadas) + compresión sharp
    legal/           consent + audit_log
    health/          /health (db + redis)
```

### Multi-tenancy

Doble control: el **TenantGuard** resuelve el `professional_id` (del JWT o del slug público)
y las consultas filtran siempre por ese campo; además, las operaciones críticas corren bajo
**RLS** de PostgreSQL (`runWithTenant` fija `app.tenant_id` por transacción). Ver
[src/database/rls/README.md](src/database/rls/README.md).

### Seña híbrida y concurrencia

El pago de seña sobre un horario corre en una **transacción con lock pesimista** sobre el
staff (mutex del calendario). Si hay un turno confirmado firme se rechaza; si hay reservas
provisionales se desplazan (`cancellation_reason = bumped`) y se notifica al desplazado.
Dos pagos simultáneos no pueden generar doble turno. Ver
[appointments.service.ts](src/modules/appointments/appointments.service.ts).

## Despliegue en Coolify

1. **Postgres** y **Redis**: crealos como *resources* en Coolify. Anotá host/puerto/credenciales.
2. **Aplicación**: nueva app desde este repositorio usando el `Dockerfile` incluido.
3. **Variables de entorno**: cargá en el panel las del `.env.example` apuntando a los recursos
   de Coolify (`DB_HOST`, `REDIS_HOST`, etc.), `DB_SSL=true` si corresponde, y secretos JWT.
4. **Migraciones**: ejecutá `npm run migration:run` como *post-deployment command* (o una vez
   manualmente). La app **no** usa `synchronize`.
5. **Health check**: apuntá a `/health`.
6. **MinIO** (opcional, para archivos): como recurso o externo; configurá `MINIO_*`.

### Integraciones reales (cuando tengas credenciales)

Todo está detrás de puertos; reemplazar el stub por la implementación real no toca la lógica:

- **MercadoPago**: implementar `PaymentProvider` ([payment-provider.port.ts](src/modules/payments/ports/payment-provider.port.ts)).
- **Email/WhatsApp**: implementar `NotificationSender` ([notification-sender.port.ts](src/modules/notifications/ports/notification-sender.port.ts)).
- **Google Calendar**: completar `staff_calendar_integration`.

## Notas

- Dinero siempre en **centavos** (`*_cents`), fechas en `timestamptz` (UTC); la zona horaria
  del negocio se guarda en `professional.timezone`.
- IDs **UUID v7** (ordenables por tiempo).
