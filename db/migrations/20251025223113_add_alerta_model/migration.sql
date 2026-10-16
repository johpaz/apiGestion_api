-- CreateEnum
CREATE TYPE "TipoAlerta" AS ENUM ('inspeccion', 'produccion', 'sanidad', 'mantenimiento', 'otros');

-- CreateEnum
CREATE TYPE "PrioridadAlerta" AS ENUM ('baja', 'media', 'alta', 'critica');

-- CreateTable
CREATE TABLE "alertas" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "tipo" "TipoAlerta" NOT NULL,
    "prioridad" "PrioridadAlerta" NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "alertas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
