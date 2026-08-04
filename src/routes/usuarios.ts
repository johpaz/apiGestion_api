import { Elysia } from 'elysia';
import { authGuard } from '../middleware/auth';
import { AuthorizationError, requireRole } from '../middleware/authorization';
import { ApiResponse, Usuario } from '../types/apicola';
import { validateUpdateProfile } from '../middleware/validation';
import prisma from '../prisma/client';

const usuariosRoutes = new Elysia({ prefix: '/usuarios' })
  .use(authGuard);

// Get all users (admin only)
usuariosRoutes.get('/', async (context: any) => {
  try {
    await requireRole(['administrador'])(context.user);

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
        ,moneda: true
      }
    });

    return {
      success: true,
      data: usuarios,
      message: 'Usuarios obtenidos exitosamente'
    } as ApiResponse<Omit<Usuario, 'password'>[]>;
  } catch (error: any) {
    console.error('Get usuarios error:', error);
    throw error;
  }
});

// Get user profile by userId
usuariosRoutes.get('/profile/:userId', async (context: any) => {
  try {
    const userId = context.params.userId;

    if (!userId) {
      throw new Error('ID de usuario requerido');
    }

    if (context.user.id !== userId && context.user.rol !== 'administrador') {
      throw new AuthorizationError();
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
    throw error;
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
    throw error;
  }
});

// Update user status (admin only)
usuariosRoutes.patch('/:id/status', async (context: any) => {
  try {
    await requireRole(['administrador'])(context.user);

    const { id } = context.params;
    const { activo } = context.body;

    if (typeof activo !== 'boolean') {
      context.set.status = 400;
      return { success: false, error: 'El estado debe ser booleano' };
    }

    const target = await prisma.usuario.findUnique({ where: { id } });
    if (!target) {
      context.set.status = 404;
      return { success: false, error: 'Usuario no encontrado' };
    }
    if (target.rol === 'administrador' && target.activo && !activo) {
      const activeAdmins = await prisma.usuario.count({ where: { rol: 'administrador', activo: true } });
      if (activeAdmins <= 1) {
        context.set.status = 409;
        return { success: false, error: 'No se puede desactivar el último administrador activo' };
      }
    }

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
    throw error;
  }
});

// Update user role (admin only)
usuariosRoutes.patch('/:id/role', async (context: any) => {
  await requireRole(['administrador'])(context.user);
  const { id } = context.params;
  const { rol } = context.body;

  if (rol !== 'apicultor' && rol !== 'administrador') {
    context.set.status = 400;
    return { success: false, error: 'Rol inválido' };
  }
  const target = await prisma.usuario.findUnique({ where: { id } });
  if (!target) {
    context.set.status = 404;
    return { success: false, error: 'Usuario no encontrado' };
  }
  if (target.rol === 'administrador' && rol !== 'administrador' && target.activo) {
    const activeAdmins = await prisma.usuario.count({ where: { rol: 'administrador', activo: true } });
    if (activeAdmins <= 1) {
      context.set.status = 409;
      return { success: false, error: 'No se puede cambiar el rol del último administrador activo' };
    }
  }

  const updatedUser = await prisma.usuario.update({
    where: { id },
    data: { rol },
    select: { id: true, nombre: true, email: true, rol: true, activo: true, colmenasAsignadas: true, fechaRegistro: true, ultimoAcceso: true, moneda: true },
  });
  return { success: true, data: updatedUser, message: 'Rol actualizado exitosamente' };
});

export default usuariosRoutes;
