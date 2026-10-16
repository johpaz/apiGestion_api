-- API keys de proveedores de IA (Gemini) por usuario, cifradas con AES-256-GCM por la aplicación.
-- Viven en Postgres (con sus respaldos y su volumen) y no dependen del volumen de HiveDB.
CREATE TABLE "ai_api_keys" (
  "usuarioId" TEXT NOT NULL,
  "proveedor" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "ultimos4" TEXT NOT NULL,
  "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechaActualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_api_keys_pkey" PRIMARY KEY ("usuarioId", "proveedor"),
  CONSTRAINT "ai_api_keys_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
