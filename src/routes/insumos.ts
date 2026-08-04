import { Elysia, t } from 'elysia';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, InsumoApicola } from '../types/apicola';
import { InsumoApicola as PrismaInsumoApicola } from '../generated/prisma/client';
import prisma from '../prisma/client';
import { CategoriaInsumo, EstadoStock } from '../generated/prisma/client';
import { z } from 'zod';
import { validateInventorySource } from '../services/inventoryPolicy';

// Esquemas de validación con Zod
const createInsumoSchema = z.object({
  catalogoItemId: z.string().trim().optional(),
  esPersonalizado: z.boolean().default(false),
  nombre: z.string().trim().min(2, 'Nombre es requerido').max(120),
  categoria: z.enum([
    'cajas_colmena', 'cajas_nucleo', 'marcos', 'alzas', 'techos', 'bases', 'pisos', 'excluidores_reina',
    'alimentadores', 'tratamientos', 'equipos_proteccion',
    'herramientas', 'equipos_extraccion', 'envases', 'alimentacion', 'cria_reinas', 'sanidad_bioseguridad',
    'medicion', 'transporte', 'procesamiento_cera', 'procesamiento_polen', 'procesamiento_propoleo',
    'materiales_construccion', 'otros'
  ]),
  tipoItem: z.enum(['insumo', 'activo']).default('insumo'),
  estadoActivo: z.enum(['disponible', 'en_uso', 'mantenimiento', 'retirado']).optional(),
  codigoInterno: z.string().trim().max(80).optional(),
  descripcion: z.string().optional(),
  cantidadActual: z.number().min(0, 'Cantidad actual debe ser mayor o igual a 0'),
  cantidadMinima: z.number().min(0, 'Cantidad mínima debe ser mayor o igual a 0'),
  unidad: z.string().min(1, 'Unidad es requerida'),
  precioUnitario: z.number().min(0, 'Precio unitario debe ser mayor o igual a 0').optional(),
  valorMercado: z.number().min(0, 'Valor de mercado debe ser mayor o igual a 0').optional(),
  ubicacion: z.string().optional(),
  fechaCaducidad: z.string().datetime().optional(),
  lote: z.string().optional(),
  proveedor: z.string().optional(),
  notas: z.string().optional()
});

const updateInsumoSchema = createInsumoSchema.partial();

const movimientoSchema = z.object({
  tipo: z.enum(['entrada', 'salida', 'ajuste']),
  cantidad: z.number().finite().min(0),
  motivo: z.string().trim().min(2, 'Indica el motivo del movimiento').max(240)
}).superRefine((data, ctx) => {
  if (data.tipo !== 'ajuste' && data.cantidad <= 0) ctx.addIssue({ code: 'custom', message: 'La cantidad debe ser mayor que cero', path: ['cantidad'] });
});

const queryParamsSchema = z.object({
  page: z.string().transform(val => parseInt(val)).refine(val => val > 0, 'Página debe ser mayor a 0').optional(),
  limit: z.string().transform(val => parseInt(val)).refine(val => val > 0 && val <= 100, 'Límite debe estar entre 1 y 100').optional(),
  categoria: z.string().optional(),
  search: z.string().optional()
});

const insumosRoutes = new Elysia({ prefix: '/insumos' });

// Catálogo maestro: nombres, categorías y unidades estandarizadas por el sistema
insumosRoutes.get('/catalogo', async ({ headers }) => {
  await authenticateToken({ headers });
  const items = await prisma.catalogoItemInventario.findMany({ where: { activo: true }, orderBy: [{ tipoItem: 'asc' }, { nombre: 'asc' }] });
  return { success: true, data: items } as ApiResponse;
});

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

    const where: any = { usuarioId: userId, anuladoAt: null };

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
        usuarioId: userId,
        anuladoAt: null
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
    const sourceError = validateInventorySource(insumoData);
    if (sourceError) return { success: false, error: sourceError } as ApiResponse;
    if ((insumoData.precioUnitario || 0) <= 0 && (insumoData.valorMercado || 0) <= 0) {
      return { success: false, error: 'Registra el precio de compra o el valor de mercado' } as ApiResponse;
    }
    const catalogItem = insumoData.catalogoItemId
      ? await prisma.catalogoItemInventario.findFirst({ where: { id: insumoData.catalogoItemId, activo: true } })
      : null;
    if (!insumoData.esPersonalizado && !catalogItem) return { success: false, error: 'El artículo seleccionado no pertenece al catálogo activo' } as ApiResponse;

    const nuevoInsumo = await prisma.insumoApicola.create({
      data: {
        nombre: catalogItem?.nombre ?? insumoData.nombre.trim(),
        categoria: catalogItem?.categoria ?? insumoData.categoria,
        descripcion: insumoData.descripcion,
        cantidadActual: insumoData.cantidadActual,
        cantidadMinima: insumoData.cantidadMinima,
        unidad: catalogItem?.unidad ?? insumoData.unidad.trim(),
        precioUnitario: insumoData.precioUnitario,
        valorMercado: insumoData.valorMercado,
        ubicacion: insumoData.ubicacion,
        fechaCaducidad: insumoData.fechaCaducidad ? new Date(insumoData.fechaCaducidad) : null,
        lote: insumoData.lote,
        proveedor: insumoData.proveedor,
        notas: insumoData.notas,
        usuarioId: userId,
        tipoItem: catalogItem?.tipoItem ?? insumoData.tipoItem,
        estadoActivo: (catalogItem?.tipoItem ?? insumoData.tipoItem) === 'activo' ? (insumoData.estadoActivo || 'disponible') : null,
        codigoInterno: insumoData.codigoInterno,
        catalogoItemId: catalogItem?.id ?? null
      }
    });

    if (nuevoInsumo.cantidadActual > 0) {
      await prisma.movimientoInventario.create({
        data: { insumoId: nuevoInsumo.id, tipo: 'entrada', cantidad: nuevoInsumo.cantidadActual, cantidadAnterior: 0, cantidadNueva: nuevoInsumo.cantidadActual, motivo: 'Cantidad inicial', registradoPorId: userId }
      });
    }

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
    if (insumoData.esPersonalizado !== undefined) {
      const sourceError = validateInventorySource(insumoData);
      if (sourceError) return { success: false, error: sourceError } as ApiResponse;
    }
    const catalogItem = insumoData.catalogoItemId
      ? await prisma.catalogoItemInventario.findFirst({ where: { id: insumoData.catalogoItemId, activo: true } })
      : null;
    if (insumoData.catalogoItemId && !catalogItem) return { success: false, error: 'El artículo seleccionado no pertenece al catálogo activo' } as ApiResponse;
    if (insumoData.precioUnitario !== undefined && insumoData.valorMercado !== undefined && insumoData.precioUnitario <= 0 && insumoData.valorMercado <= 0) {
      return { success: false, error: 'Registra el precio de compra o el valor de mercado' } as ApiResponse;
    }

    const insumoActualizado = await prisma.insumoApicola.updateMany({
      where: {
        id,
        usuarioId: userId,
        anuladoAt: null
      },
      data: {
        nombre: catalogItem?.nombre ?? insumoData.nombre,
        categoria: catalogItem?.categoria ?? insumoData.categoria,
        descripcion: insumoData.descripcion,
        cantidadMinima: insumoData.cantidadMinima,
        unidad: catalogItem?.unidad ?? insumoData.unidad,
        precioUnitario: insumoData.precioUnitario,
        valorMercado: insumoData.valorMercado,
        ubicacion: insumoData.ubicacion,
        fechaCaducidad: insumoData.fechaCaducidad ? new Date(insumoData.fechaCaducidad) : null,
        lote: insumoData.lote,
        proveedor: insumoData.proveedor,
        notas: insumoData.notas,
        tipoItem: catalogItem?.tipoItem ?? insumoData.tipoItem,
        estadoActivo: (catalogItem?.tipoItem ?? insumoData.tipoItem) === 'activo' ? (insumoData.estadoActivo || 'disponible') : null,
        codigoInterno: insumoData.codigoInterno,
        catalogoItemId: insumoData.esPersonalizado === true ? null : catalogItem?.id
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

// POST /insumos/:id/movimientos - Entrada, salida o corrección auditable
insumosRoutes.post('/:id/movimientos', async ({ params, body, headers, set }) => {
  const user = await authenticateToken({ headers });
  const parsed = movimientoSchema.safeParse(body);
  if (!parsed.success) {
    set.status = 400;
    return { success: false, error: parsed.error.issues[0]?.message || 'Movimiento inválido' } as ApiResponse;
  }

  const item = await prisma.insumoApicola.findFirst({
    where: { id: params.id, usuarioId: user.id, anuladoAt: null }
  });
  if (!item) {
    set.status = 404;
    return { success: false, error: 'Artículo no encontrado' } as ApiResponse;
  }

  const previous = item.cantidadActual;
  const next = parsed.data.tipo === 'entrada'
    ? previous + parsed.data.cantidad
    : parsed.data.tipo === 'salida'
      ? previous - parsed.data.cantidad
      : parsed.data.cantidad;

  if (next < 0) {
    set.status = 409;
    return { success: false, error: `Solo hay ${previous} ${item.unidad} disponibles` } as ApiResponse;
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.insumoApicola.update({
      where: { id: item.id },
      data: { cantidadActual: next, estadoStock: calcularEstadoStock(next, item.cantidadMinima) }
    });
    const movement = await tx.movimientoInventario.create({
      data: { insumoId: item.id, tipo: parsed.data.tipo, cantidad: parsed.data.cantidad, cantidadAnterior: previous, cantidadNueva: next, motivo: parsed.data.motivo, registradoPorId: user.id }
    });
    return { updated, movement };
  });

  set.status = 201;
  return { success: true, data: { item: result.updated, movimiento: result.movement }, message: 'Movimiento registrado' } as ApiResponse;
});

insumosRoutes.get('/:id/movimientos', async ({ params, headers, set }) => {
  const user = await authenticateToken({ headers });
  const item = await prisma.insumoApicola.findFirst({ where: { id: params.id, usuarioId: user.id } });
  if (!item) {
    set.status = 404;
    return { success: false, error: 'Artículo no encontrado' } as ApiResponse;
  }
  const movements = await prisma.movimientoInventario.findMany({ where: { insumoId: item.id }, orderBy: { fecha: 'desc' } });
  return { success: true, data: movements } as ApiResponse;
});

// DELETE /insumos/:id - Baja lógica del artículo
insumosRoutes.delete('/:id', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;
    const { id } = params;

    // Verificar que el insumo existe y pertenece al usuario
    const insumoExistente = await prisma.insumoApicola.findFirst({
      where: {
        id,
        usuarioId: userId,
        anuladoAt: null
      }
    });

    if (!insumoExistente) {
      return {
        success: false,
        error: 'Insumo no encontrado o no autorizado'
      } as ApiResponse;
    }

    await prisma.insumoApicola.update({
      where: { id },
      data: { anuladoAt: new Date(), anuladoPorId: userId, motivoAnulacion: 'Dado de baja desde inventario' }
    });

    return {
      success: true,
      message: 'Artículo dado de baja; su historial se conserva'
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
      where: { usuarioId: userId, anuladoAt: null },
      select: {
        categoria: true,
        cantidadActual: true,
        cantidadMinima: true,
        precioUnitario: true
        ,valorMercado: true
      }
    });

    const stats = {
      totalInsumos: insumos.length,
      categorias: {} as Record<string, number>,
      valorTotal: 0,
      stockBajo: 0,
      stockAgotado: 0
    };

    insumos.forEach((insumo: Pick<PrismaInsumoApicola, 'categoria' | 'cantidadActual' | 'cantidadMinima' | 'precioUnitario' | 'valorMercado'>) => {
      // Contar por categoría
      stats.categorias[insumo.categoria] = (stats.categorias[insumo.categoria] || 0) + 1;

      // Calcular valor total
      const unitValue = insumo.valorMercado || insumo.precioUnitario;
      if (unitValue) {
        stats.valorTotal += insumo.cantidadActual * unitValue;
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
