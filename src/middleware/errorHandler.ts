import { Elysia } from 'elysia';
import { ApiResponse } from '../types/apicola';
import logger from '../utils/logger';
import { AuthenticationError, AuthorizationError } from './authorization';

// Plugin de manejo de errores para Elysia
export const errorHandler = new Elysia()
  .onError({ as: 'global' }, ({ code, error, set }) => {
    logger.error(`Error: ${error}`);

    // Default error
    let errorResponse = {
      success: false,
      error: 'Error interno del servidor'
    } as ApiResponse;

    // Handle different error types
    if (error instanceof Error) {
      if (error instanceof AuthenticationError) {
        set.status = 401;
        errorResponse.error = error.message;
      }

      if (error instanceof AuthorizationError) {
        set.status = 403;
        errorResponse.error = error.message;
      }

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
