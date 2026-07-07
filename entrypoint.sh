#!/bin/sh
set -e

echo "🔄 Ejecutando migraciones de Prisma..."
bunx prisma migrate deploy --schema=./prisma/schema.prisma

echo "✅ Migraciones completadas. Iniciando aplicación..."
exec bun run src/server.ts
