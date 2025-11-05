-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('COP', 'EUR', 'USD');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "moneda" "Moneda" NOT NULL DEFAULT 'COP';
