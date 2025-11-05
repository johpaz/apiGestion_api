/*
  Warnings:

  - Added the required column `apiarioId` to the `colmenas` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "colmenas" ADD COLUMN     "apiarioId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "apiarios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "pais" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "comoLlegar" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apiarios_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "colmenas" ADD CONSTRAINT "colmenas_apiarioId_fkey" FOREIGN KEY ("apiarioId") REFERENCES "apiarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
