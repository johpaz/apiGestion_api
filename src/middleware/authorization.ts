import type { AuthUser } from './auth';

export class AuthenticationError extends Error {
  constructor(message = 'Token inválido o expirado') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message = 'No tienes permisos para acceder a este recurso') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export const getBearerToken = (authorization?: string) => {
  const [scheme, token] = authorization?.split(' ') || [];
  if (scheme !== 'Bearer' || !token) {
    throw new AuthenticationError('Token de acceso requerido');
  }
  return token;
};

export const requireRole = (roles: AuthUser['rol'][]) => async (user: AuthUser) => {
  if (!user) throw new AuthenticationError('Usuario no autenticado');
  if (!roles.includes(user.rol)) throw new AuthorizationError();
  return user;
};
