import { Elysia } from 'elysia';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, Apiario } from '../types/apicola';
import { sql, insert, updateById, attachMany, idList } from '../db';

// Carga apiarios con sus colmenas (solo las del usuario cuando no es administrador)
async function withColmenas(apiarios: any[], onlyUserId?: string) {
  if (!apiarios.length) return [];
  const ids = sql.array(idList(apiarios), 'TEXT');
  const colmenas = onlyUserId
    ? await sql`SELECT * FROM colmenas WHERE "apiarioId" = ANY(${ids}) AND "usuarioId" = ${onlyUserId}`
    : await sql`SELECT * FROM colmenas WHERE "apiarioId" = ANY(${ids})`;
  return attachMany(apiarios, colmenas, 'apiarioId', 'colmenas');
}

// Zod schemas for validation
const createApiarioSchema = z.object({
  nombre: z.string().min(1, 'Nombre es requerido'),
  ciudad: z.string().min(1, 'Ciudad es requerida'),
  pais: z.string().min(1, 'País es requerido'),
  direccion: z.string().min(1, 'Dirección es requerida'),
  comoLlegar: z.string().optional(),
  imagenApiario: z.string().optional(),
  registroIcaNumero: z.string().trim().max(120).optional(),
  registroIcaExpedidoEn: z.string().datetime().optional(),
  registroIcaVenceEn: z.string().datetime().optional(),
  registroIcaDocumentoPath: z.string().url().optional()
});

const updateApiarioSchema = z.object({
  nombre: z.string().min(1, 'Nombre es requerido').optional(),
  ciudad: z.string().min(1, 'Ciudad es requerida').optional(),
  pais: z.string().min(1, 'País es requerido').optional(),
  direccion: z.string().min(1, 'Dirección es requerida').optional(),
  comoLlegar: z.string().optional(),
  imagenApiario: z.string().optional(),
  registroIcaNumero: z.string().trim().max(120).optional(),
  registroIcaExpedidoEn: z.string().datetime().nullable().optional(),
  registroIcaVenceEn: z.string().datetime().nullable().optional(),
  registroIcaDocumentoPath: z.string().url().nullable().optional()
});

const apiariosRoutes = new Elysia({ prefix: '/apiarios' });

// Get all apiarios for authenticated user (admin can see all, apicultor their own + those with their colmenas)
apiariosRoutes.get('/', async ({ headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;
    const userRole = user?.rol;

    let apiarios;
    if (userRole === 'administrador') {
      // Admin can see all apiarios
      apiarios = await withColmenas(await sql`SELECT * FROM apiarios`);
    } else {
      // Apicultor can see their own apiarios OR apiarios that have their colmenas
      apiarios = await withColmenas(await sql`
        SELECT a.* FROM apiarios a
        WHERE a."usuarioId" = ${userId}
           OR EXISTS (SELECT 1 FROM colmenas c WHERE c."apiarioId" = a.id AND c."usuarioId" = ${userId})`, userId);
    }

    return {
      success: true,
      data: apiarios,
      message: 'Apiarios obtenidos exitosamente'
    } as ApiResponse<Apiario[]>;
  } catch (error: any) {
    console.error('Get apiarios error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// Get single apiario by ID
apiariosRoutes.get('/:id', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const { id } = params;
    const userId = user?.id;
    const userRole = user?.rol;

    let apiario;
    if (userRole === 'administrador') {
      apiario = (await withColmenas(await sql`SELECT * FROM apiarios WHERE id = ${id}`))[0];
    } else {
      apiario = (await withColmenas(await sql`
        SELECT a.* FROM apiarios a
        WHERE a.id = ${id}
          AND (a."usuarioId" = ${userId}
            OR EXISTS (SELECT 1 FROM colmenas c WHERE c."apiarioId" = a.id AND c."usuarioId" = ${userId}))`, userId))[0];
    }

    if (!apiario) {
      return {
        success: false,
        error: 'Apiario no encontrado o no tienes acceso'
      } as ApiResponse;
    }

    return {
      success: true,
      data: apiario,
      message: 'Apiario obtenido exitosamente'
    } as ApiResponse<Apiario>;
  } catch (error: any) {
    console.error('Get apiario error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// Create new apiario (any authenticated user)
apiariosRoutes.post('/', async ({ body, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;

    const validatedData = createApiarioSchema.parse(body);

    const newApiario = await insert('apiarios', {
      ...validatedData,
      registroIcaExpedidoEn: validatedData.registroIcaExpedidoEn ? new Date(validatedData.registroIcaExpedidoEn) : undefined,
      registroIcaVenceEn: validatedData.registroIcaVenceEn ? new Date(validatedData.registroIcaVenceEn) : undefined,
      usuarioId: userId
    });

    return {
      success: true,
      data: newApiario,
      message: 'Apiario creado exitosamente'
    } as ApiResponse<Apiario>;
  } catch (error: any) {
    console.error('Create apiario error:', error);
    if (error.name === 'ZodError') {
      return {
        success: false,
        error: 'Datos de entrada inválidos',
        data: error.errors
      } as ApiResponse;
    }
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// Update apiario (owner or admin)
apiariosRoutes.put('/:id', async ({ params, body, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const { id } = params;
    const userId = user?.id;
    const userRole = user?.rol;

    // Check if user owns the apiario or is admin
    const [apiario] = await sql`SELECT * FROM apiarios WHERE id = ${id}`;

    if (!apiario) {
      return {
        success: false,
        error: 'Apiario no encontrado'
      } as ApiResponse;
    }

    if (userRole !== 'administrador' && apiario.usuarioId !== userId) {
      return {
        success: false,
        error: 'No tienes permisos para actualizar este apiario'
      } as ApiResponse;
    }

    const validatedData = updateApiarioSchema.parse(body);

    const { registroIcaExpedidoEn, registroIcaVenceEn, ...rest } = validatedData;
    const updatedApiario = await updateById('apiarios', id, {
      ...rest,
      registroIcaExpedidoEn: registroIcaExpedidoEn === null ? null : registroIcaExpedidoEn ? new Date(registroIcaExpedidoEn) : undefined,
      registroIcaVenceEn: registroIcaVenceEn === null ? null : registroIcaVenceEn ? new Date(registroIcaVenceEn) : undefined,
    });

    return {
      success: true,
      data: updatedApiario,
      message: 'Apiario actualizado exitosamente'
    } as ApiResponse<Apiario>;
  } catch (error: any) {
    console.error('Update apiario error:', error);
    if (error.name === 'ZodError') {
      return {
        success: false,
        error: 'Datos de entrada inválidos',
        data: error.errors
      } as ApiResponse;
    }
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// Delete apiario (owner or admin, and only if no colmenas associated)
apiariosRoutes.delete('/:id', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const { id } = params;
    const userId = user?.id;
    const userRole = user?.rol;

    // Check if apiario exists and user has permission
    const apiario = (await withColmenas(await sql`SELECT * FROM apiarios WHERE id = ${id}`))[0];

    if (!apiario) {
      return {
        success: false,
        error: 'Apiario no encontrado'
      } as ApiResponse;
    }

    if (userRole !== 'administrador' && apiario.usuarioId !== userId) {
      return {
        success: false,
        error: 'No tienes permisos para eliminar este apiario'
      } as ApiResponse;
    }

    if (apiario.colmenas.length > 0) {
      return {
        success: false,
        error: 'No se puede eliminar un apiario que tiene colmenas asociadas'
      } as ApiResponse;
    }

    await sql`DELETE FROM apiarios WHERE id = ${id}`;

    return {
      success: true,
      message: 'Apiario eliminado exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Delete apiario error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

export default apiariosRoutes;
