/**
 * Integración de punta a punta SIN red ni Postgres: Gemini y la base relacional se simulan,
 * pero Elysia, la autenticación JWT, Hive SDK (HiveDB en memoria), el enjambre, la delegación
 * y el servidor MCP son los reales.
 *
 * Nota: `mock.module` es global al proceso de `bun test`; ningún otro test usa `src/db`.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Elysia } from 'elysia';
import jwt from 'jsonwebtoken';

process.env.HIVE_HOME = mkdtempSync(join(tmpdir(), 'hive-test-'));
process.env.HIVE_DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-con-mas-de-32-caracteres-xx';
process.env.AI_KEY_SECRET = 'clave-de-cifrado-de-prueba-0123456789';
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test';
process.env.LOG_LEVEL = 'error';
delete process.env.GEMINI_API_KEY;

const APICULTOR = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTRO_APICULTOR = 'c3d4e5f60718293a4b5c6d7e8f90a1b2';
const ADMIN = 'b2c3d4e5f60718293a4b5c6d7e8f90a1';
const USERS: Record<string, { rol: string }> = {
  [APICULTOR]: { rol: 'apicultor' },
  [OTRO_APICULTOR]: { rol: 'apicultor' },
  [ADMIN]: { rol: 'administrador' },
};

const keyTable = new Map<string, Record<string, string>>(); // simula la tabla ai_api_keys

const queries: Array<{ text: string; values: unknown[] }> = [];

mock.module('../db', () => {
  const sql: any = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    queries.push({ text, values });
    if (text.startsWith('INSERT INTO ai_api_keys')) {
      const [u, p, ciphertext, iv, tag] = values as string[];
      keyTable.set(`${u}|${p}`, { ciphertext, iv, tag });
      return Promise.resolve([]);
    }
    if (text.includes('FROM ai_api_keys')) {
      const k = `${values[0]}|${values[1]}`;
      if (text.startsWith('DELETE')) { keyTable.delete(k); return Promise.resolve([]); }
      return Promise.resolve(keyTable.has(k) ? [keyTable.get(k)] : []);
    }
    if (text.includes('FROM usuarios WHERE') && text.includes('id = ?')) {
      const u = USERS[values[0] as string];
      return Promise.resolve(
        u ? [{ id: values[0], rol: u.rol, email: 'x@y.z', nombre: 'Tester', activo: true, moneda: 'COP' }] : [],
      );
    }
    return Promise.resolve([{ n: 3, estado: 'activa', moneda: 'COP', nombre: 'Apiario El Roble' }]);
  };
  return { sql, insert: async () => ({}), updateById: async () => ({}), upsert: async () => ({}), ready: async () => {}, newId: () => 'x' };
});

// ─── Gemini simulado ────────────────────────────────────────────────────────
const geminiCalls: Array<{ key: string | null; tools: string[]; text: string }> = [];
const gemini = Bun.serve({
  port: 0,
  async fetch(req) {
    if (req.method === 'GET') {
      return req.headers.get('x-goog-api-key')?.includes('MALA') ? new Response('{}', { status: 403 }) : Response.json({ name: 'ok' });
    }
    const body: any = await req.json();
    const contents: any[] = body.contents ?? [];
    const lastParts: any[] = contents.at(-1)?.parts ?? [];
    const tools: string[] = (body.tools?.[0]?.functionDeclarations ?? []).map((t: any) => t.name);
    const asked = JSON.stringify(contents[0]?.parts ?? []);
    geminiCalls.push({ key: req.headers.get('x-goog-api-key'), tools, text: asked });

    const answered = lastParts.find((p) => p.functionResponse)?.functionResponse;
    let parts: any[];
    if (answered) {
      parts = [{ text: `Con tus datos: ${JSON.stringify(answered.response).slice(0, 300)}` }];
    } else if (tools.includes('ui_mostrar') && asked.includes('grafica')) {
      parts = [{ functionCall: { name: 'ui_mostrar', args: { titulo: 'Prod', bloques: [{ tipo: 'grafica', etiquetas: ['Ene'], series: [{ nombre: 'Miel', valores: [3] }] }] } } }];
    } else if (tools.includes('task_delegate') && asked.includes('campo')) {
      parts = [{ functionCall: { name: 'task_delegate', args: { worker_id: JSON.stringify(body.systemInstruction ?? body).match(/campo_apicola__[a-f0-9]+/)?.[0] ?? 'campo_apicola', task_description: 'lista los apiarios', mode: 'sync' } } }];
    } else if (tools.includes('apiario_listar') && !tools.includes('task_delegate')) {
      parts = [{ functionCall: { name: 'apiario_listar', args: { limite: 5 } } }];
    } else if (tools.includes('apiario_resumen_general')) {
      parts = [{ functionCall: { name: 'apiario_resumen_general', args: {} } }];
    } else if (tools.includes('admin_metricas_plataforma')) {
      parts = [{ functionCall: { name: 'admin_metricas_plataforma', args: {} } }];
    } else {
      parts = [{ text: 'hola' }];
    }
    return Response.json({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
  },
});

let app: Elysia;
let hive: typeof import('./hive');

const token = (id: string) => jwt.sign({ id, email: 'x@y.z' }, process.env.JWT_SECRET!, { algorithm: 'HS256' });
const call = (path: string, init: RequestInit & { as?: string } = {}) => {
  const { as, ...rest } = init;
  return app.handle(
    new Request(`http://localhost/api/v1${path}`, {
      ...rest,
      headers: { 'Content-Type': 'application/json', ...(as ? { Authorization: `Bearer ${token(as)}` } : {}), ...(rest.headers as object) },
    }),
  );
};
const rpc = (as: string | undefined, method: string, params: object = {}, id = 1) =>
  call('/mcp/v2', {
    as,
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });

beforeAll(async () => {
  process.env.GEMINI_BASE_URL = `http://localhost:${gemini.port}`;
  const { errorHandler } = await import('../middleware/errorHandler');
  const { default: aiRoutes } = await import('../routes/ai');
  const { default: mcpRoutes } = await import('../routes/mcp');
  hive = await import('./hive');
  app = new Elysia().use(errorHandler).group('/api/v1', (g) => g.use(mcpRoutes).use(aiRoutes)) as unknown as Elysia;
  await hive.initAi();
});

afterAll(() => {
  gemini.stop(true);
});

describe('API key de Gemini', () => {
  test('sin autenticación no hay acceso', async () => {
    expect((await call('/ai/estado')).status).toBe(401);
  });

  test('sin clave configurada el chat responde 402 con código NO_API_KEY', async () => {
    const res = await call('/ai/chat', { as: APICULTOR, method: 'POST', body: JSON.stringify({ mensaje: 'hola' }) });
    expect(res.status).toBe(402);
    expect((await res.json()).codigo).toBe('NO_API_KEY');
  });

  test('rechaza una clave que Google marca como inválida y no la guarda', async () => {
    const res = await call('/ai/api-key', { as: APICULTOR, method: 'PUT', body: JSON.stringify({ apiKey: 'AIza-MALA-MALA-MALA-MALA-1234' }) });
    expect(res.status).toBe(400);
    const estado = await (await call('/ai/estado', { as: APICULTOR })).json();
    expect(estado.data.configurada).toBe(false);
  });

  test('guarda la clave cifrada, devuelve solo los últimos 4 y es independiente por usuario', async () => {
    const res = await call('/ai/api-key', { as: APICULTOR, method: 'PUT', body: JSON.stringify({ apiKey: 'AIzaSyAPICULTOR-SECRETA-4321' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.clave).toBe('••••4321');
    expect(JSON.stringify(body)).not.toContain('SECRETA');

    const otro = await (await call('/ai/estado', { as: OTRO_APICULTOR })).json();
    expect(otro.data.configurada).toBe(false);
  });

  test('la clave vive en la base relacional: cifrada, y si cambia el secreto se marca como ilegible', async () => {
    const row = [...keyTable.entries()].find(([k]) => k.startsWith(APICULTOR));
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toContain('SECRETA');
    const original = process.env.AI_KEY_SECRET;
    process.env.AI_KEY_SECRET = 'otro-secreto-completamente-distinto-123456';
    const estado = await (await call('/ai/estado', { as: APICULTOR })).json();
    process.env.AI_KEY_SECRET = original;
    expect(estado.data.configurada).toBe(false);
    expect(estado.data.ilegible).toBe(true);
    expect((await (await call('/ai/estado', { as: APICULTOR })).json()).data.configurada).toBe(true);
  });

  test('el administrador NO hereda la clave de otro usuario y sin GEMINI_API_KEY no tiene clave', async () => {
    const admin = await (await call('/ai/estado', { as: ADMIN })).json();
    expect(admin.data.configurada).toBe(false);
  });
});

describe('enjambre', () => {
  test('el apicultor tiene 4 agentes propios y ninguno de fábrica', async () => {
    const res = await (await call('/ai/agentes', { as: APICULTOR })).json();
    expect(res.data.map((a: any) => a.id).sort()).toEqual(['campo_apicola', 'colmena_maestra', 'negocio_apicola', 'sanidad_apicola']);
    expect(res.data.every((a: any) => a.modelo === 'gemini/gemini-3.8-flash')).toBe(true);
  });

  test('el administrador tiene su propio enjambre, distinto', async () => {
    const res = await (await call('/ai/agentes', { as: ADMIN })).json();
    expect(res.data.map((a: any) => a.id).sort()).toEqual(['admin_maestra', 'admin_usuarios', 'admin_vigilancia']);
  });

  test('cada apicultor recibe su propia colmena', async () => {
    const res = await (await call('/ai/agentes', { as: OTRO_APICULTOR })).json();
    expect(res.data.length).toBe(4);
  });
});

describe('chat con los datos', () => {
  test('SSE: el coordinador consulta una herramienta con la clave del propio usuario', async () => {
    geminiCalls.length = 0;
    const res = await call('/ai/chat', { as: APICULTOR, method: 'POST', body: JSON.stringify({ mensaje: 'dame un resumen', conversacionId: 'conv-abcdef01' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('connection')).toBeNull(); // prohibida en HTTP/2 (Traefik la rechaza)
    const text = await res.text();
    expect(text).toContain('event: inicio');
    expect(text).toContain('event: step');
    expect(text).toContain('apiario_resumen_general');
    expect(text).toContain('event: done');
    expect(text).toContain('Con tus datos');
    expect(geminiCalls.every((c) => c.key === 'AIzaSyAPICULTOR-SECRETA-4321')).toBe(true);
    // Un coordinador acotado: ni shell, ni archivos, ni web.
    const loadout = geminiCalls[0]!.tools;
    expect(loadout).toContain('task_delegate');
    expect(loadout).toContain('apiario_resumen_general');
    expect(loadout.some((t) => /^(cli_|fs_|web_|browser_)/.test(t))).toBe(false);
    expect(loadout.some((t) => t.startsWith('admin_'))).toBe(false);
  });

  test('SSE: la herramienta ui_mostrar entrega una superficie A2UI al cliente', async () => {
    await call('/ai/api-key', { as: APICULTOR, method: 'PUT', body: JSON.stringify({ apiKey: 'AIzaSyAPICULTOR-SECRETA-4321' }) });
    const text = await (await call('/ai/chat', { as: APICULTOR, method: 'POST', body: JSON.stringify({ mensaje: 'muestra una grafica' }) })).text();
    expect(text).toContain('event: a2ui');
    expect(text).toContain('beginRendering');
    expect(text).toContain('"Chart"');
  });

  test('JSON: delega en un especialista que consulta la base con el usuario correcto', async () => {
    queries.length = 0;
    const res = await call('/ai/chat', { as: APICULTOR, method: 'POST', headers: { Accept: 'application/json' }, body: JSON.stringify({ mensaje: 'revisa el campo' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.respuesta).toContain('Con tus datos');
    const apiarioQuery = queries.find((q) => q.text.includes('FROM apiarios a WHERE a."usuarioId" = ?'));
    expect(apiarioQuery?.values[0]).toBe(APICULTOR);
  });

  test('el mensaje vacío o gigante se rechaza', async () => {
    expect((await call('/ai/chat', { as: APICULTOR, method: 'POST', body: JSON.stringify({ mensaje: '  ' }) })).status).toBe(400);
    expect((await call('/ai/chat', { as: APICULTOR, method: 'POST', body: JSON.stringify({ mensaje: 'x'.repeat(4001) }) })).status).toBe(400);
  });

  test('eliminar la clave vuelve a bloquear el chat', async () => {
    expect((await call('/ai/api-key', { as: APICULTOR, method: 'DELETE' })).status).toBe(200);
    const res = await call('/ai/chat', { as: APICULTOR, method: 'POST', body: JSON.stringify({ mensaje: 'hola' }) });
    expect(res.status).toBe(402);
  });

  test('el administrador conversa con su coordinadora y ve herramientas admin_', async () => {
    await call('/ai/api-key', { as: ADMIN, method: 'PUT', body: JSON.stringify({ apiKey: 'AIzaSyADMIN-SECRETA-9999' }) });
    geminiCalls.length = 0;
    const res = await call('/ai/chat', { as: ADMIN, method: 'POST', headers: { Accept: 'application/json' }, body: JSON.stringify({ mensaje: 'métricas' }) });
    expect(res.status).toBe(200);
    expect(geminiCalls[0]!.tools).toContain('admin_metricas_plataforma');
    expect(geminiCalls[0]!.tools).not.toContain('apiario_resumen_general');
  });
});

describe('transporte real (TCP + CORS)', () => {
  test('el stream SSE termina limpio por un socket real', async () => {
    const { cors } = await import('@elysiajs/cors');
    const { default: aiRoutes } = await import('../routes/ai');
    const server = new Elysia().use(cors({ origin: '*' })).group('/api/v1', (g) => g.use(aiRoutes)).listen(0);
    try {
      await call('/ai/api-key', { as: APICULTOR, method: 'PUT', body: JSON.stringify({ apiKey: 'AIzaSyAPICULTOR-SECRETA-4321' }) });
      const res = await fetch(`http://localhost:${server.server!.port}/api/v1/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(APICULTOR)}`, Origin: 'https://app.test' },
        body: JSON.stringify({ mensaje: 'dame un resumen' }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('event: done');
    } finally {
      server.stop(true);
    }
  });
});

describe('turnos con polling (narración en vivo)', () => {
  const poll = async (as: string, id: string, from = 0) => (await call(`/ai/turnos/${id}?desde=${from}`, { as })).json();

  test('inicia un turno, narra los pasos y entrega la respuesta con tarjeta A2UI', async () => {
    await call('/ai/api-key', { as: APICULTOR, method: 'PUT', body: JSON.stringify({ apiKey: 'AIzaSyAPICULTOR-SECRETA-4321' }) });
    const start = await call('/ai/turnos', { as: APICULTOR, method: 'POST', body: JSON.stringify({ mensaje: 'muestra una grafica' }) });
    expect(start.status).toBe(202);
    const { turnId } = (await start.json()).data;
    const seen: any[] = [];
    let from = 0;
    for (let i = 0; i < 100; i++) {
      const r = (await poll(APICULTOR, turnId, from)).data;
      seen.push(...r.eventos);
      from = r.siguiente;
      if (r.terminado) break;
      await Bun.sleep(20);
    }
    expect(seen.some((e) => e.type === 'step' && e.name === 'ui_mostrar')).toBe(true);
    expect(seen.some((e) => e.type === 'a2ui')).toBe(true);
    expect(seen.at(-1).type).toBe('done');
  });

  test('un turno es privado de su dueño', async () => {
    const { turnId } = (await (await call('/ai/turnos', { as: APICULTOR, method: 'POST', body: JSON.stringify({ mensaje: 'hola' }) })).json()).data;
    expect((await call(`/ai/turnos/${turnId}`, { as: OTRO_APICULTOR })).status).toBe(404);
  });

  test('sin API key el turno termina con un evento de error con código', async () => {
    const { turnId } = (await (await call('/ai/turnos', { as: OTRO_APICULTOR, method: 'POST', body: JSON.stringify({ mensaje: 'hola' }) })).json()).data;
    let r: any;
    for (let i = 0; i < 100; i++) { r = (await poll(OTRO_APICULTOR, turnId)).data; if (r.terminado) break; await Bun.sleep(20); }
    expect(r.eventos.at(-1)).toMatchObject({ type: 'error', codigo: 'NO_API_KEY' });
  });
});

describe('MCP v2', () => {
  test('exige autenticación', async () => {
    const res = await rpc(undefined, 'tools/list');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Bearer');
  });

  test('initialize anuncia tools y prompts', async () => {
    const res = await rpc(APICULTOR, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    const body = await res.json();
    expect(body.result.serverInfo).toEqual({ name: 'apigestion-mcp', version: '2.0.0' });
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.capabilities.prompts).toBeDefined();
  });

  test('un apicultor ve solo sus herramientas, todas de solo lectura', async () => {
    const body = await (await rpc(APICULTOR, 'tools/list')).json();
    const names = body.result.tools.map((t: any) => t.name);
    expect(names).toContain('colmena_detalle');
    expect(names.some((n: string) => n.startsWith('admin_'))).toBe(false);
    expect(body.result.tools.every((t: any) => t.annotations.readOnlyHint === true)).toBe(true);
  });

  test('un administrador ve las herramientas admin_ y no las de apicultor', async () => {
    const body = await (await rpc(ADMIN, 'tools/list')).json();
    const names = body.result.tools.map((t: any) => t.name);
    expect(names).toContain('admin_metricas_plataforma');
    expect(names).not.toContain('colmena_detalle');
  });

  test('tools/call ejecuta con el usuario del token', async () => {
    queries.length = 0;
    const body = await (await rpc(APICULTOR, 'tools/call', { name: 'apiario_listar', arguments: {} })).json();
    expect(body.result.isError).toBe(false);
    expect(queries.some((q) => q.text.includes('FROM apiarios a WHERE a."usuarioId" = ?') && q.values[0] === APICULTOR)).toBe(true);
  });

  test('un apicultor no puede invocar una herramienta de administrador aunque conozca el nombre', async () => {
    const body = await (await rpc(APICULTOR, 'tools/call', { name: 'admin_usuarios_listar', arguments: {} })).json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('No tienes permisos');
  });

  test('las skills del rol se exponen como prompts', async () => {
    const list = await (await rpc(APICULTOR, 'prompts/list')).json();
    const names = list.result.prompts.map((p: any) => p.name);
    expect(names).toContain('revision-semanal-apiario');
    expect(names).not.toContain('salud-de-la-plataforma');
    const got = await (await rpc(APICULTOR, 'prompts/get', { name: 'diagnostico-colmena' })).json();
    expect(got.result.messages[0].content.text).toContain('colmena_detalle');
  });
});
