#!/bin/sh
set -e

# Aplica migraciones pendientes contra el data-source compilado (dist, JS puro).
# Incluye la migracion que siembra el platform admin desde ADMIN_EMAIL/ADMIN_PASSWORD.
echo "[entrypoint] Ejecutando migraciones..."
node ./node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run
echo "[entrypoint] Migraciones aplicadas. Iniciando API..."

exec node dist/main.js
