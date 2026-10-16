-- PostgreSQL requires new enum values to be committed before another
-- migration can use them in catalog rows.
ALTER TYPE "CategoriaInsumo" ADD VALUE 'cajas_colmena' BEFORE 'marcos';
ALTER TYPE "CategoriaInsumo" ADD VALUE 'cajas_nucleo' BEFORE 'marcos';
ALTER TYPE "CategoriaInsumo" ADD VALUE 'bases' AFTER 'techos';
ALTER TYPE "CategoriaInsumo" ADD VALUE 'equipos_extraccion' AFTER 'herramientas';
ALTER TYPE "CategoriaInsumo" ADD VALUE 'envases' AFTER 'herramientas';
ALTER TYPE "CategoriaInsumo" ADD VALUE 'alimentacion' AFTER 'herramientas';
ALTER TYPE "CategoriaInsumo" ADD VALUE 'cria_reinas' AFTER 'alimentacion';
ALTER TYPE "CategoriaInsumo" ADD VALUE 'sanidad_bioseguridad' AFTER 'alimentacion';
ALTER TYPE "CategoriaInsumo" ADD VALUE 'medicion' AFTER 'alimentacion';
ALTER TYPE "CategoriaInsumo" ADD VALUE 'transporte' AFTER 'alimentacion';
ALTER TYPE "CategoriaInsumo" ADD VALUE 'procesamiento_cera' AFTER 'alimentacion';
ALTER TYPE "CategoriaInsumo" ADD VALUE 'procesamiento_polen' AFTER 'alimentacion';
ALTER TYPE "CategoriaInsumo" ADD VALUE 'procesamiento_propoleo' AFTER 'alimentacion';
