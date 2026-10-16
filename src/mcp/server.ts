import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { runTool, toolsFor, type DataTool, type ToolContext } from '../ai/tools';
import { SKILLS } from '../ai/swarm';

/**
 * Servidor MCP v2 de ApiGestión (Streamable HTTP, sin estado).
 *
 *  - tools/*   → las herramientas de datos de `ai/tools.ts` que corresponden al rol del usuario.
 *  - prompts/* → las skills de ese rol, como recetas listas para el agente cliente.
 *
 * Lo comparten el agente en proceso y cualquier cliente MCP externo (Claude Desktop, IDEs, n8n…):
 * ambos pasan por `runTool`, así que la barrera de rol y el filtro por usuario son los mismos.
 * Todo es de solo lectura (`readOnlyHint`).
 */

export const MCP_SERVER_INFO = { name: 'apigestion-mcp', version: '2.0.0' } as const;

export interface McpDeps {
  tools: (rol: ToolContext['rol']) => DataTool[];
  run: (ctx: ToolContext, name: string, args: unknown) => Promise<unknown>;
  skills: typeof SKILLS;
}

const defaultDeps: McpDeps = { tools: toolsFor, run: runTool, skills: SKILLS };

const MAX_BODY_BYTES = 64 * 1024;

function buildServer(ctx: ToolContext, deps: McpDeps): Server {
  const server = new Server(MCP_SERVER_INFO, {
    capabilities: { tools: {}, prompts: {} },
    instructions:
      'Herramientas de SOLO LECTURA sobre los datos apícolas del usuario autenticado. ' +
      'Empieza por apiario_resumen_general (apicultor) o admin_metricas_plataforma (administrador).',
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: deps.tools(ctx.rol).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters as { type: 'object'; properties: Record<string, object>; required?: string[] },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await deps.run(ctx, name, args ?? {});
    const isError = typeof result === 'object' && result !== null && 'error' in result && Object.keys(result).length === 1;
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError };
  });

  const mySkills = () => deps.skills.filter((s) => s.audience === ctx.rol);

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: mySkills().map((s) => ({ name: s.name, description: s.description })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const skill = mySkills().find((s) => s.name === request.params.name);
    if (!skill) throw new Error(`Skill desconocida: ${request.params.name}`);
    const steps = skill.steps.map((s, i) => `${i + 1}. ${s.action}: ${s.instruction}`).join('\n');
    return {
      description: skill.description,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `${skill.description}\n\nSigue estos pasos usando las herramientas del servidor (${(skill.tools ?? []).join(', ')}):\n${steps}`,
          },
        },
      ],
    };
  });

  return server;
}

/** Atiende UNA petición MCP para un usuario ya autenticado. */
export async function handleMcpRequest(request: Request, ctx: ToolContext, deps: McpDeps = defaultDeps): Promise<Response> {
  if (request.method === 'POST') {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) {
      return Response.json({ jsonrpc: '2.0', error: { code: -32600, message: 'Petición demasiado grande' }, id: null }, { status: 413 });
    }
  }

  // Sin estado: un servidor y un transporte por petición; nada se comparte entre usuarios.
  const server = buildServer(ctx, deps);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // La respuesta ya es JSON completo (enableJsonResponse): se puede soltar el servidor.
    queueMicrotask(() => void server.close().catch(() => {}));
  }
}
