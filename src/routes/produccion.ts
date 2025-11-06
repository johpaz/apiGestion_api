import { Elysia, t } from 'elysia';
import { authenticateToken } from '../middleware/auth.js';
import type { ApiResponse, Produccion } from '../types/apicola.js';
import prisma from '../prisma/client.js';
import { TipoProducto } from '../generated/prisma/enums';
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

    const where: any = { usuarioId: userId };

    if (colmenaId) {
      where.colmenaId = colmenaId;
    }

    if (apiarioId) {
      where.apiarioId = apiarioId;
    }

    if (tipoProducto) {
      where.tipoProducto = tipoProducto as TipoProducto;
    }

    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) {
        where.fecha.gte = new Date(fechaDesde);
      }
      if (fechaHasta) {
        where.fecha.lte = new Date(fechaHasta);
      }
    }

    const [producciones, total] = await Promise.all([
      prisma.produccion.findMany({
        where,
        include: {
          colmena: {
            select: { id: true, nombre: true }
          },
          apiario: {
            select: { id: true, nombre: true }
          }
        },
        orderBy: { fecha: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.produccion.count({ where })
    ]);

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
    } as ApiResponse<Produccion[]>;
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

    const produccion = await prisma.produccion.findFirst({
      where: {
        id,
        usuarioId: userId
      },
      include: {
        colmena: {
          select: { id: true, nombre: true }
        },
        apiario: {
          select: { id: true, nombre: true }
        }
      }
    });

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
    } as ApiResponse<Produccion>;
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
    const colmena = await prisma.colmena.findFirst({
      where: {
        id: produccionData.colmenaId,
        usuarioId: userId
      }
    });

    if (!colmena) {
      return {
        success: false,
        error: 'Colmena no encontrada o no autorizada'
      } as ApiResponse;
    }

    const apiario = await prisma.apiario.findFirst({
      where: {
        id: produccionData.apiarioId,
        usuarioId: userId
      }
    });

    if (!apiario) {
      return {
        success: false,
        error: 'Apiario no encontrado o no autorizado'
      } as ApiResponse;
    }

    const nuevaProduccion = await prisma.produccion.create({
      data: {
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
      },
      include: {
        colmena: {
          select: { id: true, nombre: true }
        },
        apiario: {
          select: { id: true, nombre: true }
        }
      }
    });

    // Registrar actividad de producción
    try {
      await prisma.actividad.create({
        data: {
          tipo: 'produccion',
          titulo: 'Cosecha registrada',
          descripcion: `Cosecha registrada: ${produccionData.cantidad} ${produccionData.unidad} de ${produccionData.tipoProducto}`,
          entidadTipo: 'colmena',
          entidadId: produccionData.colmenaId,
          entidadNombre: colmena.nombre,
          estado: 'success',
          usuarioId: userId
        }
      });
    } catch (activityError) {
      console.error('Error registrando actividad de producción:', activityError);
    }

    return {
      success: true,
      data: nuevaProduccion,
      message: 'Producción creada exitosamente'
    } as ApiResponse<Produccion>;
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
    const produccionExistente = await prisma.produccion.findFirst({
      where: {
        id,
        usuarioId: userId
      }
    });

    if (!produccionExistente) {
      return {
        success: false,
        error: 'Producción no encontrada o no autorizada'
      } as ApiResponse;
    }

    // Si se están cambiando colmena o apiario, verificar permisos
    if (produccionData.colmenaId) {
      const colmena = await prisma.colmena.findFirst({
        where: {
          id: produccionData.colmenaId,
          usuarioId: userId
        }
      });
      if (!colmena) {
        return {
          success: false,
          error: 'Colmena no encontrada o no autorizada'
        } as ApiResponse;
      }
    }

    if (produccionData.apiarioId) {
      const apiario = await prisma.apiario.findFirst({
        where: {
          id: produccionData.apiarioId,
          usuarioId: userId
        }
      });
      if (!apiario) {
        return {
          success: false,
          error: 'Apiario no encontrado o no autorizado'
        } as ApiResponse;
      }
    }

    const produccionActualizada = await prisma.produccion.update({
      where: { id },
      data: {
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
      },
      include: {
        colmena: {
          select: { id: true, nombre: true }
        },
        apiario: {
          select: { id: true, nombre: true }
        }
      }
    });

    return {
      success: true,
      data: produccionActualizada,
      message: 'Producción actualizada exitosamente'
    } as ApiResponse<Produccion>;
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
    const produccionExistente = await prisma.produccion.findFirst({
      where: {
        id,
        usuarioId: userId
      }
    });

    if (!produccionExistente) {
      return {
        success: false,
        error: 'Producción no encontrada o no autorizada'
      } as ApiResponse;
    }

    const produccionEliminada = await prisma.produccion.delete({
      where: { id }
    });

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