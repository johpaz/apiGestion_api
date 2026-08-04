import { describe, expect, test } from 'bun:test';
import { Moneda } from '../types/apicola';
import type { AuthUser } from './auth';
import { AuthenticationError, AuthorizationError, getBearerToken, requireRole } from './authorization';

const user = (rol: AuthUser['rol']): AuthUser => ({
  id: 'user-1',
  nombre: 'Usuario de prueba',
  email: 'user@example.com',
  rol,
  activo: true,
  moneda: Moneda.COP,
  colmenasAsignadas: [],
  fechaRegistro: new Date('2026-01-01'),
  alertasActivadas: true,
  notificacionesEmail: true,
  idioma: 'es',
});

describe('authorization policy', () => {
  test('accepts an administrator for an admin-only operation', async () => {
    await expect(requireRole(['administrador'])(user('administrador'))).resolves.toMatchObject({
      rol: 'administrador',
    });
  });

  test('rejects an apicultor for an admin-only operation', async () => {
    await expect(requireRole(['administrador'])(user('apicultor'))).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  test('rejects a request without a bearer token as unauthenticated', () => {
    expect(() => getBearerToken()).toThrow(AuthenticationError);
  });
});
