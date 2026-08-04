-- Extend the existing financial ledger so informal sales can track the agreed
-- total separately from the money actually received.
CREATE TYPE "EstadoPago" AS ENUM ('pagado', 'parcial', 'pendiente');
CREATE TYPE "TipoItemInventario" AS ENUM ('insumo', 'activo');
CREATE TYPE "EstadoActivoInventario" AS ENUM ('disponible', 'en_uso', 'mantenimiento', 'retirado');
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('entrada', 'salida', 'ajuste');
CREATE TYPE "TipoActividad" AS ENUM ('inspeccion', 'produccion', 'alerta', 'mantenimiento', 'control_rutinario', 'otros');

ALTER TABLE "transacciones"
ADD COLUMN "esVenta" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "producto" TEXT,
ADD COLUMN "cantidad" DOUBLE PRECISION,
ADD COLUMN "unidad" TEXT,
ADD COLUMN "compradorNombre" TEXT,
ADD COLUMN "valorTotal" DOUBLE PRECISION,
ADD COLUMN "estadoPago" "EstadoPago",
ADD COLUMN "medioPago" TEXT,
ADD COLUMN "observaciones" TEXT,
ADD COLUMN "origen" TEXT NOT NULL DEFAULT 'manual';

-- Existing nucleus sales are already linked to a transaction and can be
-- identified without guessing from their description.
UPDATE "transacciones" AS t
SET
  "esVenta" = true,
  "producto" = 'Núcleo de abejas',
  "compradorNombre" = v."compradorNombre",
  "valorTotal" = t."monto",
  "estadoPago" = 'pagado',
  "origen" = 'venta_nucleo'
FROM "ventas_nucleo" AS v
WHERE v."transaccionId" = t."id";

CREATE INDEX "transacciones_usuarioId_fecha_idx" ON "transacciones"("usuarioId", "fecha");
CREATE INDEX "transacciones_usuarioId_esVenta_estadoPago_idx" ON "transacciones"("usuarioId", "esVenta", "estadoPago");

ALTER TABLE "insumos_apicola"
ADD COLUMN "tipoItem" "TipoItemInventario" NOT NULL DEFAULT 'insumo',
ADD COLUMN "estadoActivo" "EstadoActivoInventario",
ADD COLUMN "codigoInterno" TEXT,
ADD COLUMN "catalogoItemId" TEXT,
ADD COLUMN "valorMercado" DOUBLE PRECISION,
ADD COLUMN "anuladoAt" TIMESTAMP(3),
ADD COLUMN "anuladoPorId" TEXT,
ADD COLUMN "motivoAnulacion" TEXT;

CREATE TABLE "movimientos_inventario" (
  "id" TEXT NOT NULL,
  "insumoId" TEXT NOT NULL,
  "tipo" "TipoMovimientoInventario" NOT NULL,
  "cantidad" DOUBLE PRECISION NOT NULL,
  "cantidadAnterior" DOUBLE PRECISION NOT NULL,
  "cantidadNueva" DOUBLE PRECISION NOT NULL,
  "motivo" TEXT NOT NULL,
  "registradoPorId" TEXT NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalogo_items_inventario" (
  "id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "categoria" "CategoriaInsumo" NOT NULL,
  "tipoItem" "TipoItemInventario" NOT NULL,
  "unidad" TEXT NOT NULL,
  "grupo" TEXT NOT NULL DEFAULT 'Otros',
  "icono" TEXT NOT NULL DEFAULT 'package',
  "activo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "catalogo_items_inventario_pkey" PRIMARY KEY ("id")
);

INSERT INTO "catalogo_items_inventario" ("id", "codigo", "nombre", "categoria", "tipoItem", "unidad") VALUES
('cat_caja_colmena', 'CAJA-COLMENA', 'Caja de colmena', 'cajas_colmena', 'activo', 'unidades'),
('cat_caja_nucleo', 'CAJA-NUCLEO', 'Caja de núcleo', 'cajas_nucleo', 'activo', 'unidades'),
('cat_marco', 'MARCO', 'Marco para colmena', 'marcos', 'activo', 'unidades'),
('cat_alza', 'ALZA', 'Alza melaria', 'alzas', 'activo', 'unidades'),
('cat_techo', 'TECHO', 'Techo de colmena', 'techos', 'activo', 'unidades'),
('cat_base', 'BASE', 'Base o soporte de colmena', 'bases', 'activo', 'unidades'),
('cat_piso', 'PISO', 'Piso de colmena', 'pisos', 'activo', 'unidades'),
('cat_excluidor', 'EXCLUIDOR', 'Excluidor de reina', 'excluidores_reina', 'activo', 'unidades'),
('cat_alimentador', 'ALIMENTADOR', 'Alimentador', 'alimentadores', 'activo', 'unidades'),
('cat_ahumador', 'AHUMADOR', 'Ahumador', 'herramientas', 'activo', 'unidades'),
('cat_palanca', 'PALANCA', 'Palanca apícola', 'herramientas', 'activo', 'unidades'),
('cat_cepillo', 'CEPILLO', 'Cepillo apícola', 'herramientas', 'activo', 'unidades'),
('cat_traje', 'TRAJE', 'Traje de protección', 'equipos_proteccion', 'activo', 'unidades'),
('cat_guantes', 'GUANTES', 'Guantes de protección', 'equipos_proteccion', 'activo', 'pares'),
('cat_velo', 'VELO', 'Velo apícola', 'equipos_proteccion', 'activo', 'unidades'),
('cat_extractor', 'EXTRACTOR', 'Extractor de miel', 'equipos_extraccion', 'activo', 'unidades'),
('cat_desoperculador', 'DESOPERCULADOR', 'Equipo desoperculador', 'equipos_extraccion', 'activo', 'unidades'),
('cat_madurador', 'MADURADOR', 'Tanque madurador', 'equipos_extraccion', 'activo', 'unidades'),
('cat_envase', 'ENVASE', 'Envases para producto', 'envases', 'insumo', 'unidades'),
('cat_alimento', 'ALIMENTO', 'Alimento para abejas', 'alimentacion', 'insumo', 'kg'),
('cat_cera_estampada', 'CERA-ESTAMPADA', 'Lámina de cera estampada', 'materiales_construccion', 'insumo', 'láminas');

UPDATE "catalogo_items_inventario" SET "grupo" = 'Componentes de colmena', "icono" = 'boxes' WHERE "categoria" IN ('cajas_colmena', 'cajas_nucleo', 'marcos', 'alzas', 'techos', 'bases', 'pisos', 'excluidores_reina', 'alimentadores');
UPDATE "catalogo_items_inventario" SET "grupo" = 'Herramientas de apiario', "icono" = 'hammer' WHERE "categoria" = 'herramientas';
UPDATE "catalogo_items_inventario" SET "grupo" = 'Protección personal', "icono" = 'shield' WHERE "categoria" = 'equipos_proteccion';
UPDATE "catalogo_items_inventario" SET "grupo" = 'Cosecha y beneficio', "icono" = 'droplets' WHERE "categoria" = 'equipos_extraccion';
UPDATE "catalogo_items_inventario" SET "grupo" = 'Envase y almacenamiento', "icono" = 'archive' WHERE "categoria" = 'envases';
UPDATE "catalogo_items_inventario" SET "grupo" = 'Alimentación', "icono" = 'wheat' WHERE "categoria" = 'alimentacion';

INSERT INTO "catalogo_items_inventario" ("id", "codigo", "nombre", "categoria", "tipoItem", "unidad", "grupo", "icono") VALUES
('cat_entretapa', 'ENTRETAPA', 'Entretapa', 'otros', 'activo', 'unidades', 'Componentes de colmena', 'boxes'),
('cat_guardapiquera', 'GUARDAPIQUERA', 'Guardapiquera o reductor de piquera', 'otros', 'activo', 'unidades', 'Componentes de colmena', 'boxes'),
('cat_riel_marco', 'RIEL-MARCO', 'Riel o separador de marcos', 'materiales_construccion', 'insumo', 'unidades', 'Componentes de colmena', 'boxes'),
('cat_alambre', 'ALAMBRE', 'Alambre para marcos', 'materiales_construccion', 'insumo', 'rollos', 'Componentes de colmena', 'boxes'),
('cat_clavos', 'CLAVOS', 'Clavos o grapas para material apícola', 'materiales_construccion', 'insumo', 'cajas', 'Componentes de colmena', 'boxes'),
('cat_combustible_ahumador', 'COMB-AHUMADOR', 'Combustible limpio para ahumador', 'materiales_construccion', 'insumo', 'kg', 'Herramientas de apiario', 'flame'),
('cat_pinza_marcos', 'PINZA-MARCOS', 'Pinza levanta marcos', 'herramientas', 'activo', 'unidades', 'Herramientas de apiario', 'hammer'),
('cat_espatula', 'ESPATULA', 'Espátula o raspador apícola', 'herramientas', 'activo', 'unidades', 'Herramientas de apiario', 'hammer'),
('cat_botas', 'BOTAS', 'Botas de protección', 'equipos_proteccion', 'activo', 'pares', 'Protección personal', 'shield'),
('cat_polainas', 'POLAINAS', 'Polainas', 'equipos_proteccion', 'activo', 'pares', 'Protección personal', 'shield'),
('cat_overol', 'OVEROL', 'Overol apícola', 'equipos_proteccion', 'activo', 'unidades', 'Protección personal', 'shield'),
('cat_jaula_reina', 'JAULA-REINA', 'Jaula para reina', 'cria_reinas', 'activo', 'unidades', 'Cría y manejo de reinas', 'crown'),
('cat_celda_real', 'CELDA-REAL', 'Celda real artificial', 'cria_reinas', 'insumo', 'unidades', 'Cría y manejo de reinas', 'crown'),
('cat_copa_celda', 'COPA-CELDA', 'Copa celda para traslarve', 'cria_reinas', 'insumo', 'unidades', 'Cría y manejo de reinas', 'crown'),
('cat_aguja_traslarve', 'AGUJA-TRASLARVE', 'Aguja de traslarve', 'cria_reinas', 'activo', 'unidades', 'Cría y manejo de reinas', 'crown'),
('cat_marcador_reina', 'MARCADOR-REINA', 'Marcador de reinas', 'cria_reinas', 'insumo', 'unidades', 'Cría y manejo de reinas', 'crown'),
('cat_azucar', 'AZUCAR', 'Azúcar para alimentación', 'alimentacion', 'insumo', 'kg', 'Alimentación', 'wheat'),
('cat_sustituto_polen', 'SUST-POLEN', 'Sustituto o suplemento de polen', 'alimentacion', 'insumo', 'kg', 'Alimentación', 'wheat'),
('cat_bebedero', 'BEBEDERO', 'Bebedero de apiario', 'alimentadores', 'activo', 'unidades', 'Alimentación', 'wheat'),
('cat_desinfectante', 'DESINFECTANTE', 'Desinfectante autorizado', 'sanidad_bioseguridad', 'insumo', 'litros', 'Sanidad y bioseguridad', 'sparkles'),
('cat_detergente', 'DETERGENTE', 'Detergente para equipos de contacto', 'sanidad_bioseguridad', 'insumo', 'litros', 'Sanidad y bioseguridad', 'sparkles'),
('cat_guantes_desechables', 'GUANTE-DESECH', 'Guantes desechables', 'sanidad_bioseguridad', 'insumo', 'cajas', 'Sanidad y bioseguridad', 'sparkles'),
('cat_bolsa_muestra', 'BOLSA-MUESTRA', 'Bolsa o frasco para muestras', 'sanidad_bioseguridad', 'insumo', 'unidades', 'Sanidad y bioseguridad', 'sparkles'),
('cat_soplete', 'SOPLETE', 'Soplete para desinfección física', 'sanidad_bioseguridad', 'activo', 'unidades', 'Sanidad y bioseguridad', 'sparkles'),
('cat_cuchillo_desoperculador', 'CUCHILLO-DESOP', 'Cuchillo desoperculador', 'equipos_extraccion', 'activo', 'unidades', 'Cosecha y beneficio de miel', 'droplets'),
('cat_tenedor_desoperculador', 'TENEDOR-DESOP', 'Tenedor desoperculador', 'equipos_extraccion', 'activo', 'unidades', 'Cosecha y beneficio de miel', 'droplets'),
('cat_banco_desopercular', 'BANCO-DESOP', 'Banco o bandeja de desoperculado', 'equipos_extraccion', 'activo', 'unidades', 'Cosecha y beneficio de miel', 'droplets'),
('cat_filtro_miel', 'FILTRO-MIEL', 'Filtro o colador para miel', 'equipos_extraccion', 'activo', 'unidades', 'Cosecha y beneficio de miel', 'droplets'),
('cat_balde_alimentario', 'BALDE-ALIM', 'Balde grado alimentario', 'envases', 'activo', 'unidades', 'Envase y almacenamiento', 'archive'),
('cat_tambor_miel', 'TAMBOR-MIEL', 'Tambor grado alimentario para miel', 'envases', 'activo', 'unidades', 'Envase y almacenamiento', 'archive'),
('cat_tapa_envase', 'TAPA-ENVASE', 'Tapas para envases', 'envases', 'insumo', 'unidades', 'Envase y almacenamiento', 'archive'),
('cat_etiqueta', 'ETIQUETA', 'Etiquetas de producto', 'envases', 'insumo', 'unidades', 'Envase y almacenamiento', 'archive'),
('cat_trampa_polen', 'TRAMPA-POLEN', 'Trampa cazapolen', 'procesamiento_polen', 'activo', 'unidades', 'Producción de polen', 'flower'),
('cat_secador_polen', 'SECADOR-POLEN', 'Secador de polen', 'procesamiento_polen', 'activo', 'unidades', 'Producción de polen', 'flower'),
('cat_malla_propoleo', 'MALLA-PROP', 'Malla o rejilla para propóleo', 'procesamiento_propoleo', 'activo', 'unidades', 'Producción de propóleo', 'hexagon'),
('cat_fundidor_cera', 'FUNDIDOR-CERA', 'Fundidor de cera', 'procesamiento_cera', 'activo', 'unidades', 'Procesamiento de cera', 'circle'),
('cat_estampadora_cera', 'ESTAMPADORA', 'Estampadora de cera', 'procesamiento_cera', 'activo', 'unidades', 'Procesamiento de cera', 'circle'),
('cat_molde_cera', 'MOLDE-CERA', 'Molde para cera', 'procesamiento_cera', 'activo', 'unidades', 'Procesamiento de cera', 'circle'),
('cat_bascula', 'BASCULA', 'Báscula', 'medicion', 'activo', 'unidades', 'Medición y control', 'gauge'),
('cat_refractometro', 'REFRACTOMETRO', 'Refractómetro para miel', 'medicion', 'activo', 'unidades', 'Medición y control', 'gauge'),
('cat_termometro', 'TERMOMETRO', 'Termómetro', 'medicion', 'activo', 'unidades', 'Medición y control', 'gauge'),
('cat_higrometro', 'HIGROMETRO', 'Higrómetro', 'medicion', 'activo', 'unidades', 'Medición y control', 'gauge'),
('cat_correa_transporte', 'CORREA-TRANSP', 'Correa para transporte de colmenas', 'transporte', 'activo', 'unidades', 'Transporte y movilización', 'truck'),
('cat_malla_transporte', 'MALLA-TRANSP', 'Malla para transporte de colmenas', 'transporte', 'activo', 'unidades', 'Transporte y movilización', 'truck'),
('cat_carretilla', 'CARRETILLA', 'Carretilla o carro de carga', 'transporte', 'activo', 'unidades', 'Transporte y movilización', 'truck');

CREATE INDEX "insumos_apicola_usuarioId_tipoItem_idx" ON "insumos_apicola"("usuarioId", "tipoItem");
CREATE UNIQUE INDEX "catalogo_items_inventario_codigo_key" ON "catalogo_items_inventario"("codigo");
CREATE INDEX "catalogo_items_inventario_tipoItem_categoria_idx" ON "catalogo_items_inventario"("tipoItem", "categoria");
CREATE INDEX "insumos_apicola_catalogoItemId_idx" ON "insumos_apicola"("catalogoItemId");
CREATE INDEX "movimientos_inventario_insumoId_fecha_idx" ON "movimientos_inventario"("insumoId", "fecha");
ALTER TABLE "insumos_apicola" ADD CONSTRAINT "insumos_apicola_catalogoItemId_fkey" FOREIGN KEY ("catalogoItemId") REFERENCES "catalogo_items_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos_apicola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Models already used by the administration dashboard but missing from the
-- historical migration chain are included here so a clean deployment matches
-- the current schema exactly.
CREATE TABLE "configuracion_sistema" (
  "id" TEXT NOT NULL DEFAULT 'principal',
  "appName" TEXT NOT NULL DEFAULT 'ApiColmena Pro',
  "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
  "allowRegistration" BOOLEAN NOT NULL DEFAULT true,
  "defaultLanguage" TEXT NOT NULL DEFAULT 'es',
  "defaultCurrency" "Moneda" NOT NULL DEFAULT 'COP',
  "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
  "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
  "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
  "maintenanceAlerts" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT,
  CONSTRAINT "configuracion_sistema_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "actividades" (
  "id" TEXT NOT NULL,
  "tipo" "TipoActividad" NOT NULL,
  "titulo" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "entidadTipo" TEXT,
  "entidadId" TEXT,
  "entidadNombre" TEXT,
  "estado" TEXT NOT NULL DEFAULT 'success',
  "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usuarioId" TEXT NOT NULL,
  CONSTRAINT "actividades_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "actividades" ADD CONSTRAINT "actividades_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
