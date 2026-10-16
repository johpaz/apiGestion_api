/*
  Warnings:

  - You are about to drop the column `poblacion` on the `inspecciones` table. All the data in the column will be lost.
  - You are about to drop the column `produccion` on the `inspecciones` table. All the data in the column will be lost.
  - You are about to drop the column `tratamientos` on the `inspecciones` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "inspecciones" DROP COLUMN "poblacion",
DROP COLUMN "produccion",
DROP COLUMN "tratamientos";
