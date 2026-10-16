import { chat, isConversationId, type AiUser, type ChatEvent } from './hive';

/**
 * Turnos en segundo plano con eventos consultables por polling.
 *
 * El streaming SSE depende de que cada proxy intermedio (Traefik/HTTP2, CDN) lo respete; las consultas cortas
 * funcionan siempre. El turno corre en el servidor (no atado a la conexión del navegador) y el cliente pide
 * `GET /ai/turnos/:id?desde=n` cada ~700 ms para narrar el progreso en vivo.
 */

interface Turn {
  userId: string;
  events: ChatEvent[];
  finished: boolean;
  touchedAt: number;
}

const TTL_MS = 10 * 60_000;
const turns = new Map<string, Turn>();

function sweep() {
  const now = Date.now();
  for (const [id, t] of turns) if (now - t.touchedAt > TTL_MS) turns.delete(id);
}

export function startTurn(user: AiUser, message: string, conversationId?: string) {
  sweep();
  const conv = isConversationId(conversationId) ? conversationId : crypto.randomUUID();
  const id = crypto.randomUUID();
  const turn: Turn = { userId: user.id, events: [], finished: false, touchedAt: Date.now() };
  turns.set(id, turn);

  void (async () => {
    try {
      for await (const event of chat(user, message, conv)) {
        // Los tokens sueltos no se acumulan: el cliente recibe la respuesta completa en `done`.
        if (event.type !== 'token') turn.events.push(event);
        turn.touchedAt = Date.now();
      }
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'UNAVAILABLE';
      turn.events.push({ type: 'error', error: (error as Error).message, codigo: code } as unknown as ChatEvent);
    } finally {
      turn.finished = true;
      turn.touchedAt = Date.now();
    }
  })();

  return { turnId: id, conversationId: conv };
}

/** Eventos del turno desde el índice `from`; solo el dueño puede leerlo. */
export function readTurn(userId: string, turnId: string, from = 0) {
  const turn = turns.get(turnId);
  if (!turn || turn.userId !== userId) return null;
  turn.touchedAt = Date.now();
  const start = Math.max(0, Math.min(from, turn.events.length));
  return { events: turn.events.slice(start), next: turn.events.length, finished: turn.finished };
}
