/*
  Warnings:

  - You are about to drop the column `posibleEnfermedad` on the `colmenas` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "colmenas" DROP COLUMN "posibleEnfermedad";

-- AlterTable
ALTER TABLE "inspecciones" ADD COLUMN     "enjambreId" TEXT,
ADD COLUMN     "nucleoId" TEXT,
ADD COLUMN     "numColmenasAfectadas" INTEGER,
ADD COLUMN     "patologiaApicola" TEXT,
ADD COLUMN     "posibleEnfermedad" TEXT,
ADD COLUMN     "signosClinicos" TEXT;

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "fromCurrency" "Moneda" NOT NULL,
    "toCurrency" "Moneda" NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_fromCurrency_toCurrency_key" ON "exchange_rates"("fromCurrency", "toCurrency");

-- AddForeignKey
ALTER TABLE "inspecciones" ADD CONSTRAINT "inspecciones_nucleoId_fkey" FOREIGN KEY ("nucleoId") REFERENCES "nucleos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones" ADD CONSTRAINT "inspecciones_enjambreId_fkey" FOREIGN KEY ("enjambreId") REFERENCES "enjambres"("id") ON DELETE SET NULL ON UPDATE CASCADE;
