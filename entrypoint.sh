#!/bin/sh
set -e

echo "🔄 Ejecutando migraciones..."
bun run src/db/migrate.ts

echo "🌱 Sembrando catálogo y administrador inicial (idempotente)..."
bun run db/seed.ts

echo "✅ Base de datos lista. Iniciando aplicación..."
exec bun run src/server.ts
