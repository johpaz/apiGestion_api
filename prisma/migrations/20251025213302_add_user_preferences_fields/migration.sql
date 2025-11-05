-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "alertasActivadas" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "idioma" TEXT NOT NULL DEFAULT 'es',
ADD COLUMN     "notificacionesEmail" BOOLEAN NOT NULL DEFAULT true;
