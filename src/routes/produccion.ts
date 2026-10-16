import { Elysia, t } from 'elysia';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, Produccion } from '../types/apicola';
import { sql, insert, updateById, idList, type Row } from '../db';

// Equivalente a include: { colmena: {id, nombre}, apiario: {id, nombre} }
async function withNames(producciones: Row[]): Promise<Row[]> {
  if (!producciones.length) return [];
  const [colmenas, apiarios] = await Promise.all([
    sql`SELECT id, nombre FROM colmenas WHERE id = ANY(${sql.array([...new Set(idList(producciones, 'colmenaId'))], 'TEXT')})`,
    sql`SELECT id, nombre FROM apiarios WHERE id = ANY(${sql.array([...new Set(idList(producciones, 'apiarioId'))], 'TEXT')})`,
  ]);
  const colmenaById = new Map(colmenas.map((c: Row) => [c.id, c]));
  const apiarioById = new Map(apiarios.map((a: Row) => [a.id, a]));
  return producciones.map((p) => ({ ...p, colmena: colmenaById.get(p.colmenaId) ?? null, apiario: apiarioById.get(p.apiarioId) ?? null }));
}
import { z } from 'zod';

// Esquemas de validación con Zod
const createProduccionSchema = z.object({
  fecha: z.string().datetime(),
  tipoProducto: z.enum([
    'miel', 'cera', 'propoleo', 'polen', 'jalea_real', 'otros'
  ]),
  cantidad: z.number().min(0, 'Cantidad debe ser mayor o igual a 0'),
  unidad: z.string().min(1, 'Unidad es requerida'),
  calidad: z.string().optional(),
  lote: z.string().optional(),
  destino: z.string().optional(),
  observaciones: z.string().optional(),
  colmenaId: z.string().min(1, 'Colmena es requerida'),
  apiarioId: z.string().min(1, 'Apiario es requerido')
});

const updateProduccionSchema = createProduccionSchema.partial();

const queryParamsSchema = z.object({
  page: z.string().transform(val => parseInt(val)).refine(val => val > 0, 'Página debe ser mayor a 0').optional(),
  limit: z.string().transform(val => parseInt(val)).refine(val => val > 0 && val <= 100, 'Límite debe estar entre 1 y 100').optional(),
  colmenaId: z.string().optional(),
  apiarioId: z.string().optional(),
  tipoProducto: z.string().optional(),
  fechaDesde: z.string().datetime().optional(),
  fechaHasta: z.string().datetime().optional()
});

const produccionRoutes = new Elysia({ prefix: '/produccion' });

// GET /produccion - Listar producciones del usuario con filtros y paginación
produccionRoutes.get('/', async ({ headers, query }) => {
  try {
    // Validar parámetros de consulta
    const validatedQuery = queryParamsSchema.safeParse(query);
    if (!validatedQuery.success) {
      return {
        success: false,
        error: 'Parámetros de consulta inválidos',
        data: validatedQuery.error.issues
      } as ApiResponse;
    }

    const user = await authenticateToken({ headers });
    const userId = user?.id;

    const { page = 1, limit = 50, colmenaId, apiarioId, tipoProducto, fechaDesde, fechaHasta } = validatedQuery.data;

    const filters = sql`"usuarioId" = ${userId}
      ${colmenaId ? sql`AND "colmenaId" = ${colmenaId}` : sql``}
      ${apiarioId ? sql`AND "apiarioId" = ${apiarioId}` : sql``}
      ${tipoProducto ? sql`AND "tipoProducto" = ${tipoProducto}` : sql``}
      ${fechaDesde ? sql`AND fecha >= ${new Date(fechaDesde)}` : sql``}
      ${fechaHasta ? sql`AND fecha <= ${new Date(fechaHasta)}` : sql``}`;

    const [rows, [{ n: total }]] = await Promise.all([
      sql`SELECT * FROM producciones WHERE ${filters} ORDER BY fecha DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      sql`SELECT count(*)::int AS n FROM producciones WHERE ${filters}`,
    ]);
    const producciones = await withNames(rows);

    return {
      success: true,
      data: producciones,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      message: 'Producciones obtenidas exitosamente'
    } as unknown as ApiResponse<Produccion[]>;
  } catch (error: any) {
    console.error('Get producciones error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// GET /produccion/:id - Obtener producción específica
produccionRoutes.get('/:id', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;
    const { id } = params;

    const [produccion] = await withNames(await sql`SELECT * FROM producciones WHERE id = ${id} AND "usuarioId" = ${userId} LIMIT 1`);

    if (!produccion) {
      return {
        success: false,
        error: 'Producción no encontrada'
      } as ApiResponse;
    }

    return {
      success: true,
      data: produccion,
      message: 'Producción obtenida exitosamente'
    } as unknown as ApiResponse<Produccion>;
  } catch (error: any) {
    console.error('Get produccion error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// POST /produccion - Crear nueva producción
produccionRoutes.post('/', async ({ body, headers }) => {
  try {
    // Validar datos de entrada
    const validatedBody = createProduccionSchema.safeParse(body);
    if (!validatedBody.success) {
      return {
        success: false,
        error: 'Datos de entrada inválidos',
        data: validatedBody.error.issues
      } as ApiResponse;
    }

    const user = await authenticateToken({ headers });
    const userId = user?.id;

    const produccionData = validatedBody.data;

    // Verificar que la colmena y apiario pertenecen al usuario
    const [colmena] = await sql`SELECT * FROM colmenas WHERE id = ${produccionData.colmenaId} AND "usuarioId" = ${userId} LIMIT 1`;

    if (!colmena) {
      return {
        success: false,
        error: 'Colmena no encontrada o no autorizada'
      } as ApiResponse;
    }

    const [apiario] = await sql`SELECT * FROM apiarios WHERE id = ${produccionData.apiarioId} AND "usuarioId" = ${userId} LIMIT 1`;

    if (!apiario) {
      return {
        success: false,
        error: 'Apiario no encontrado o no autorizado'
      } as ApiResponse;
    }

    const [nuevaProduccion] = await withNames([await insert('producciones', {
      fecha: new Date(produccionData.fecha),
      tipoProducto: produccionData.tipoProducto,
      cantidad: produccionData.cantidad,
      unidad: produccionData.unidad,
      calidad: produccionData.calidad,
      lote: produccionData.lote,
      destino: produccionData.destino,
      observaciones: produccionData.observaciones,
      usuarioId: userId,
      colmenaId: produccionData.colmenaId,
      apiarioId: produccionData.apiarioId
    })]);

    // Registrar actividad de producción
    try {
      await insert('actividades', {
        tipo: 'produccion',
        titulo: 'Cosecha registrada',
        descripcion: `Cosecha registrada: ${produccionData.cantidad} ${produccionData.unidad} de ${produccionData.tipoProducto}`,
        entidadTipo: 'colmena',
        entidadId: produccionData.colmenaId,
        entidadNombre: colmena.nombre,
        estado: 'success',
        usuarioId: userId
      });
    } catch (activityError) {
      console.error('Error registrando actividad de producción:', activityError);
    }

    return {
      success: true,
      data: nuevaProduccion,
      message: 'Producción creada exitosamente'
    } as unknown as ApiResponse<Produccion>;
  } catch (error: any) {
    console.error('Create produccion error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// PUT /produccion/:id - Actualizar producción
produccionRoutes.put('/:id', async ({ params, body, headers }) => {
  try {
    // Validar datos de entrada
    const validatedBody = updateProduccionSchema.safeParse(body);
    if (!validatedBody.success) {
      return {
        success: false,
        error: 'Datos de entrada inválidos',
        data: validatedBody.error.issues
      } as ApiResponse;
    }

    const user = await authenticateToken({ headers });
    const userId = user?.id;
    const { id } = params;

    const produccionData = validatedBody.data;

    // Verificar que la producción existe y pertenece al usuario
    const [produccionExistente] = await sql`SELECT id FROM producciones WHERE id = ${id} AND "usuarioId" = ${userId} LIMIT 1`;

    if (!produccionExistente) {
      return {
        success: false,
        error: 'Producción no encontrada o no autorizada'
      } as ApiResponse;
    }

    // Si se están cambiando colmena o apiario, verificar permisos
    if (produccionData.colmenaId) {
      const [colmena] = await sql`SELECT id FROM colmenas WHERE id = ${produccionData.colmenaId} AND "usuarioId" = ${userId} LIMIT 1`;
      if (!colmena) {
        return {
          success: false,
          error: 'Colmena no encontrada o no autorizada'
        } as ApiResponse;
      }
    }

    if (produccionData.apiarioId) {
      const [apiario] = await sql`SELECT id FROM apiarios WHERE id = ${produccionData.apiarioId} AND "usuarioId" = ${userId} LIMIT 1`;
      if (!apiario) {
        return {
          success: false,
          error: 'Apiario no encontrado o no autorizado'
        } as ApiResponse;
      }
    }

    const [produccionActualizada] = await withNames([(await updateById('producciones', id, {
      fecha: produccionData.fecha ? new Date(produccionData.fecha) : undefined,
      tipoProducto: produccionData.tipoProducto,
      cantidad: produccionData.cantidad,
      unidad: produccionData.unidad,
      calidad: produccionData.calidad,
      lote: produccionData.lote,
      destino: produccionData.destino,
      observaciones: produccionData.observaciones,
      colmenaId: produccionData.colmenaId,
      apiarioId: produccionData.apiarioId
    }))!]);

    return {
      success: true,
      data: produccionActualizada,
      message: 'Producción actualizada exitosamente'
    } as unknown as ApiResponse<Produccion>;
  } catch (error: any) {
    console.error('Update produccion error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// DELETE /produccion/:id - Eliminar producción
produccionRoutes.delete('/:id', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;
    const { id } = params;

    // Verificar que la producción existe y pertenece al usuario
    const [produccionExistente] = await sql`SELECT id FROM producciones WHERE id = ${id} AND "usuarioId" = ${userId} LIMIT 1`;

    if (!produccionExistente) {
      return {
        success: false,
        error: 'Producción no encontrada o no autorizada'
      } as ApiResponse;
    }

    await sql`DELETE FROM producciones WHERE id = ${id}`;

    return {
      success: true,
      message: 'Producción eliminada exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Delete produccion error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

export default produccionRoutes;