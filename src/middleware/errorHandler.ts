import { Elysia } from 'elysia';
import type { ApiResponse } from '../types/apicola.js';
import logger from '../utils/logger.js';

// Plugin de manejo de errores para Elysia
export const errorHandler = new Elysia()
  .onError(({ code, error, set }) => {
    logger.error(`Error: ${error}`);

    // Default error
    let errorResponse = {
      success: false,
      error: 'Error interno del servidor'
    } as ApiResponse;

    // Handle different error types
    if (error instanceof Error) {
      // Validation errors
      if (error.name === 'ValidationError') {
        errorResponse.error = 'Datos de entrada inválidos';
        set.status = 400;
      }

      // JWT errors
      if (error.name === 'JsonWebTokenError') {
        logger.error({ msg: 'JWT Error details', error: error.message, name: error.name, code: (error as any).code });
        errorResponse.error = 'Token inválido';
        set.status = 401;
      }

      if (error.name === 'TokenExpiredError') {
        errorResponse.error = 'Token expirado';
        set.status = 401;
      }

      // Custom auth errors
      if (error.message === 'Token de acceso requerido' ||
          error.message === 'Token inválido o expirado' ||
          error.message === 'Usuario no autenticado' ||
          error.message === 'No tienes permisos para acceder a este recurso') {
        set.status = 401;
        errorResponse.error = error.message;
      }

      // Duplicate key error (for unique constraints)
      if (error.message.includes('duplicate key')) {
        errorResponse.error = 'El recurso ya existe';
        set.status = 409;
      }
    }

    // Not found errors
    if (code === 'NOT_FOUND') {
      set.status = 404;
      errorResponse.error = 'Ruta no encontrada';
    }

    return errorResponse;
  });