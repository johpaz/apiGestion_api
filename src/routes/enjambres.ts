import { Elysia } from 'elysia';
import { authGuard } from '../middleware/auth';
import type { ApiResponse, Enjambre } from '../types/apicola';
import prisma from '../prisma/client';
import { AlertService } from '../services/alertService';

const enjambresRoutes = new Elysia({ prefix: '/enjambres' })
  .use(authGuard);

// Get all enjambres for authenticated user
enjambresRoutes.get('/', async (context: any) => {
  try {
    const userId = context.user?.id;
    const enjambres = await prisma.enjambre.findMany({
      where: { colmena: { usuarioId: userId } }
    });

    return {
      success: true,
      data: enjambres,
      message: 'Enjambres obtenidos exitosamente'
    } as unknown as ApiResponse<Enjambre[]>;
  } catch (error: any) {
    console.error('Get enjambres error:', error);
    throw new Error('Error interno del servidor');
  }
});

// Create new enjambre
enjambresRoutes.post('/', async (context: any) => {
  try {
    const userId = context.user?.id;
    const enjambreData = context.body;

    const newEnjambre = await prisma.enjambre.create({
      data: {
        nombre: enjambreData.nombre,
        estado: 'activo',
        colmenaId: enjambreData.colmenaId
      }
    });

    // Crear alertas recurrentes automáticamente
    try {
      await AlertService.createRecurrentAlertsForEntity(
        'enjambre',
        newEnjambre.id,
        newEnjambre.nombre,
        userId
      );
    } catch (alertError) {
      console.error('Error creando alertas recurrentes para enjambre:', alertError);
      // No fallar la creación del enjambre por error en alertas
    }

    return {
      success: true,
      data: newEnjambre,
      message: 'Enjambre registrado exitosamente'
    } as unknown as ApiResponse<Enjambre>;
  } catch (error: any) {
    console.error('Create enjambre error:', error);
    throw new Error('Error interno del servidor');
  }
});

// Update enjambre
enjambresRoutes.put('/:id', async (context: any) => {
  try {
    const { id } = context.params;
    const userId = context.user?.id;
    const enjambreData = context.body;

    const updatedEnjambre = await prisma.enjambre.updateMany({
      where: {
        id: id,
        colmena: { usuarioId: userId }
      },
      data: {
        nombre: enjambreData.nombre,
        estado: enjambreData.estado
      }
    });

    if (updatedEnjambre.count === 0) {
      throw new Error('Enjambre no encontrado');
    }

    const enjambre = await prisma.enjambre.findUnique({
      where: { id: id }
    });

    return {
      success: true,
      data: enjambre,
      message: 'Enjambre actualizado exitosamente'
    } as unknown as ApiResponse<Enjambre>;
  } catch (error: any) {
    console.error('Update enjambre error:', error);
    throw new Error(error.message || 'Error interno del servidor');
  }
});

export default enjambresRoutes;