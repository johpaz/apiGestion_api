import { Elysia } from 'elysia';
import jwt from 'jsonwebtoken';
import type { Usuario } from '../types/apicola';
import logger from '../utils/logger';
import { auth as firebaseAuth } from '../firebase';
import prisma from '../prisma/client';
import {
  AuthenticationError,
  getBearerToken,
  requireRole,
} from './authorization';

export interface AuthUser extends Omit<Usuario, 'password'> {}

const toAuthUser = (user: Awaited<ReturnType<typeof prisma.usuario.findFirstOrThrow>>): AuthUser => ({
  id: user.id,
  email: user.email,
  rol: user.rol,
  nombre: user.nombre,
  moneda: user.moneda as AuthUser['moneda'],
  activo: user.activo,
  fechaRegistro: user.fechaRegistro,
  ultimoAcceso: user.ultimoAcceso || undefined,
  colmenasAsignadas: user.colmenasAsignadas,
  alertasActivadas: user.alertasActivadas,
  notificacionesEmail: user.notificacionesEmail,
  idioma: user.idioma,
});

export const authenticateToken = async ({ headers }: { headers: Record<string, string | undefined> }) => {
  const token = getBearerToken(headers.authorization);

  try {
    const decodedHeader = jwt.decode(token, { complete: true });
    let userLookup: { id?: string; email?: string };

    if (decodedHeader?.header?.alg === 'RS256') {
      if (!firebaseAuth) {
        throw new AuthenticationError('Firebase Auth no está disponible');
      }
      const decoded = await firebaseAuth.verifyIdToken(token);
      userLookup = { email: decoded.email };
    } else if (decodedHeader?.header?.alg === 'HS256') {
      const jwtSecret = process.env.JWT_SECRET || 'fallback-secret';
      const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as {
        id?: string;
        email?: string;
      };
      userLookup = { id: decoded.id, email: decoded.email };
    } else {
      throw new AuthenticationError();
    }

    if (!userLookup.id && !userLookup.email) {
      throw new AuthenticationError();
    }

    const user = await prisma.usuario.findFirst({
      where: {
        activo: true,
        ...(userLookup.id ? { id: userLookup.id } : { email: userLookup.email! }),
      },
    });

    if (!user) {
      throw new AuthenticationError('Usuario no encontrado o inactivo');
    }

    return toAuthUser(user);
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    logger.warn({ error }, 'Falló la verificación del token');
    throw new AuthenticationError();
  }
};

export const authGuard = new Elysia().derive({ as: 'global' }, async ({ headers }) => ({
  user: await authenticateToken({ headers }),
}));

export const requireRoleGuard = (roles: AuthUser['rol'][]) => new Elysia()
  .derive({ as: 'global' }, async (context) => ({
    user: await requireRole(roles)((context as unknown as { user: AuthUser }).user),
  }));
