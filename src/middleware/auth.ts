import { Elysia } from 'elysia';
import jwt from 'jsonwebtoken';
import type { ApiResponse, Usuario } from '../types/apicola.js';
import logger from '../utils/logger.js';
import { auth as firebaseAuth } from '../firebase.js';
import prisma from '../prisma/client.js';

export interface AuthUser extends Omit<Usuario, 'password'> {}

export const authenticateToken = async ({ headers }: { headers: Record<string, string | undefined> }) => {
  logger.info({ msg: 'Auth middleware: Authorization header value', value: headers.authorization ? headers.authorization.substring(0, 20) + '...' : 'null' });
  logger.info({ msg: 'CORS DEBUG: Auth middleware - Headers', origin: headers.origin, host: headers.host, referer: headers.referer });

  const authHeader = headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

 
  if (!token) {
    logger.warn('Auth middleware: No token found');
    throw new Error('Token de acceso requerido');
  }

  try {
    // Decode token header to check algorithm without verification
    let decodedHeader: any = null;
    try {
      decodedHeader = jwt.decode(token, { complete: true });
      if (decodedHeader && decodedHeader.header) {
        logger.info({ msg: 'Auth middleware: Token header decoded successfully', alg: decodedHeader.header.alg, typ: decodedHeader.header.typ });
      } else {
        logger.warn('Auth middleware: Token header is null or undefined');
        logger.warn({ msg: 'Auth middleware: Decoded header object', decodedHeader });
      }
    } catch (decodeErr: any) {
      logger.error({ msg: 'Auth middleware: Failed to decode token header', error: decodeErr.message, name: decodeErr.name });
    }

    let decoded: AuthUser;

    if (decodedHeader?.header?.alg === 'RS256') {
      // RS256: Firebase token
      logger.info('Auth middleware: Detected RS256 algorithm, using Firebase verification');
      if (!firebaseAuth) {
        logger.error('Auth middleware: Firebase Auth not available for RS256 verification');
        throw new Error('Firebase Auth no está disponible');
      }

      logger.info('Auth middleware: About to verify Firebase ID token');
      let firebaseDecoded: any;
      try {
        firebaseDecoded = await firebaseAuth.verifyIdToken(token);
        logger.info({ msg: 'Auth middleware: Firebase token verified', uid: firebaseDecoded.uid, email: firebaseDecoded.email });
      } catch (verificationError: any) {
        logger.error({ msg: 'Auth middleware: Firebase token verification failed', error: verificationError.message });
        logger.error({ msg: 'Auth middleware: Token details for debugging', alg: decodedHeader?.header?.alg, kid: decodedHeader?.header?.kid });
        throw verificationError;
      }

      // Find user in database by email
      const user = await prisma.usuario.findUnique({
        where: {
          email: firebaseDecoded.email!,
          activo: true
        }
      });

      if (!user) {
        logger.error({ msg: 'Auth middleware: User not found in database for Firebase token', email: firebaseDecoded.email });
        throw new Error('Usuario no encontrado');
      }

      decoded = {
        id: user.id,
        email: user.email,
        rol: user.rol,
        nombre: user.nombre,
        moneda: user.moneda as any, // Cast to handle enum type mismatch
        activo: user.activo,
        fechaRegistro: user.fechaRegistro,
        ultimoAcceso: user.ultimoAcceso || undefined,
        colmenasAsignadas: user.colmenasAsignadas,
        alertasActivadas: user.alertasActivadas,
        notificacionesEmail: user.notificacionesEmail,
        idioma: user.idioma
      };

      logger.info('Auth middleware: Firebase token mapped to database user successfully');
      logger.info({ msg: 'Auth middleware: Decoded user', userId: decoded.id, email: decoded.email });

    } else {
      // HS256: Our own JWT
      logger.info('Auth middleware: Detected HS256 algorithm, using JWT_SECRET verification');
      const jwtSecret = process.env.JWT_SECRET || 'fallback-secret';
      logger.info({ msg: 'Auth middleware: JWT_SECRET present', present: !!process.env.JWT_SECRET });
      logger.info({ msg: 'Auth middleware: Using JWT_SECRET', secret: jwtSecret.substring(0, 10) + '...' });

      decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as AuthUser;
      logger.info('Auth middleware: JWT token decoded successfully');
      logger.info({ msg: 'Auth middleware: Decoded user', userId: decoded.id, email: decoded.email });
    }

    return decoded;
  } catch (err: any) {
    logger.error({ msg: 'Auth middleware: Token verification failed', error: err.message, name: err.name, code: err.code });
    logger.error({ msg: 'Auth middleware: Full error details', stack: err.stack });
    throw new Error('Token inválido o expirado');
  }
};

export const requireRole = (roles: string[]) => {
  return async (user: AuthUser) => {
    if (!user) {
      throw new Error('Usuario no autenticado');
    }

    if (!roles.includes(user.rol)) {
      throw new Error('No tienes permisos para acceder a este recurso');
    }

    return user;
  };
};

// Guards de Elysia
export const authGuard = new Elysia()
  .derive(async ({ headers }) => {
    const user = await authenticateToken({ headers });
    return { user };
  });

export const requireRoleGuard = (roles: string[]) => new Elysia()
  .derive(async (context) => {
    const user = (context as any).user;
    if (!user) {
      throw new Error('Usuario no autenticado');
    }

    if (!roles.includes(user.rol)) {
      throw new Error('No tienes permisos para acceder a este recurso');
    }

    return { user };
  });