import { Elysia } from 'elysia';
import { authGuard, requireRoleGuard } from '../middleware/auth.js';
import type { ApiResponse, Usuario } from '../types/apicola.js';
import prisma from '../prisma/client.js';

const usuariosRoutes = new Elysia({ prefix: '/usuarios' })
  .use(authGuard);

// Get all users (admin only)
usuariosRoutes.get('/', async (context: any) => {
  try {
    if (!context.user || !['administrador'].includes(context.user.rol)) {
      throw new Error('No tienes permisos para acceder a este recurso');
    }

    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        colmenasAsignadas: true,
        fechaRegistro: true,
        ultimoAcceso: true
      }
    });

    return {
      success: true,
      data: usuarios,
      message: 'Usuarios obtenidos exitosamente'
    } as ApiResponse<Omit<Usuario, 'password'>[]>;
  } catch (error: any) {
    console.error('Get usuarios error:', error);
    throw new Error(error.message || 'Error interno del servidor');
  }
});

// Get user profile by userId
usuariosRoutes.get('/profile/:userId', async (context: any) => {
  try {
    const userId = context.params.userId;

    if (!userId) {
      throw new Error('ID de usuario requerido');
    }

    const user = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        colmenasAsignadas: true,
        fechaRegistro: true,
        ultimoAcceso: true,
        moneda: true,
        alertasActivadas: true,
        notificacionesEmail: true,
        idioma: true
      }
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    return {
      success: true,
      data: user,
      message: 'Perfil obtenido exitosamente'
    } as ApiResponse<Omit<Usuario, 'password'>>;
  } catch (error: any) {
    console.error('❌ ERROR API: Get profile error:', error);
    throw new Error(error.message || 'Error interno del servidor');
  }
});

// Update current user profile
usuariosRoutes.put('/profile', async (context: any) => {
  try {
    const userId = context.user?.id;
    if (!userId) {
      throw new Error('Usuario no autenticado');
    }

    const updateData = context.body;

    // Check if email is being updated and if it's already taken by another user
    if (updateData.email) {
      const existingUser = await prisma.usuario.findFirst({
        where: {
          email: updateData.email,
          id: { not: userId }
        }
      });

      if (existingUser) {
        throw new Error('El email ya está en uso por otro usuario');
      }
    }

    const updatedUser = await prisma.usuario.update({
      where: { id: userId },
      data: {
        ...updateData,
        ultimoAcceso: new Date()
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        colmenasAsignadas: true,
        fechaRegistro: true,
        ultimoAcceso: true,
        moneda: true,
        alertasActivadas: true,
        notificacionesEmail: true,
        idioma: true
      }
    });

    return {
      success: true,
      data: updatedUser,
      message: 'Perfil actualizado exitosamente'
    } as ApiResponse<Omit<Usuario, 'password'>>;
  } catch (error: any) {
    console.error('Update profile error:', error);
    throw new Error(error.message || 'Error interno del servidor');
  }
});

// Update user status (admin only)
usuariosRoutes.patch('/:id/status', async (context: any) => {
  try {
    if (!context.user || !['administrador'].includes(context.user.rol)) {
      throw new Error('No tienes permisos para acceder a este recurso');
    }

    const { id } = context.params;
    const { activo } = context.body;

    const updatedUser = await prisma.usuario.update({
      where: { id: id },
      data: { activo: activo },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        colmenasAsignadas: true,
        fechaRegistro: true,
        ultimoAcceso: true
      }
    });

    return {
      success: true,
      data: updatedUser,
      message: 'Estado de usuario actualizado exitosamente'
    } as ApiResponse<Omit<Usuario, 'password'>>;
  } catch (error: any) {
    console.error('Update user status error:', error);
    throw new Error(error.message || 'Error interno del servidor');
  }
});

export default usuariosRoutes;