import { Elysia, t } from 'elysia';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, InsumoApicola } from '../types/apicola';
import { InsumoApicola as PrismaInsumoApicola } from '../generated/prisma/client';
import prisma from '../prisma/client';
import { CategoriaInsumo, EstadoStock } from '../generated/prisma/client';
import { z } from 'zod';

// Esquemas de validación con Zod
const createInsumoSchema = z.object({
  nombre: z.string().min(1, 'Nombre es requerido'),
  categoria: z.enum([
    'marcos', 'alzas', 'techos', 'pisos', 'excluidores_reina',
    'alimentadores', 'tratamientos', 'equipos_proteccion',
    'herramientas', 'materiales_construccion', 'otros'
  ]),
  descripcion: z.string().optional(),
  cantidadActual: z.number().min(0, 'Cantidad actual debe ser mayor o igual a 0'),
  cantidadMinima: z.number().min(0, 'Cantidad mínima debe ser mayor o igual a 0'),
  unidad: z.string().min(1, 'Unidad es requerida'),
  precioUnitario: z.number().min(0, 'Precio unitario debe ser mayor o igual a 0').optional(),
  ubicacion: z.string().optional(),
  fechaCaducidad: z.string().datetime().optional(),
  lote: z.string().optional(),
  proveedor: z.string().optional(),
  notas: z.string().optional()
});

const updateInsumoSchema = createInsumoSchema.partial();

const queryParamsSchema = z.object({
  page: z.string().transform(val => parseInt(val)).refine(val => val > 0, 'Página debe ser mayor a 0').optional(),
  limit: z.string().transform(val => parseInt(val)).refine(val => val > 0 && val <= 100, 'Límite debe estar entre 1 y 100').optional(),
  categoria: z.string().optional(),
  search: z.string().optional()
});

const insumosRoutes = new Elysia({ prefix: '/insumos' });

// GET /insumos - Listar insumos del usuario
insumosRoutes.get('/', async ({ headers, query }) => {
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

    const { page = 1, limit = 50, categoria, search } = validatedQuery.data;

    const where: any = { usuarioId: userId };

    if (categoria && categoria !== 'todos') {
      where.categoria = categoria as CategoriaInsumo;
    }

    if (search) {
      where.nombre = {
        contains: search,
        mode: 'insensitive'
      };
    }

    const [insumos, total] = await Promise.all([
      prisma.insumoApicola.findMany({
        where,
        orderBy: { fechaCreacion: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.insumoApicola.count({ where })
    ]);

    // Calcular porcentaje de stock para cada insumo
    const insumosConPorcentaje = insumos.map((insumo: PrismaInsumoApicola) => ({
      ...insumo,
      porcentajeStock: insumo.cantidadMinima > 0
        ? Math.min((insumo.cantidadActual / insumo.cantidadMinima) * 100, 100)
        : 100,
      estadoStock: calcularEstadoStock(insumo.cantidadActual, insumo.cantidadMinima)
    }));

    return {
      success: true,
      data: insumosConPorcentaje,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      message: 'Insumos obtenidos exitosamente'
    } as ApiResponse<InsumoApicola[]>;
  } catch (error: any) {
    console.error('Get insumos error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// GET /insumos/:id - Obtener insumo específico
insumosRoutes.get('/:id', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;
    const { id } = params;

    const insumo = await prisma.insumoApicola.findFirst({
      where: {
        id,
        usuarioId: userId
      }
    });

    if (!insumo) {
      return {
        success: false,
        error: 'Insumo no encontrado'
      } as ApiResponse;
    }

    const insumoConPorcentaje = {
      ...insumo,
      porcentajeStock: insumo.cantidadMinima > 0
        ? Math.min((insumo.cantidadActual / insumo.cantidadMinima) * 100, 100)
        : 100,
      estadoStock: calcularEstadoStock(insumo.cantidadActual, insumo.cantidadMinima)
    };

    return {
      success: true,
      data: insumoConPorcentaje,
      message: 'Insumo obtenido exitosamente'
    } as ApiResponse<InsumoApicola>;
  } catch (error: any) {
    console.error('Get insumo error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// POST /insumos - Crear nuevo insumo
insumosRoutes.post('/', async ({ body, headers }) => {
  try {
    // Validar datos de entrada
    const validatedBody = createInsumoSchema.safeParse(body);
    if (!validatedBody.success) {
      return {
        success: false,
        error: 'Datos de entrada inválidos',
        data: validatedBody.error.issues
      } as ApiResponse;
    }

    const user = await authenticateToken({ headers });
    const userId = user?.id;

    const insumoData = validatedBody.data;

    const nuevoInsumo = await prisma.insumoApicola.create({
      data: {
        nombre: insumoData.nombre,
        categoria: insumoData.categoria,
        descripcion: insumoData.descripcion,
        cantidadActual: insumoData.cantidadActual,
        cantidadMinima: insumoData.cantidadMinima,
        unidad: insumoData.unidad,
        precioUnitario: insumoData.precioUnitario,
        ubicacion: insumoData.ubicacion,
        fechaCaducidad: insumoData.fechaCaducidad ? new Date(insumoData.fechaCaducidad) : null,
        lote: insumoData.lote,
        proveedor: insumoData.proveedor,
        notas: insumoData.notas,
        usuarioId: userId
      }
    });

    const insumoConPorcentaje = {
      ...nuevoInsumo,
      porcentajeStock: nuevoInsumo.cantidadMinima > 0
        ? Math.min((nuevoInsumo.cantidadActual / nuevoInsumo.cantidadMinima) * 100, 100)
        : 100,
      estadoStock: calcularEstadoStock(nuevoInsumo.cantidadActual, nuevoInsumo.cantidadMinima)
    };

    return {
      success: true,
      data: insumoConPorcentaje,
      message: 'Insumo creado exitosamente'
    } as ApiResponse<InsumoApicola>;
  } catch (error: any) {
    console.error('Create insumo error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// PUT /insumos/:id - Actualizar insumo
insumosRoutes.put('/:id', async ({ params, body, headers }) => {
  try {
    // Validar datos de entrada
    const validatedBody = updateInsumoSchema.safeParse(body);
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

    const insumoData = validatedBody.data;

    const insumoActualizado = await prisma.insumoApicola.updateMany({
      where: {
        id,
        usuarioId: userId
      },
      data: {
        nombre: insumoData.nombre,
        categoria: insumoData.categoria,
        descripcion: insumoData.descripcion,
        cantidadActual: insumoData.cantidadActual,
        cantidadMinima: insumoData.cantidadMinima,
        unidad: insumoData.unidad,
        precioUnitario: insumoData.precioUnitario,
        ubicacion: insumoData.ubicacion,
        fechaCaducidad: insumoData.fechaCaducidad ? new Date(insumoData.fechaCaducidad) : null,
        lote: insumoData.lote,
        proveedor: insumoData.proveedor,
        notas: insumoData.notas
      }
    });

    if (insumoActualizado.count === 0) {
      return {
        success: false,
        error: 'Insumo no encontrado o no autorizado'
      } as ApiResponse;
    }

    const insumo = await prisma.insumoApicola.findUnique({
      where: { id }
    });

    const insumoConPorcentaje = {
      ...insumo,
      porcentajeStock: insumo!.cantidadMinima > 0
        ? Math.min((insumo!.cantidadActual / insumo!.cantidadMinima) * 100, 100)
        : 100,
      estadoStock: calcularEstadoStock(insumo!.cantidadActual, insumo!.cantidadMinima)
    };

    return {
      success: true,
      data: insumoConPorcentaje,
      message: 'Insumo actualizado exitosamente'
    } as ApiResponse<InsumoApicola>;
  } catch (error: any) {
    console.error('Update insumo error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// DELETE /insumos/:id - Eliminar insumo
insumosRoutes.delete('/:id', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;
    const { id } = params;

    // Verificar que el insumo existe y pertenece al usuario
    const insumoExistente = await prisma.insumoApicola.findFirst({
      where: {
        id,
        usuarioId: userId
      }
    });

    if (!insumoExistente) {
      return {
        success: false,
        error: 'Insumo no encontrado o no autorizado'
      } as ApiResponse;
    }

    const insumoEliminado = await prisma.insumoApicola.delete({
      where: { id }
    });

    return {
      success: true,
      message: 'Insumo eliminado exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Delete insumo error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// GET /insumos/stats/resumen - Estadísticas de insumos
insumosRoutes.get('/stats/resumen', async ({ headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;

    const insumos = await prisma.insumoApicola.findMany({
      where: { usuarioId: userId },
      select: {
        categoria: true,
        cantidadActual: true,
        cantidadMinima: true,
        precioUnitario: true
      }
    });

    const stats = {
      totalInsumos: insumos.length,
      categorias: {} as Record<string, number>,
      valorTotal: 0,
      stockBajo: 0,
      stockAgotado: 0
    };

    insumos.forEach((insumo: Pick<PrismaInsumoApicola, 'categoria' | 'cantidadActual' | 'cantidadMinima' | 'precioUnitario'>) => {
      // Contar por categoría
      stats.categorias[insumo.categoria] = (stats.categorias[insumo.categoria] || 0) + 1;

      // Calcular valor total
      if (insumo.precioUnitario) {
        stats.valorTotal += insumo.cantidadActual * insumo.precioUnitario;
      }

      // Contar stock bajo/agotado
      if (insumo.cantidadActual <= 0) {
        stats.stockAgotado++;
      } else if (insumo.cantidadActual < insumo.cantidadMinima) {
        stats.stockBajo++;
      }
    });

    return {
      success: true,
      data: stats,
      message: 'Estadísticas obtenidas exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Get insumos stats error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// Función auxiliar para calcular estado de stock
function calcularEstadoStock(cantidadActual: number, cantidadMinima: number): EstadoStock {
  if (cantidadActual <= 0) return EstadoStock.agotado;
  if (cantidadActual < cantidadMinima * 0.5) return EstadoStock.stock_bajo;
  if (cantidadActual < cantidadMinima) return EstadoStock.stock_medio;
  return EstadoStock.stock_bueno;
}

export default insumosRoutes;