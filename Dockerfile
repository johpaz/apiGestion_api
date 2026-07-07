# ─── Stage 1: Build ───
FROM oven/bun:1.1.43-alpine AS builder

WORKDIR /app

# Copiar dependencias y schema de Prisma (necesario para postinstall)
COPY package.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma

RUN bun install --production

# Copiar el resto del código fuente
COPY . .

# Generar cliente Prisma
RUN bunx prisma generate

# ─── Stage 2: Runtime ───
FROM alpine:3.24.1 AS runtime

# Instalar solo paquetes necesarios y usar la versión más reciente de la base
RUN apk add --no-cache ca-certificates libstdc++ && \
    apk upgrade --no-cache

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S bunjs && \
    adduser -u 1001 -S bunjs -G bunjs

WORKDIR /app

# Copiar el binario de Bun desde la imagen oficial
COPY --from=oven/bun:1-alpine /usr/local/bin/bun /usr/local/bin/bun
COPY --from=oven/bun:1-alpine /usr/local/bin/bunx /usr/local/bin/bunx

# Copiar dependencias y código desde el builder
COPY --from=builder --chown=bunjs:bunjs /app/node_modules ./node_modules
COPY --from=builder --chown=bunjs:bunjs /app/package.json ./
COPY --from=builder --chown=bunjs:bunjs /app/src ./src
COPY --from=builder --chown=bunjs:bunjs /app/prisma ./prisma
COPY --from=builder --chown=bunjs:bunjs /app/tsconfig.json ./

# Copiar el cliente generado de Prisma
COPY --from=builder --chown=bunjs:bunjs /app/src/generated ./src/generated

# Copiar entrypoint script
COPY --from=builder --chown=bunjs:bunjs /app/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Cambiar al usuario no-root
USER bunjs

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:18790/health || exit 1

EXPOSE 18790

ENTRYPOINT ["./entrypoint.sh"]