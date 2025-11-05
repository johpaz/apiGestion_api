import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { ApiResponse } from '../types/apicola';

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: 'Datos de entrada inválidos',
      data: errors.array()
    } as ApiResponse);
    return;
  }
  next();
  return;
};

// Validation rules for different entities
export const validateColmena = [
  body('numero').isInt({ min: 1 }).withMessage('Número de colmena debe ser un entero positivo'),
  body('fechaInstalacion').isISO8601().withMessage('Fecha de instalación debe ser una fecha válida'),
  body('asentamientoColmena').notEmpty().withMessage('Asentamiento de colmena es requerido'),
  body('estado').isIn(['activa', 'inactiva', 'trasladada']).withMessage('Estado debe ser activa, inactiva o trasladada'),
  handleValidationErrors
];

export const validateInspeccion = [
  body('fecha').isISO8601().withMessage('Fecha debe ser válida'),
  body('colmenaId').notEmpty().withMessage('ID de colmena es requerido'),
  body('visita').isInt({ min: 1 }).withMessage('Número de visita debe ser un entero positivo'),
  body('cuadros.conCria').isInt({ min: 0 }).withMessage('Cuadros con cría debe ser un número positivo'),
  body('cuadros.ceraNueva').isInt({ min: 0 }).withMessage('Cera nueva debe ser un número positivo'),
  body('cuadros.ceraVieja').isInt({ min: 0 }).withMessage('Cera vieja debe ser un número positivo'),
  handleValidationErrors
];

export const validateEnjambre = [
  body('codigo').notEmpty().withMessage('Código de enjambre es requerido'),
  body('fecha').isISO8601().withMessage('Fecha debe ser válida'),
  body('lugarProcedencia').notEmpty().withMessage('Lugar de procedencia es requerido'),
  body('reyna').isBoolean().withMessage('Reyna debe ser verdadero o falso'),
  body('cantidadAbejas').isInt({ min: 0 }).withMessage('Cantidad de abejas debe ser un número positivo'),
  handleValidationErrors
];

export const validateNucleo = [
  body('numero').isInt({ min: 1 }).withMessage('Número de núcleo debe ser un entero positivo'),
  body('fecha').isISO8601().withMessage('Fecha debe ser válida'),
  body('numeroColmenaSacado').notEmpty().withMessage('Número de colmena sacado es requerido'),
  body('reina').isBoolean().withMessage('Reina debe ser verdadero o falso'),
  body('cuadrosCria').isInt({ min: 0 }).withMessage('Cuadros de cría debe ser un número positivo'),
  body('cuadrosAlimento').isInt({ min: 0 }).withMessage('Cuadros de alimento debe ser un número positivo'),
  handleValidationErrors
];

export const validateProduccion = [
  body('colmenaId').notEmpty().withMessage('ID de colmena es requerido'),
  body('fecha').isISO8601().withMessage('Fecha debe ser válida'),
  body('kgMiel').isFloat({ min: 0 }).withMessage('Kg de miel debe ser un número positivo'),
  body('tipoMiel').notEmpty().withMessage('Tipo de miel es requerido'),
  body('calidad').isIn(['excelente', 'buena', 'regular']).withMessage('Calidad debe ser excelente, buena o regular'),
  handleValidationErrors
];

export const validateAuth = [
  body('email').isEmail().withMessage('Email debe ser válido'),
  body('password').isLength({ min: 6 }).withMessage('Contraseña debe tener al menos 6 caracteres'),
  handleValidationErrors
];

export const validateRegister = [
  body('nombre').notEmpty().withMessage('Nombre es requerido'),
  body('email').isEmail().withMessage('Email debe ser válido'),
  body('password').isLength({ min: 6 }).withMessage('Contraseña debe tener al menos 6 caracteres'),
  body('rol').optional().isIn(['apicultor', 'administrador']).withMessage('Rol debe ser apicultor o administrador'),
  handleValidationErrors
];

export const validateUpdateProfile = [
  body('nombre').optional().notEmpty().withMessage('Nombre no puede estar vacío'),
  body('email').optional().isEmail().withMessage('Email debe ser válido'),
  body('moneda').optional().isIn(['COP', 'EUR', 'USD']).withMessage('Moneda debe ser COP, EUR o USD'),
  body('alertasActivadas').optional().isBoolean().withMessage('Alertas activadas debe ser verdadero o falso'),
  body('notificacionesEmail').optional().isBoolean().withMessage('Notificaciones email debe ser verdadero o falso'),
  body('idioma').optional().notEmpty().withMessage('Idioma no puede estar vacío'),
  handleValidationErrors
];