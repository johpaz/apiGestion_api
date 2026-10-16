import { describe, expect, test } from 'bun:test';

// Base inalcanzable a propósito (anula el .env): estas pruebas no deben tocar datos reales.
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test';
const { ALL_TOOLS, MAX_ROWS, dateOf, idOf, limitOf, oneOf, runTool, toolsFor } = await import('./tools');

describe('normalización de argumentos del modelo', () => {
  test('limitOf acota a 1..MAX_ROWS y tolera basura', () => {
    expect(limitOf(5)).toBe(5);
    expect(limitOf('7')).toBe(7);
    expect(limitOf(10_000)).toBe(MAX_ROWS);
    expect(limitOf(-3)).toBe(20);
    expect(limitOf('abc', 12)).toBe(12);
    expect(limitOf(undefined)).toBe(20);
  });

  test('dateOf solo acepta fechas ISO', () => {
    expect(dateOf('2026-03-01')?.toISOString().startsWith('2026-03-01')).toBe(true);
    expect(dateOf('ayer')).toBeNull();
    expect(dateOf(20260301)).toBeNull();
  });

  test('oneOf descarta valores fuera de la lista', () => {
    expect(oneOf('activa', ['activa', 'inactiva'] as const)).toBe('activa');
    expect(oneOf("activa' OR 1=1", ['activa', 'inactiva'] as const)).toBeNull();
    expect(oneOf(3, ['activa'] as const)).toBeNull();
  });

  test('idOf solo deja pasar ids simples', () => {
    expect(idOf('a1b2c3')).toBe('a1b2c3');
    expect(idOf("x' OR '1'='1")).toBeNull();
    expect(idOf('')).toBeNull();
    expect(idOf('a'.repeat(65))).toBeNull();
  });
});

describe('catálogo de herramientas', () => {
  test('los nombres son únicos y cada herramienta pertenece a un solo rol', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(toolsFor('apicultor').length + toolsFor('administrador').length).toBe(names.length);
  });

  test('las herramientas de administrador llevan prefijo admin_ y las de apicultor no', () => {
    for (const t of toolsFor('administrador')) expect(t.name.startsWith('admin_')).toBe(true);
    for (const t of toolsFor('apicultor')) expect(t.name.startsWith('admin_')).toBe(false);
  });

  test('ninguna herramienta pide el id de usuario como parámetro (el contexto lo decide el servidor)', () => {
    for (const t of ALL_TOOLS) {
      expect(Object.keys(t.parameters.properties)).not.toContain('usuarioId');
      expect(Object.keys(t.parameters.properties)).not.toContain('userId');
    }
  });
});

describe('runTool', () => {
  test('un apicultor no puede ejecutar herramientas de administrador', async () => {
    const result = await runTool({ userId: 'u1', rol: 'apicultor' }, 'admin_usuarios_listar', {});
    expect(result).toEqual({ error: 'No tienes permisos para usar esta herramienta' });
  });

  test('un administrador no ejecuta herramientas de apicultor', async () => {
    const result = await runTool({ userId: 'u1', rol: 'administrador' }, 'apiario_listar', {});
    expect(result).toEqual({ error: 'No tienes permisos para usar esta herramienta' });
  });

  test('herramienta desconocida', async () => {
    expect(await runTool({ userId: 'u1', rol: 'apicultor' }, 'drop_everything', {})).toEqual({
      error: 'Herramienta desconocida: drop_everything',
    });
  });

  test('un fallo de base de datos no filtra detalles al modelo', async () => {
    const result = (await runTool({ userId: 'u1', rol: 'apicultor' }, 'apiario_resumen_general', 'no-es-un-objeto')) as {
      error: string;
    };
    expect(result.error).toBe('No se pudo consultar ese dato en este momento');
  });
});
