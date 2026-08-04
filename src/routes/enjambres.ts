import { Elysia } from 'elysia';
import { authGuard } from '../middleware/auth';
import { ApiResponse, Enjambre } from '../types/apicola';
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

    const colmena = await prisma.colmena.findFirst({
      where: { id: enjambreData.colmenaId, usuarioId: userId },
      select: { id: true }
    });

    if (!colmena) {
      context.set.status = 404;
      return { success: false, error: 'Colmena no encontrada' } as ApiResponse;
    }

    const newEnjambre = await prisma.enjambre.create({
      data: {
        nombre: enjambreData.nombre,
        estado: 'activo',
        notas: enjambreData.notas || null,
        colmenaId: colmena.id
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
        estado: enjambreData.estado,
        notas: enjambreData.notas
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

// Logical removal: swarm records are retained for productive and sanitary traceability.
enjambresRoutes.delete('/:id', async (context: any) => {
  try {
    const { id } = context.params;
    const userId = context.user?.id;

    const updatedEnjambre = await prisma.enjambre.updateMany({
      where: { id, colmena: { usuarioId: userId } },
      data: { estado: 'inactivo', alertasRecurrentesActivadas: false }
    });

    if (updatedEnjambre.count === 0) {
      context.set.status = 404;
      return { success: false, error: 'Enjambre no encontrado' } as ApiResponse;
    }

    const enjambre = await prisma.enjambre.findUnique({ where: { id } });
    return {
      success: true,
      data: enjambre,
      message: 'Enjambre dado de baja; su trazabilidad se conserva'
    } as unknown as ApiResponse<Enjambre>;
  } catch (error: any) {
    console.error('Delete enjambre error:', error);
    context.set.status = 500;
    return { success: false, error: 'Error interno del servidor' } as ApiResponse;
  }
});

export default enjambresRoutes;
