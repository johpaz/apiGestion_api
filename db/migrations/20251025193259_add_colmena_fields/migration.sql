-- CreateEnum
CREATE TYPE "EstadoColmena" AS ENUM ('activa', 'inactiva', 'abandonada');

-- CreateEnum
CREATE TYPE "TipoProducto" AS ENUM ('miel', 'cera', 'propoleo', 'polen', 'jalea_real', 'otros');

-- CreateEnum
CREATE TYPE "EstadoSanidad" AS ENUM ('saludable', 'enferma', 'tratada', 'cuarentena');

-- CreateEnum
CREATE TYPE "TipoTransaccion" AS ENUM ('ingreso', 'egreso');

-- CreateEnum
CREATE TYPE "EstadoEnjambre" AS ENUM ('activo', 'inactivo', 'dividido', 'fusionado');

-- CreateTable
CREATE TABLE "colmenas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ubicacion" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "estado" "EstadoColmena" NOT NULL DEFAULT 'activa',
    "fechaInstalacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "cuadros" INTEGER,
    "reyna" BOOLEAN,
    "posibleEnfermedad" TEXT,
    "numAlzas" INTEGER,
    "numAlimentadas" INTEGER,
    "tipoAlimento" TEXT,
    "introduccionCera" BOOLEAN,
    "divisionColmena" BOOLEAN,
    "cantidadZanganos" INTEGER,
    "valoracionColmena" TEXT,
    "extraerMiel" BOOLEAN,
    "extraerPollen" BOOLEAN,
    "conCria" BOOLEAN,
    "miel" DOUBLE PRECISION,
    "ceraEstimada" DOUBLE PRECISION,
    "ceraSe" DOUBLE PRECISION,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "colmenas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nucleos" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "fechaInstalacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "colmenaId" TEXT NOT NULL,

    CONSTRAINT "nucleos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enjambres" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" "EstadoEnjambre" NOT NULL DEFAULT 'activo',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "notas" TEXT,
    "colmenaId" TEXT NOT NULL,

    CONSTRAINT "enjambres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspecciones" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estadoSanidad" "EstadoSanidad" NOT NULL DEFAULT 'saludable',
    "observaciones" TEXT,
    "tratamientos" TEXT,
    "poblacion" TEXT,
    "produccion" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "colmenaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "inspecciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoProducto" NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT NOT NULL,
    "precioUnitario" DOUBLE PRECISION,
    "fechaProduccion" TIMESTAMP(3),
    "fechaVencimiento" TIMESTAMP(3),
    "lote" TEXT,
    "notas" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacciones" (
    "id" TEXT NOT NULL,
    "tipo" "TipoTransaccion" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoria" TEXT,
    "referencia" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "transacciones_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "colmenas" ADD CONSTRAINT "colmenas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nucleos" ADD CONSTRAINT "nucleos_colmenaId_fkey" FOREIGN KEY ("colmenaId") REFERENCES "colmenas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enjambres" ADD CONSTRAINT "enjambres_colmenaId_fkey" FOREIGN KEY ("colmenaId") REFERENCES "colmenas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones" ADD CONSTRAINT "inspecciones_colmenaId_fkey" FOREIGN KEY ("colmenaId") REFERENCES "colmenas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones" ADD CONSTRAINT "inspecciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
