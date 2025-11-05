/*
  Warnings:

  - Added the required column `usuarioId` to the `apiarios` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "apiarios" ADD COLUMN     "usuarioId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "apiarios" ADD CONSTRAINT "apiarios_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
