import { resolve as resolvePath } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ensureHiveDb, closeHiveDb, col, registerAppTool, runAgent, SEED_DATA } from '@johpaz/hive-sdk';
import type { ToolDoc } from '@johpaz/hive-sdk';
import {
  runInTenant,
  currentTenant,
  tenantKeyFromId,
  setCatalogActivation,
  loadProviderApiKey,
  deleteProviderSecrets,
} from '@johpaz/hive-sdk/storage';
import { agents, skills as skillsApi } from '@johpaz/hive-sdk/services';
import { syncToolsToIndex, syncSkillsToIndex, flushTraces } from '@johpaz/hive-sdk/agent';
import logger from '../utils/logger';
import { ALL_TOOLS, runTool, type Audience, type ToolContext } from './tools';
import { deleteStoredKey, loadStoredKey, saveStoredKey } from './keyStore';
import { UI_TOOL, buildSurface, type A2uiMessage } from './a2ui';
import { AI_MODEL, AI_PROVIDER, SKILLS, SWARMS, agentIdFor, coordinatorOf, personaIdFromAgentId, promptFor, userIdFromAgentId } from './swarm';

/**
 * Integración con Hive SDK.
 *
 *  - Una sola HiveDB embebida (HIVE_HOME) con un inquilino por usuario: su colmena de agentes,
 *    sus conversaciones y su API key de Gemini (cifrada) no se mezclan con las de nadie más.
 *  - El catálogo de herramientas y skills de ApiGestión se instala una vez (compartido) y cada
 *    inquilino activa lo que le corresponde según su rol.
 *  - NO se instalan los agentes de fábrica del SDK (`specialists: "none"`).
 */

// HiveDB admite un solo proceso dueño. Por defecto el SDK usaría ~/.hive (compartido con cualquier otra
// instalación de Hive de esta máquina y bloqueado si está en uso): esta app usa su propio directorio.
process.env.HIVE_HOME ||= resolvePath(process.cwd(), 'data/hive');

const log = logger.child({ module: 'ai' });

export class AiError extends Error {
  constructor(
    message: string,
    public readonly code: 'NO_API_KEY' | 'INVALID_API_KEY' | 'BUSY' | 'UNAVAILABLE',
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export interface AiUser {
  id: string;
  rol: Audience;
}

// Con `bun --hot` este módulo se reevalúa en el mismo proceso: el estado vive en globalThis para no
// reabrir HiveDB (que ya está abierta) ni repetir el arranque.
const g = globalThis as typeof globalThis & { __apigestionAi?: { ready: Promise<void> | null; provisioned: Set<string> } };
const state = (g.__apigestionAi ??= { ready: null, provisioned: new Set<string>() });
const provisioned = state.provisioned;

/** tenant → usuario: los workers delegados corren sin `user_id`, pero sí dentro del inquilino. */
const userByTenant = new Map<string, string>();

/** Segundo canal (propio) para el usuario del turno: no depende de que el SDK propague `user_id`. */
const turnUser = new AsyncLocalStorage<string>();

const inTenant = <T>(userId: string, fn: () => Promise<T>) => {
  const key = tenantKeyFromId(userId);
  userByTenant.set(key, userId);
  return turnUser.run(userId, () => runInTenant(key, fn));
};

/**
 * Quién llama a la herramienta. La vía principal es el `agent_id` que el SDK entrega SIEMPRE a la herramienta
 * (incluidos los workers delegados) y que lleva el id del usuario dueño. Se contrasta con el inquilino activo
 * cuando existe; si discrepan, no se adivina. Respaldos: contexto propio del turno, inquilino y `user_id`.
 */
function callerOf(config: any): string | undefined {
  const fromAgent = userIdFromAgentId(config?.configurable?.agent_id);
  const tenant = currentTenant();
  const fromTenant = tenant ? userByTenant.get(tenant) : undefined;
  const user = fromAgent ?? turnUser.getStore() ?? fromTenant ?? (config?.configurable?.user_id || undefined);
  if (user && tenant && tenantKeyFromId(user) !== tenant) return undefined; // otro inquilino: nunca se mezcla
  return user;
}

/** Ejecutor que ve el agente: reconstruye el contexto desde el usuario dueño del agente que llama. */
function toRuntimeTool(def: (typeof ALL_TOOLS)[number]) {
  return {
    name: def.name,
    description: def.description,
    parameters: {
      type: 'object' as const,
      properties: def.parameters.properties as any,
      required: def.parameters.required ?? [],
    },
    execute: async (args: Record<string, unknown>, config?: any) => {
      const userId = callerOf(config);
      const ctx = userId ? await resolveContext(userId) : null;
      if (!ctx) {
        log.warn({ tool: def.name, tenant: currentTenant(), declared: config?.configurable?.user_id, hasTurnUser: !!turnUser.getStore(), agent: config?.configurable?.agent_id }, 'Herramienta sin contexto de usuario');
        return { error: 'Sesión de usuario no disponible para esta consulta. Si delegaste con mode="async", repite la delegación con mode="sync"' };
      }
      return (await runTool(ctx, def.name, args)) as object;
    },
  };
}

/** Superficies A2UI emitidas durante el turno en curso, por inquilino (las recoge `chat`). */
const surfaceSinks = new Map<string, A2uiMessage[][]>();

const uiRuntimeTool = {
  name: UI_TOOL.name,
  description: UI_TOOL.description,
  parameters: { type: 'object' as const, properties: UI_TOOL.parameters.properties as any, required: UI_TOOL.parameters.required },
  execute: async (args: Record<string, unknown>): Promise<object> => {
    const tenant = currentTenant();
    const sink = tenant ? surfaceSinks.get(tenant) : undefined;
    if (!sink) return { error: 'No hay una conversación activa donde mostrar la tarjeta' };
    try {
      sink.push(buildSurface(args));
      return { ok: true, mensaje: 'Tarjeta mostrada al usuario. No repitas sus datos: añade solo una conclusión breve.' };
    } catch (error) {
      return { error: (error as Error).message };
    }
  },
};

/** El rol SIEMPRE sale de la base: ni el modelo ni el cliente pueden elevarlo. */
export async function resolveContext(userId: string): Promise<ToolContext | null> {
  const { sql } = await import('../db');
  const [user] = await sql`SELECT id, rol FROM usuarios WHERE id = ${userId} AND activo = true`;
  return user ? { userId: user.id, rol: user.rol } : null;
}

async function bootstrap(): Promise<void> {
  if (!SEED_DATA.models.some((m: { id: string }) => m.id === AI_MODEL)) {
    throw new Error(`El modelo "${AI_MODEL}" no está en el catálogo del SDK instalado`);
  }

  // Catálogo compartido (fuera de inquilino). Sin especialistas de fábrica.
  await ensureHiveDb({ specialists: 'none' });

  const toolsCol = await col<ToolDoc>('tools');
  const now = Date.now();
  for (const tool of ALL_TOOLS) {
    registerAppTool(toRuntimeTool(tool));
    const existing = await toolsCol.get(tool.name);
    await toolsCol.put(
      tool.name,
      { id: tool.name, name: tool.name, description: tool.description, category: 'apigestion', enabled: true, active: false, created_at: existing?.doc.created_at ?? now, updated_at: now },
      existing ? { expectedVersion: existing.version } : { expectedVersion: 0 },
    );
  }
  registerAppTool(uiRuntimeTool);
  const uiExisting = await toolsCol.get(UI_TOOL.name);
  await toolsCol.put(
    UI_TOOL.name,
    { id: UI_TOOL.name, name: UI_TOOL.name, description: UI_TOOL.description, category: 'apigestion', enabled: true, active: false, created_at: uiExisting?.doc.created_at ?? now, updated_at: now },
    uiExisting ? { expectedVersion: uiExisting.version } : { expectedVersion: 0 },
  );
  await syncToolsToIndex().catch((e) => log.warn({ err: e }, 'No pude indexar las herramientas'));

  for (const skill of SKILLS) {
    const body = [skill.description, '', ...skill.steps.map((s, i) => `${i + 1}. **${s.action}** — ${s.instruction}`)].join('\n');
    const fields = { name: skill.name, description: skill.description, category: skill.category, body, tools: skill.tools, triggers: skill.triggers, active: false };
    if (await skillsApi.getSkill(skill.name)) await skillsApi.updateSkill(skill.name, fields);
    else await skillsApi.createSkill({ id: skill.name, ...fields });
  }
  await syncSkillsToIndex().catch((e) => log.warn({ err: e }, 'No pude indexar las skills'));

  log.info({ tools: ALL_TOOLS.length, skills: SKILLS.length, model: `${AI_PROVIDER}/${AI_MODEL}` }, '🐝 Hive SDK listo');
}

export function initAi(): Promise<void> {
  state.ready ??= bootstrap().catch((error) => {
    state.ready = null; // permite reintentar en la siguiente petición
    throw error;
  });
  return state.ready;
}

/** Para las rutas: si Hive no pudo arrancar, el usuario ve "no disponible" y no un 500 genérico. */
async function ensureReady(): Promise<void> {
  try {
    await initAi();
  } catch (error) {
    log.error({ err: error }, 'Hive SDK no está disponible');
    throw new AiError('El asistente de IA no está disponible en este momento', 'UNAVAILABLE', 503);
  }
}

export async function shutdownAi(): Promise<void> {
  if (!state.ready) return;
  await flushTraces().catch(() => {});
  try {
    closeHiveDb();
  } catch (error) {
    log.warn({ err: error }, 'No pude cerrar HiveDB limpiamente');
  }
}

// ─── Enjambre del usuario ───────────────────────────────────────────────────

/** Crea (idempotente) la colmena del usuario: activaciones del catálogo + sus agentes. */
export async function provisionSwarm(user: AiUser): Promise<void> {
  await ensureReady();
  if (provisioned.has(user.id)) return;

  await inTenant(user.id, async () => {
    await ensureHiveDb({ specialists: 'none' });

    for (const name of [...ALL_TOOLS.filter((t) => t.audience === user.rol).map((t) => t.name), UI_TOOL.name]) {
      await setCatalogActivation('tools', name, { active: true });
    }
    for (const skill of SKILLS.filter((s) => s.audience === user.rol)) {
      await setCatalogActivation('skills', skill.name, { active: true });
    }

    // Especialistas primero: el coordinador los delega por id.
    const personas = [...SWARMS[user.rol]].sort((a, b) => (a.role === b.role ? 0 : a.role === 'worker' ? -1 : 1));
    for (const p of personas) {
      const id = agentIdFor(p.id, user.id);
      const spec = {
        name: p.name,
        description: p.description,
        systemPrompt: promptFor(p, user.rol, user.id),
        role: p.role,
        providerId: AI_PROVIDER,
        modelId: AI_MODEL,
        toolPatterns: p.toolPatterns,
        skills: p.skills,
        maxIterations: p.role === 'coordinator' ? 12 : 8,
        thinking: 'auto' as const,
        userId: user.id,
      };
      if (await agents.getAgent(id)) await agents.updateAgent(id, spec);
      else await agents.createAgent({ id, ...spec });
      await agents.deleteAgent(p.id).catch(() => {}); // versión anterior, sin id de usuario
    }
  });

  provisioned.add(user.id);
}

export async function listSwarm(user: AiUser) {
  await provisionSwarm(user);
  return inTenant(user.id, async () => {
    const mine = new Set(SWARMS[user.rol].map((p) => agentIdFor(p.id, user.id)));
    return (await agents.listAgents())
      .filter((a) => mine.has(a.id))
      .map((a) => ({
        id: personaIdFromAgentId(a.id),
        nombre: a.name,
        descripcion: a.description,
        rol: a.role,
        herramientas: a.toolPatterns,
        skills: a.skills,
        modelo: `${AI_PROVIDER}/${AI_MODEL}`,
      }));
  });
}

// ─── API key de Gemini ──────────────────────────────────────────────────────

const maskKey = (key: string) => `••••${key.slice(-4)}`;

/** El administrador puede apoyarse en la clave de la plataforma; el apicultor, solo en la suya. */
function platformKeyFor(rol: Audience): string {
  return rol === 'administrador' ? process.env.GEMINI_API_KEY?.trim() || '' : '';
}

/**
 * La clave del usuario vive en Postgres (ver keyStore.ts). Si solo existe en la HiveDB de una versión anterior,
 * se migra a Postgres la primera vez que se lee.
 */
async function readOwnKey(user: AiUser): Promise<{ apiKey: string | null; unreadable: boolean }> {
  const stored = await loadStoredKey(user.id, AI_PROVIDER);
  if (stored && 'apiKey' in stored) return { apiKey: stored.apiKey, unreadable: false };
  if (stored) return { apiKey: null, unreadable: true };
  const legacy = await inTenant(user.id, () => loadProviderApiKey(AI_PROVIDER)).catch(() => '');
  if (legacy) {
    await saveStoredKey(user.id, AI_PROVIDER, legacy);
    log.info({ user: user.id }, 'API key migrada de HiveDB a Postgres');
    return { apiKey: legacy, unreadable: false };
  }
  return { apiKey: null, unreadable: false };
}

export async function keyStatus(user: AiUser) {
  await ensureReady();
  const { apiKey: own, unreadable } = await readOwnKey(user);
  const platform = !own && !!platformKeyFor(user.rol);
  if (unreadable) log.error({ user: user.id }, 'API key guardada pero ilegible: cambió AI_KEY_SECRET / JWT_SECRET');
  return {
    ilegible: unreadable,
    configurada: !!own || platform,
    origen: own ? ('propia' as const) : platform ? ('plataforma' as const) : null,
    clave: own ? maskKey(own) : null,
    proveedor: AI_PROVIDER,
    modelo: AI_MODEL,
  };
}

async function verifyGeminiKey(apiKey: string): Promise<'ok' | 'invalid' | 'unknown'> {
  const base = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(AI_MODEL)}`, {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return 'ok';
    if (res.status === 400 || res.status === 401 || res.status === 403) return 'invalid';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function saveApiKey(user: AiUser, rawKey: unknown) {
  const apiKey = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (apiKey.length < 20 || apiKey.length > 256 || /\s/.test(apiKey)) {
    throw new AiError('La API key de Gemini no tiene un formato válido', 'INVALID_API_KEY');
  }
  if ((await verifyGeminiKey(apiKey)) === 'invalid') {
    throw new AiError('Google rechazó esa API key. Revísala en Google AI Studio', 'INVALID_API_KEY');
  }
  await ensureReady();
  try {
    await saveStoredKey(user.id, AI_PROVIDER, apiKey);
  } catch (error) {
    log.error({ err: error }, 'No se pudo guardar la API key');
    throw new AiError('No se pudo guardar la clave de forma segura', 'UNAVAILABLE', 503);
  }
  return keyStatus(user);
}

export async function removeApiKey(user: AiUser) {
  await ensureReady();
  await deleteStoredKey(user.id, AI_PROVIDER);
  await inTenant(user.id, () => deleteProviderSecrets(AI_PROVIDER)).catch(() => {}); // copia heredada, si la hay
  return keyStatus(user);
}

// ─── Conversación ───────────────────────────────────────────────────────────

export type ChatEvent =
  | { type: 'step'; step: 'tool_call' | 'tool_result' | 'delegate'; name: string }
  | { type: 'token'; content: string }
  | { type: 'a2ui'; messages: A2uiMessage[] }
  | { type: 'done'; response: string; usage?: { tokensEntrada: number; tokensSalida: number; herramientas: number } };

const inflight = new Map<string, number>();
const MAX_CONCURRENT_PER_USER = 2;

export const isConversationId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v);

export async function* chat(user: AiUser, message: string, conversationId: string, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  await provisionSwarm(user);

  const running = inflight.get(user.id) ?? 0;
  if (running >= MAX_CONCURRENT_PER_USER) {
    throw new AiError('Ya tienes conversaciones en curso. Espera a que terminen', 'BUSY', 429);
  }
  inflight.set(user.id, running + 1);

  try {
    const own = (await readOwnKey(user)).apiKey;
    const apiKey = own || platformKeyFor(user.rol);
    if (!apiKey) {
      throw new AiError('Configura tu API key de Gemini para hablar con tus datos', 'NO_API_KEY', 402);
    }

    const queue: ChatEvent[] = [];
    let wake: (() => void) | null = null;
    const push = (e: ChatEvent) => {
      queue.push(e);
      wake?.();
    };

    const coordinator = coordinatorOf(user.rol);
    const baseUrl = process.env.GEMINI_BASE_URL?.trim() || undefined;

    const tenantKey = tenantKeyFromId(user.id);
    const sink: A2uiMessage[][] = [];
    surfaceSinks.set(tenantKey, sink);
    const flushSurfaces = () => { while (sink.length) push({ type: 'a2ui', messages: sink.shift()! }); };

    const run = inTenant(user.id, async () => {
      let last = '';
      let usage: any;
      for await (const chunk of runAgent({
        agentId: agentIdFor(coordinator.id, user.id),
        userMessage: message,
        threadId: `${user.id}-${conversationId}`,
        channel: 'web',
        userId: user.id,
        signal,
        credentials: { apiKey, ...(baseUrl ? { baseUrl } : {}) },
        jev: false, // sin oráculo externo: los datos del apicultor no salen hacia otro proveedor
        onToken: (t: string) => push({ type: 'token', content: t }),
      })) {
        if (chunk.usage) usage = chunk.usage;
        flushSurfaces();
        for (const msg of chunk.agent?.messages ?? []) {
          if (typeof msg.content === 'string' && msg.content) last = msg.content;
          for (const tc of msg.tool_calls ?? []) {
            const name = tc.function?.name ?? 'herramienta';
            push({ type: 'step', step: name === 'task_delegate' ? 'delegate' : 'tool_call', name });
          }
        }
        for (const msg of chunk.tools?.messages ?? []) push({ type: 'step', step: 'tool_result', name: msg.name ?? 'herramienta' });
        flushSurfaces();
      }
      flushSurfaces();
      push({
        type: 'done',
        response: last,
        usage: usage
          ? { tokensEntrada: usage.input_tokens ?? 0, tokensSalida: usage.output_tokens ?? 0, herramientas: usage.tool_calls ?? 0 }
          : undefined,
      });
    });

    let failure: unknown = null;
    let finished = false;
    run.then(() => (finished = true), (e) => { failure = e; finished = true; }).finally(() => wake?.());

    while (true) {
      while (queue.length) {
        const event = queue.shift()!;
        yield event;
        if (event.type === 'done') return;
      }
      if (finished) break;
      await new Promise<void>((resolve) => { wake = resolve; });
      wake = null;
    }
    while (queue.length) yield queue.shift()!;
    if (failure) throw mapProviderError(failure);
  } finally {
    surfaceSinks.delete(tenantKeyFromId(user.id));
    const left = (inflight.get(user.id) ?? 1) - 1;
    if (left <= 0) inflight.delete(user.id);
    else inflight.set(user.id, left);
  }
}

function mapProviderError(error: unknown): Error {
  if (error instanceof AiError) return error;
  const text = error instanceof Error ? error.message : String(error);
  log.error({ error: text }, 'Falló un turno del agente');
  if (/API key|api_key|401|403|PERMISSION_DENIED|UNAUTHENTICATED/i.test(text)) {
    return new AiError('Gemini rechazó tu API key. Verifica que siga activa en Google AI Studio', 'INVALID_API_KEY', 402);
  }
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(text)) {
    return new AiError('Tu cuota de Gemini se agotó. Intenta de nuevo más tarde', 'UNAVAILABLE', 429);
  }
  return new AiError('El asistente no pudo responder en este momento', 'UNAVAILABLE', 502);
}
