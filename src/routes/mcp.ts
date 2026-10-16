import { Elysia } from 'elysia';
import { authenticateToken } from '../middleware/auth';
import { AuthenticationError } from '../middleware/authorization';
import { handleMcpRequest } from '../mcp/server';

/**
 * MCP v2 — `POST /api/v1/mcp/v2` (Streamable HTTP). Se autentica con el mismo JWT de la API:
 *   Authorization: Bearer <token>
 * El rol del token decide qué herramientas y skills ve el cliente.
 */
const mcpRoutes = new Elysia({ prefix: '/mcp' });

mcpRoutes.all('/v2', async ({ request, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    return await handleMcpRequest(request, { userId: user.id, rol: user.rol });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json(
        { jsonrpc: '2.0', error: { code: -32001, message: error.message }, id: null },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="apigestion-mcp"' } },
      );
    }
    console.error('MCP error:', error);
    return Response.json({ jsonrpc: '2.0', error: { code: -32603, message: 'Error interno' }, id: null }, { status: 500 });
  }
});

export default mcpRoutes;
