/*
  Warnings:

  - You are about to drop the column `colmenaId` on the `inspecciones` table. All the data in the column will be lost.
  - You are about to drop the column `enjambreId` on the `inspecciones` table. All the data in the column will be lost.
  - You are about to drop the column `nucleoId` on the `inspecciones` table. All the data in the column will be lost.
  - You are about to drop the column `patologiaApicola` on the `inspecciones` table. All the data in the column will be lost.
  - You are about to drop the column `posibleEnfermedad` on the `inspecciones` table. All the data in the column will be lost.
  - The `signosClinicos` column on the `inspecciones` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropForeignKey
ALTER TABLE "public"."inspecciones" DROP CONSTRAINT "inspecciones_colmenaId_fkey";

-- DropForeignKey
ALTER TABLE "public"."inspecciones" DROP CONSTRAINT "inspecciones_enjambreId_fkey";

-- DropForeignKey
ALTER TABLE "public"."inspecciones" DROP CONSTRAINT "inspecciones_nucleoId_fkey";

-- AlterTable
ALTER TABLE "inspecciones" DROP COLUMN "colmenaId",
DROP COLUMN "enjambreId",
DROP COLUMN "nucleoId",
DROP COLUMN "patologiaApicola",
DROP COLUMN "posibleEnfermedad",
ADD COLUMN     "colmenaIds" TEXT[],
ADD COLUMN     "enjambreIds" TEXT[],
ADD COLUMN     "nucleoIds" TEXT[],
ADD COLUMN     "patologiasApicolas" TEXT[],
ADD COLUMN     "posiblesEnfermedades" TEXT[],
DROP COLUMN "signosClinicos",
ADD COLUMN     "signosClinicos" TEXT[];

-- CreateTable
CREATE TABLE "_ColmenaToInspeccion" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ColmenaToInspeccion_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_EnjambreToInspeccion" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EnjambreToInspeccion_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_InspeccionToNucleo" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_InspeccionToNucleo_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ColmenaToInspeccion_B_index" ON "_ColmenaToInspeccion"("B");

-- CreateIndex
CREATE INDEX "_EnjambreToInspeccion_B_index" ON "_EnjambreToInspeccion"("B");

-- CreateIndex
CREATE INDEX "_InspeccionToNucleo_B_index" ON "_InspeccionToNucleo"("B");

-- AddForeignKey
ALTER TABLE "_ColmenaToInspeccion" ADD CONSTRAINT "_ColmenaToInspeccion_A_fkey" FOREIGN KEY ("A") REFERENCES "colmenas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ColmenaToInspeccion" ADD CONSTRAINT "_ColmenaToInspeccion_B_fkey" FOREIGN KEY ("B") REFERENCES "inspecciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EnjambreToInspeccion" ADD CONSTRAINT "_EnjambreToInspeccion_A_fkey" FOREIGN KEY ("A") REFERENCES "enjambres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EnjambreToInspeccion" ADD CONSTRAINT "_EnjambreToInspeccion_B_fkey" FOREIGN KEY ("B") REFERENCES "inspecciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InspeccionToNucleo" ADD CONSTRAINT "_InspeccionToNucleo_A_fkey" FOREIGN KEY ("A") REFERENCES "inspecciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InspeccionToNucleo" ADD CONSTRAINT "_InspeccionToNucleo_B_fkey" FOREIGN KEY ("B") REFERENCES "nucleos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
