/*
  Warnings:

  - You are about to drop the column `cantidadZanganos` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `ceraEstimada` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `ceraSe` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `conCria` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `divisionColmena` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `extraerMiel` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `extraerPollen` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `introduccionCera` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `miel` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `numAlimentadas` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `numAlzas` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `tipoAlimento` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `valoracionColmena` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `colmenaIds` on the `inspecciones` table. All the data in the column will be lost.
  - You are about to drop the column `enjambreIds` on the `inspecciones` table. All the data in the column will be lost.
  - You are about to drop the `_InspeccionToNucleo` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."_InspeccionToNucleo" DROP CONSTRAINT "_InspeccionToNucleo_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_InspeccionToNucleo" DROP CONSTRAINT "_InspeccionToNucleo_B_fkey";

-- AlterTable
ALTER TABLE "colmenas" DROP COLUMN "cantidadZanganos",
DROP COLUMN "ceraEstimada",
DROP COLUMN "ceraSe",
DROP COLUMN "conCria",
DROP COLUMN "divisionColmena",
DROP COLUMN "extraerMiel",
DROP COLUMN "extraerPollen",
DROP COLUMN "introduccionCera",
DROP COLUMN "miel",
DROP COLUMN "numAlimentadas",
DROP COLUMN "numAlzas",
DROP COLUMN "tipoAlimento",
DROP COLUMN "valoracionColmena",
ADD COLUMN     "fechaReyna" TIMESTAMP(3),
ADD COLUMN     "tipoReyna" TEXT;

-- AlterTable
ALTER TABLE "inspecciones" DROP COLUMN "colmenaIds",
DROP COLUMN "enjambreIds";

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "imagenPerfil" TEXT;

-- DropTable
DROP TABLE "public"."_InspeccionToNucleo";

-- CreateTable
CREATE TABLE "producciones" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tipoProducto" "TipoProducto" NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT NOT NULL,
    "calidad" TEXT,
    "lote" TEXT,
    "destino" TEXT,
    "observaciones" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "colmenaId" TEXT NOT NULL,
    "apiarioId" TEXT NOT NULL,

    CONSTRAINT "producciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_NucleoToInspeccion" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_NucleoToInspeccion_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_NucleoToInspeccion_B_index" ON "_NucleoToInspeccion"("B");

-- AddForeignKey
ALTER TABLE "producciones" ADD CONSTRAINT "producciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producciones" ADD CONSTRAINT "producciones_colmenaId_fkey" FOREIGN KEY ("colmenaId") REFERENCES "colmenas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producciones" ADD CONSTRAINT "producciones_apiarioId_fkey" FOREIGN KEY ("apiarioId") REFERENCES "apiarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NucleoToInspeccion" ADD CONSTRAINT "_NucleoToInspeccion_A_fkey" FOREIGN KEY ("A") REFERENCES "inspecciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NucleoToInspeccion" ADD CONSTRAINT "_NucleoToInspeccion_B_fkey" FOREIGN KEY ("B") REFERENCES "nucleos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
