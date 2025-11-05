import { Elysia } from 'elysia';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, Apiario } from '../types/apicola';
import prisma from '../prisma/client';

// Zod schemas for validation
const createApiarioSchema = z.object({
  nombre: z.string().min(1, 'Nombre es requerido'),
  ciudad: z.string().min(1, 'Ciudad es requerida'),
  pais: z.string().min(1, 'País es requerido'),
  direccion: z.string().min(1, 'Dirección es requerida'),
  comoLlegar: z.string().optional(),
  imagenApiario: z.string().optional()
});

const updateApiarioSchema = z.object({
  nombre: z.string().min(1, 'Nombre es requerido').optional(),
  ciudad: z.string().min(1, 'Ciudad es requerida').optional(),
  pais: z.string().min(1, 'País es requerido').optional(),
  direccion: z.string().min(1, 'Dirección es requerida').optional(),
  comoLlegar: z.string().optional(),
  imagenApiario: z.string().optional()
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
      apiarios = await prisma.apiario.findMany({
        include: {
          colmenas: true
        }
      });
    } else {
      // Apicultor can see their own apiarios OR apiarios that have their colmenas
      apiarios = await prisma.apiario.findMany({
        where: {
          OR: [
            { usuarioId: userId },
            {
              colmenas: {
                some: {
                  usuarioId: userId
                }
              }
            }
          ]
        },
        include: {
          colmenas: {
            where: {
              usuarioId: userId
            }
          }
        }
      });
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
      apiario = await prisma.apiario.findUnique({
        where: { id: id },
        include: {
          colmenas: true
        }
      });
    } else {
      apiario = await prisma.apiario.findFirst({
        where: {
          id: id,
          OR: [
            { usuarioId: userId },
            {
              colmenas: {
                some: {
                  usuarioId: userId
                }
              }
            }
          ]
        },
        include: {
          colmenas: {
            where: {
              usuarioId: userId
            }
          }
        }
      });
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

    const newApiario = await prisma.apiario.create({
      data: {
        ...validatedData,
        usuarioId: userId
      }
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
    const apiario = await prisma.apiario.findUnique({
      where: { id: id }
    });

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

    const updatedApiario = await prisma.apiario.update({
      where: { id: id },
      data: validatedData
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
    if (error.code === 'P2025') {
      return {
        success: false,
        error: 'Apiario no encontrado'
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
    const apiario = await prisma.apiario.findUnique({
      where: { id: id },
      include: {
        colmenas: true
      }
    });

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

    await prisma.apiario.delete({
      where: { id: id }
    });

    return {
      success: true,
      message: 'Apiario eliminado exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Delete apiario error:', error);
    if (error.code === 'P2025') {
      return {
        success: false,
        error: 'Apiario no encontrado'
      } as ApiResponse;
    }
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

export default apiariosRoutes;