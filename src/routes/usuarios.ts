import { Elysia } from 'elysia';
import { authGuard } from '../middleware/auth';
import { AuthorizationError, requireRole } from '../middleware/authorization';
import { ApiResponse, Usuario } from '../types/apicola';
import { sql, updateById } from '../db';

const usuariosRoutes = new Elysia({ prefix: '/usuarios' })
  .use(authGuard);

// Columnas públicas (nunca incluir password)
const BASIC_COLS = sql`id, nombre, email, rol, activo, "colmenasAsignadas", "fechaRegistro", "ultimoAcceso", moneda`;
const PROFILE_COLS = sql`id, nombre, email, rol, activo, "colmenasAsignadas", "fechaRegistro", "ultimoAcceso", moneda, "alertasActivadas", "notificacionesEmail", idioma`;

// Campos que el propio usuario puede modificar de su perfil
const EDITABLE_PROFILE_FIELDS = ['nombre', 'email', 'moneda', 'imagenPerfil', 'alertasActivadas', 'notificacionesEmail', 'idioma'] as const;

// Get all users (admin only)
usuariosRoutes.get('/', async (context: any) => {
  try {
    await requireRole(['administrador'])(context.user);

    const usuarios = await sql`SELECT ${BASIC_COLS} FROM usuarios`;

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

    const [user] = await sql`SELECT ${PROFILE_COLS} FROM usuarios WHERE id = ${userId}`;

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

    const body = context.body ?? {};
    // Solo campos propios del perfil: evita que un usuario se asigne rol, activo o password
    const updateData: Record<string, unknown> = {};
    for (const field of EDITABLE_PROFILE_FIELDS) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    // Check if email is being updated and if it's already taken by another user
    if (updateData.email) {
      const [existingUser] = await sql`SELECT id FROM usuarios WHERE email = ${updateData.email as string} AND id <> ${userId}`;

      if (existingUser) {
        throw new Error('El email ya está en uso por otro usuario');
      }
    }

    await updateById('usuarios', userId, { ...updateData, ultimoAcceso: new Date() });
    const [updatedUser] = await sql`SELECT ${PROFILE_COLS} FROM usuarios WHERE id = ${userId}`;

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

const countActiveAdmins = async () => {
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM usuarios WHERE rol = 'administrador' AND activo = true`;
  return total as number;
};

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

    const [target] = await sql`SELECT * FROM usuarios WHERE id = ${id}`;
    if (!target) {
      context.set.status = 404;
      return { success: false, error: 'Usuario no encontrado' };
    }
    if (target.rol === 'administrador' && target.activo && !activo) {
      if (await countActiveAdmins() <= 1) {
        context.set.status = 409;
        return { success: false, error: 'No se puede desactivar el último administrador activo' };
      }
    }

    await updateById('usuarios', id, { activo });
    const [updatedUser] = await sql`SELECT ${BASIC_COLS} FROM usuarios WHERE id = ${id}`;

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
  const [target] = await sql`SELECT * FROM usuarios WHERE id = ${id}`;
  if (!target) {
    context.set.status = 404;
    return { success: false, error: 'Usuario no encontrado' };
  }
  if (target.rol === 'administrador' && rol !== 'administrador' && target.activo) {
    if (await countActiveAdmins() <= 1) {
      context.set.status = 409;
      return { success: false, error: 'No se puede cambiar el rol del último administrador activo' };
    }
  }

  await updateById('usuarios', id, { rol });
  const [updatedUser] = await sql`SELECT ${BASIC_COLS} FROM usuarios WHERE id = ${id}`;
  return { success: true, data: updatedUser, message: 'Rol actualizado exitosamente' };
});

export default usuariosRoutes;
