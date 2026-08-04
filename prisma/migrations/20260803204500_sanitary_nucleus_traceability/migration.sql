-- CreateEnum
CREATE TYPE "EstadoNucleo" AS ENUM ('en_formacion', 'en_desarrollo', 'listo', 'convertido', 'vendido', 'destruido', 'anulado');

-- CreateEnum
CREATE TYPE "OrigenReina" AS ENUM ('criada', 'comprada', 'capturada', 'desconocida');

-- CreateEnum
CREATE TYPE "EstadoCasoSanitario" AS ENUM ('abierto', 'en_seguimiento', 'cerrado_recuperado', 'cerrado_sacrificio', 'anulado');

-- CreateEnum
CREATE TYPE "GravedadCasoSanitario" AS ENUM ('baja', 'media', 'alta', 'critica');

-- CreateEnum
CREATE TYPE "TipoAccionSanitaria" AS ENUM ('aislamiento', 'toma_muestra', 'diagnostico', 'notificacion_ica', 'control_fisico', 'control_biologico', 'control_autorizado_ica', 'limpieza_desinfeccion', 'seguimiento', 'recuperacion', 'sacrificio_destruccion', 'disposicion_final');

-- CreateEnum
CREATE TYPE "TipoEventoNucleo" AS ENUM ('creado', 'actualizado', 'cambio_estado', 'traslado', 'convertido', 'vendido', 'destruido', 'anulado');

-- AlterEnum
ALTER TYPE "EstadoColmena" ADD VALUE 'destruida';

-- DropForeignKey
ALTER TABLE "nucleos" DROP CONSTRAINT "nucleos_colmenaId_fkey";

-- AlterTable
ALTER TABLE "apiarios" ADD COLUMN     "registroIcaDocumentoPath" TEXT,
ADD COLUMN     "registroIcaExpedidoEn" TIMESTAMP(3),
ADD COLUMN     "registroIcaNumero" TEXT,
ADD COLUMN     "registroIcaVenceEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "inspecciones" ADD COLUMN     "anuladoAt" TIMESTAMP(3),
ADD COLUMN     "anuladoPorId" TEXT,
ADD COLUMN     "motivoAnulacion" TEXT,
ADD COLUMN     "proximaRevision" TIMESTAMP(3);

-- AlterTable: add the new lineage columns as nullable first so existing nuclei
-- can be backfilled from their former parent hive without losing history.
ALTER TABLE "nucleos"
ADD COLUMN     "apiarioId" TEXT,
ADD COLUMN     "codigo" TEXT,
ADD COLUMN     "colmenaOrigenId" TEXT,
ADD COLUMN     "detalleOrigenReina" TEXT,
ADD COLUMN     "fechaFormacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "origenReina" "OrigenReina" NOT NULL DEFAULT 'desconocida',
ADD COLUMN     "proveedorReina" TEXT,
ADD COLUMN     "estadoMigrado" "EstadoNucleo" NOT NULL DEFAULT 'en_desarrollo';

UPDATE "nucleos" AS n
SET "apiarioId" = c."apiarioId",
    "colmenaOrigenId" = n."colmenaId",
    "codigo" = 'NUC-MIG-' || UPPER(SUBSTRING(n.id FROM 1 FOR 12)),
    "fechaFormacion" = n."fechaInstalacion",
    "estadoMigrado" = CASE
      WHEN LOWER(n.estado) IN ('en_formacion', 'en_desarrollo', 'listo', 'convertido', 'vendido', 'destruido', 'anulado')
        THEN LOWER(n.estado)::"EstadoNucleo"
      ELSE 'en_desarrollo'::"EstadoNucleo"
    END
FROM "colmenas" AS c
WHERE c.id = n."colmenaId";

ALTER TABLE "nucleos"
ALTER COLUMN "apiarioId" SET NOT NULL,
ALTER COLUMN "codigo" SET NOT NULL,
DROP COLUMN "colmenaId",
DROP COLUMN "estado";

ALTER TABLE "nucleos" RENAME COLUMN "estadoMigrado" TO "estado";
ALTER TABLE "nucleos" ALTER COLUMN "estado" SET DEFAULT 'en_formacion';

-- AlterTable
ALTER TABLE "transacciones" ADD COLUMN     "anuladoAt" TIMESTAMP(3),
ADD COLUMN     "anuladoPorId" TEXT,
ADD COLUMN     "motivoAnulacion" TEXT;

-- CreateTable
CREATE TABLE "nucleos_donantes" (
    "id" TEXT NOT NULL,
    "nucleoId" TEXT NOT NULL,
    "colmenaId" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nucleos_donantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_nucleo" (
    "id" TEXT NOT NULL,
    "nucleoId" TEXT NOT NULL,
    "tipo" "TipoEventoNucleo" NOT NULL,
    "detalle" TEXT NOT NULL,
    "datos" JSONB,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registradoPorId" TEXT NOT NULL,
    "anuladoAt" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,

    CONSTRAINT "eventos_nucleo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas_nucleo" (
    "id" TEXT NOT NULL,
    "nucleoId" TEXT NOT NULL,
    "compradorNombre" TEXT NOT NULL,
    "compradorIdentificacion" TEXT,
    "compradorContacto" TEXT,
    "destinoApiario" TEXT NOT NULL,
    "destinoCiudad" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "comprobantePath" TEXT,
    "transaccionId" TEXT NOT NULL,
    "creadoPorId" TEXT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladoAt" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,

    CONSTRAINT "ventas_nucleo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversiones_nucleo" (
    "id" TEXT NOT NULL,
    "nucleoId" TEXT NOT NULL,
    "colmenaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "observaciones" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladoAt" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,

    CONSTRAINT "conversiones_nucleo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patologias_sanitarias" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "agente" TEXT,
    "declaracionObligatoria" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "patologias_sanitarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos_sanitarios" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" "EstadoCasoSanitario" NOT NULL DEFAULT 'abierto',
    "gravedad" "GravedadCasoSanitario" NOT NULL DEFAULT 'media',
    "fechaApertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proximaRevision" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "requiereNotificacionIca" BOOLEAN NOT NULL DEFAULT false,
    "apiarioId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "inspeccionOrigenId" TEXT,
    "patologiaId" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "anuladoAt" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,

    CONSTRAINT "casos_sanitarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos_sanitarios_objetivos" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "colmenaId" TEXT,
    "nucleoId" TEXT,
    "enjambreId" TEXT,

    CONSTRAINT "casos_sanitarios_objetivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acciones_sanitarias" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "tipo" "TipoAccionSanitaria" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "descripcion" TEXT NOT NULL,
    "objetivoIds" TEXT[],
    "responsable" TEXT,
    "metodo" TEXT,
    "disposicionFinal" TEXT,
    "productoNombre" TEXT,
    "productoRegistroIca" TEXT,
    "retiroHasta" TIMESTAMP(3),
    "referenciaIca" TEXT,
    "evidencias" TEXT[],
    "registradoPorId" TEXT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladoAt" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,

    CONSTRAINT "acciones_sanitarias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nucleos_donantes_nucleoId_colmenaId_key" ON "nucleos_donantes"("nucleoId", "colmenaId");

-- CreateIndex
CREATE INDEX "eventos_nucleo_nucleoId_fecha_idx" ON "eventos_nucleo"("nucleoId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_nucleo_transaccionId_key" ON "ventas_nucleo"("transaccionId");

-- CreateIndex
CREATE INDEX "ventas_nucleo_nucleoId_fecha_idx" ON "ventas_nucleo"("nucleoId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "conversiones_nucleo_colmenaId_key" ON "conversiones_nucleo"("colmenaId");

-- CreateIndex
CREATE INDEX "conversiones_nucleo_nucleoId_fecha_idx" ON "conversiones_nucleo"("nucleoId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "patologias_sanitarias_codigo_key" ON "patologias_sanitarias"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "casos_sanitarios_codigo_key" ON "casos_sanitarios"("codigo");

-- CreateIndex
CREATE INDEX "casos_sanitarios_usuarioId_estado_idx" ON "casos_sanitarios"("usuarioId", "estado");

-- CreateIndex
CREATE INDEX "casos_sanitarios_apiarioId_fechaApertura_idx" ON "casos_sanitarios"("apiarioId", "fechaApertura");

-- CreateIndex
CREATE INDEX "casos_sanitarios_objetivos_casoId_idx" ON "casos_sanitarios_objetivos"("casoId");

-- CreateIndex
CREATE INDEX "casos_sanitarios_objetivos_colmenaId_idx" ON "casos_sanitarios_objetivos"("colmenaId");

-- CreateIndex
CREATE INDEX "casos_sanitarios_objetivos_nucleoId_idx" ON "casos_sanitarios_objetivos"("nucleoId");

-- CreateIndex
CREATE INDEX "acciones_sanitarias_casoId_fecha_idx" ON "acciones_sanitarias"("casoId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "nucleos_apiarioId_codigo_key" ON "nucleos"("apiarioId", "codigo");

-- AddForeignKey
ALTER TABLE "nucleos" ADD CONSTRAINT "nucleos_apiarioId_fkey" FOREIGN KEY ("apiarioId") REFERENCES "apiarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nucleos" ADD CONSTRAINT "nucleos_colmenaOrigenId_fkey" FOREIGN KEY ("colmenaOrigenId") REFERENCES "colmenas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nucleos_donantes" ADD CONSTRAINT "nucleos_donantes_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "nucleos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nucleos_donantes" ADD CONSTRAINT "nucleos_donantes_colmenaId_fkey" FOREIGN KEY ("colmenaId") REFERENCES "colmenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_nucleo" ADD CONSTRAINT "eventos_nucleo_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "nucleos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_nucleo" ADD CONSTRAINT "ventas_nucleo_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "nucleos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_nucleo" ADD CONSTRAINT "ventas_nucleo_transaccionId_fkey" FOREIGN KEY ("transaccionId") REFERENCES "transacciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversiones_nucleo" ADD CONSTRAINT "conversiones_nucleo_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "nucleos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversiones_nucleo" ADD CONSTRAINT "conversiones_nucleo_colmenaId_fkey" FOREIGN KEY ("colmenaId") REFERENCES "colmenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_sanitarios" ADD CONSTRAINT "casos_sanitarios_apiarioId_fkey" FOREIGN KEY ("apiarioId") REFERENCES "apiarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_sanitarios" ADD CONSTRAINT "casos_sanitarios_inspeccionOrigenId_fkey" FOREIGN KEY ("inspeccionOrigenId") REFERENCES "inspecciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_sanitarios" ADD CONSTRAINT "casos_sanitarios_patologiaId_fkey" FOREIGN KEY ("patologiaId") REFERENCES "patologias_sanitarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_sanitarios_objetivos" ADD CONSTRAINT "casos_sanitarios_objetivos_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "casos_sanitarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_sanitarios_objetivos" ADD CONSTRAINT "casos_sanitarios_objetivos_colmenaId_fkey" FOREIGN KEY ("colmenaId") REFERENCES "colmenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_sanitarios_objetivos" ADD CONSTRAINT "casos_sanitarios_objetivos_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "nucleos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_sanitarios_objetivos" ADD CONSTRAINT "casos_sanitarios_objetivos_enjambreId_fkey" FOREIGN KEY ("enjambreId") REFERENCES "enjambres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acciones_sanitarias" ADD CONSTRAINT "acciones_sanitarias_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "casos_sanitarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
