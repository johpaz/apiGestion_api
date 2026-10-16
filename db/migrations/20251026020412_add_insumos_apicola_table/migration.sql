-- CreateEnum
CREATE TYPE "CategoriaInsumo" AS ENUM ('marcos', 'alzas', 'techos', 'pisos', 'excluidores_reina', 'alimentadores', 'tratamientos', 'equipos_proteccion', 'herramientas', 'materiales_construccion', 'otros');

-- CreateEnum
CREATE TYPE "EstadoStock" AS ENUM ('stock_bajo', 'stock_medio', 'stock_bueno', 'agotado');

-- CreateTable
CREATE TABLE "insumos_apicola" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CategoriaInsumo" NOT NULL,
    "descripcion" TEXT,
    "cantidadActual" DOUBLE PRECISION NOT NULL,
    "cantidadMinima" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT NOT NULL,
    "precioUnitario" DOUBLE PRECISION,
    "ubicacion" TEXT,
    "estadoStock" "EstadoStock" NOT NULL DEFAULT 'stock_bueno',
    "porcentajeStock" DOUBLE PRECISION,
    "fechaCaducidad" TIMESTAMP(3),
    "lote" TEXT,
    "proveedor" TEXT,
    "notas" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "insumos_apicola_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "insumos_apicola" ADD CONSTRAINT "insumos_apicola_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
