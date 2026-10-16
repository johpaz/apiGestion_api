# ─── Stage 1: dependencias ───
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY . .

# ─── Stage 2: Runtime ───
FROM alpine:3.24.1 AS runtime

RUN apk add --no-cache ca-certificates libstdc++ && \
    apk upgrade --no-cache

RUN addgroup -g 1001 -S bunjs && \
    adduser -u 1001 -S bunjs -G bunjs

WORKDIR /app

COPY --from=oven/bun:1-alpine /usr/local/bin/bun /usr/local/bin/bun

COPY --from=builder --chown=bunjs:bunjs /app/node_modules ./node_modules
COPY --from=builder --chown=bunjs:bunjs /app/package.json ./
COPY --from=builder --chown=bunjs:bunjs /app/tsconfig.json ./
COPY --from=builder --chown=bunjs:bunjs /app/src ./src
COPY --from=builder --chown=bunjs:bunjs /app/db ./db
COPY --from=builder --chown=bunjs:bunjs /app/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# HiveDB (Hive SDK): el volumen nombrado hereda este dueño en el primer montaje
RUN mkdir -p /data/hive && chown bunjs:bunjs /data/hive

USER bunjs

ENV PORT=18790
ENV HIVE_HOME=/data/hive
EXPOSE 18790

# Sin curl en la imagen: el healthcheck usa el propio Bun y el PORT del contenedor
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||18790)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]
