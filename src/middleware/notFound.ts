import { Elysia } from 'elysia';
import type { ApiResponse } from '../types/apicola';

// Plugin para manejar rutas no encontradas
export const notFoundHandler = new Elysia()
  .onError(({ code, set }) => {
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return {
        success: false,
        error: 'Ruta no encontrada'
      } as ApiResponse;
    }
    return;
  });