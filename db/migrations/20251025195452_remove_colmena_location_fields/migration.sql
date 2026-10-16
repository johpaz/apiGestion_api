/*
  Warnings:

  - You are about to drop the column `latitud` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `longitud` on the `colmenas` table. All the data in the column will be lost.
  - You are about to drop the column `ubicacion` on the `colmenas` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "colmenas" DROP COLUMN "latitud",
DROP COLUMN "longitud",
DROP COLUMN "ubicacion";
