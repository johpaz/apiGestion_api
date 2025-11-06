import { Elysia } from 'elysia';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse } from '../types/apicola';
import { AlertService, CreateAlertData } from '../services/alertService';
import { TipoAlerta, PrioridadAlerta } from '../generated/prisma/client';

// Zod schemas for validation
const createAlertSchema = z.object({
  titulo: z.string().min(1, 'Título es requerido'),
  mensaje: z.string().min(1, 'Mensaje es requerido'),
  tipo: z.enum(['inspeccion', 'produccion', 'sanidad', 'mantenimiento', 'otros']),
  prioridad: z.enum(['baja', 'media', 'alta', 'critica'])
});

const alertasRoutes = new Elysia({ prefix: '/alertas' });

// GET /alertas - Listar alertas del usuario autenticado
alertasRoutes.get('/', async ({ headers, query }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;

    const limit = query?.limit ? parseInt(query.limit as string) : 50;

    const alerts = await AlertService.getUserAlerts(userId, limit);

    return {
      success: true,
      data: alerts,
      message: 'Alertas obtenidas exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Get alerts error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// POST /alertas - Crear alerta manual
alertasRoutes.post('/', async ({ body, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;

    const validatedData = createAlertSchema.parse(body);

    const alertData: CreateAlertData = {
      titulo: validatedData.titulo,
      mensaje: validatedData.mensaje,
      tipo: validatedData.tipo as TipoAlerta,
      prioridad: validatedData.prioridad as PrioridadAlerta,
      usuarioId: userId
    };

    const newAlert = await AlertService.createAlert(alertData);

    return {
      success: true,
      data: newAlert,
      message: 'Alerta creada exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Create alert error:', error);
    if (error.name === 'ZodError') {
      return {
        success: false,
        error: 'Datos de entrada inválidos',
        data: error.errors
      } as ApiResponse;
    }
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// PUT /alertas/:id/leida - Marcar alerta como leída
alertasRoutes.put('/:id/leida', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;
    const { id } = params;

    const result = await AlertService.markAsRead(id, userId);

    return {
      success: true,
      data: result,
      message: 'Alerta marcada como leída exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Mark alert as read error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

export default alertasRoutes;