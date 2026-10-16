-- AlterEnum
ALTER TYPE "TipoAlerta" ADD VALUE 'control_rutinario';

-- AlterTable
ALTER TABLE "alertas" ADD COLUMN     "activa" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "entidadId" TEXT,
ADD COLUMN     "entidadTipo" TEXT,
ADD COLUMN     "esRecurrente" BOOLEAN DEFAULT false,
ADD COLUMN     "frecuenciaDias" INTEGER,
ADD COLUMN     "proximaEjecucion" TIMESTAMP(3),
ADD COLUMN     "ultimaEjecucion" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "colmenas" ADD COLUMN     "alertasRecurrentesActivadas" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ultimaAlertaControl" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "enjambres" ADD COLUMN     "alertasRecurrentesActivadas" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ultimaAlertaControl" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "nucleos" ADD COLUMN     "alertasRecurrentesActivadas" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ultimaAlertaControl" TIMESTAMP(3);
