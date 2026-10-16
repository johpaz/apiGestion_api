import { Elysia } from 'elysia';
import { z } from 'zod';
import { authGuard } from '../middleware/auth';
import {
  AiError,
  chat,
  isConversationId,
  keyStatus,
  listSwarm,
  removeApiKey,
  saveApiKey,
  type AiUser,
} from '../ai/hive';
import { AI_MODEL, AI_PROVIDER } from '../ai/swarm';
import { toolsFor } from '../ai/tools';
import { readTurn, startTurn } from '../ai/turns';
import type { ApiResponse } from '../types/apicola';

const chatSchema = z.object({
  mensaje: z.string().trim().min(1, 'Escribe un mensaje').max(4000, 'El mensaje es demasiado largo'),
  conversacionId: z.string().optional(),
});

const keySchema = z.object({ apiKey: z.string().trim().min(20).max(256) });

// Límite por usuario: protege la cuota de Gemini del propio apicultor y el servidor.
const WINDOW_MS = 60_000;
const MAX_MESSAGES_PER_WINDOW = 20;
const recent = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_MESSAGES_PER_WINDOW) {
    recent.set(userId, hits);
    return true;
  }
  hits.push(now);
  recent.set(userId, hits);
  return false;
}

const asAiUser = (user: { id: string; rol: AiUser['rol'] }): AiUser => ({ id: user.id, rol: user.rol });

const fail = (set: { status?: number | string }, error: unknown): ApiResponse & { codigo?: string } => {
  if (error instanceof AiError) {
    set.status = error.status;
    return { success: false, error: error.message, codigo: error.code };
  }
  console.error('AI route error:', error);
  set.status = 500;
  return { success: false, error: 'Error interno del servidor' };
};

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const aiRoutes = new Elysia({ prefix: '/ai' }).use(authGuard);

// Estado de la integración: clave, modelo y enjambre del usuario
aiRoutes.get('/estado', async ({ user, set }: any) => {
  try {
    const ai = asAiUser(user);
    const [clave, agentes] = await Promise.all([keyStatus(ai), listSwarm(ai)]);
    return {
      success: true,
      data: { ...clave, agentes, herramientas: toolsFor(ai.rol).map((t) => t.name) },
    } as ApiResponse;
  } catch (error) {
    return fail(set, error);
  }
});

aiRoutes.get('/agentes', async ({ user, set }: any) => {
  try {
    return { success: true, data: await listSwarm(asAiUser(user)) } as ApiResponse;
  } catch (error) {
    return fail(set, error);
  }
});

// El apicultor guarda su API key de Gemini (se cifra en el servidor; nunca se devuelve completa)
aiRoutes.put('/api-key', async ({ user, body, set }: any) => {
  try {
    const parsed = keySchema.safeParse(body);
    if (!parsed.success) throw new AiError('La API key de Gemini no tiene un formato válido', 'INVALID_API_KEY');
    const data = await saveApiKey(asAiUser(user), parsed.data.apiKey);
    return { success: true, data, message: `API key guardada. Tus agentes usarán ${AI_PROVIDER}/${AI_MODEL}` } as ApiResponse;
  } catch (error) {
    return fail(set, error);
  }
});

aiRoutes.delete('/api-key', async ({ user, set }: any) => {
  try {
    return { success: true, data: await removeApiKey(asAiUser(user)), message: 'API key eliminada' } as ApiResponse;
  } catch (error) {
    return fail(set, error);
  }
});

// Conversación con los datos: SSE por defecto, JSON si el cliente pide application/json
aiRoutes.post('/chat', async ({ user, body, request, set }: any) => {
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    set.status = 400;
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos de entrada inválidos' } as ApiResponse;
  }
  if (rateLimited(user.id)) {
    set.status = 429;
    return { success: false, error: 'Demasiados mensajes seguidos. Espera un momento', codigo: 'RATE_LIMITED' } as ApiResponse;
  }

  const conversationId = isConversationId(parsed.data.conversacionId) ? parsed.data.conversacionId : crypto.randomUUID();
  const ai = asAiUser(user);
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const events = chat(ai, parsed.data.mensaje, conversationId, request.signal);

  if (wantsJson) {
    try {
      let response = '';
      let usage: unknown;
      const superficies: unknown[] = [];
      for await (const event of events) {
        if (event.type === 'a2ui') superficies.push(event.messages);
        if (event.type === 'done') {
          response = event.response;
          usage = event.usage;
        }
      }
      return { success: true, data: { conversacionId: conversationId, respuesta: response, uso: usage, superficies } } as ApiResponse;
    } catch (error) {
      return fail(set, error);
    }
  }

  // Se obtiene el primer evento antes de abrir el stream: así los errores previos (sin API key,
  // cuota, ocupado) salen con su código HTTP real y no como un 200 con un evento de error.
  const iterator = events[Symbol.asyncIterator]();
  let first: IteratorResult<Awaited<ReturnType<typeof iterator.next>>['value']>;
  try {
    first = await iterator.next();
  } catch (error) {
    return fail(set, error);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sse(event, data)));
      // Comentario SSE periódico: evita que Traefik/HTTP2 corte el stream por inactividad mientras Gemini piensa.
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keep-alive\n\n')); } catch { /* stream ya cerrado */ }
      }, 10_000);
      try {
        send('inicio', { conversacionId: conversationId });
        let current = first;
        while (!current.done) {
          const { type, ...payload } = current.value as { type: string };
          send(type, payload);
          current = await iterator.next();
        }
      } catch (error) {
        send('error', { error: error instanceof AiError ? error.message : 'El asistente no pudo responder', codigo: error instanceof AiError ? error.code : 'UNAVAILABLE' });
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* ya cancelado */ }
      }
    },
    cancel() {
      void iterator.return?.(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
});

// Turnos con eventos por polling (funciona detrás de cualquier proxy): POST inicia, GET consulta.
aiRoutes.post('/turnos', async ({ user, body, set }: any) => {
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    set.status = 400;
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos de entrada inválidos' } as ApiResponse;
  }
  if (rateLimited(user.id)) {
    set.status = 429;
    return { success: false, error: 'Demasiados mensajes seguidos. Espera un momento', codigo: 'RATE_LIMITED' } as ApiResponse;
  }
  set.status = 202;
  return { success: true, data: startTurn(asAiUser(user), parsed.data.mensaje, parsed.data.conversacionId) } as ApiResponse;
});

aiRoutes.get('/turnos/:id', ({ user, params, query, set }: any) => {
  const result = readTurn(user.id, params.id, Number(query?.desde) || 0);
  if (!result) {
    set.status = 404;
    return { success: false, error: 'Turno no encontrado o expirado' } as ApiResponse;
  }
  return { success: true, data: { eventos: result.events, siguiente: result.next, terminado: result.finished } } as ApiResponse;
});

export default aiRoutes;
