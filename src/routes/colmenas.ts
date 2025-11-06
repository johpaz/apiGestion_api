import { Elysia } from 'elysia';
import { authenticateToken } from '../middleware/auth.js';
import type { ApiResponse, Colmena } from '../types/apicola.js';
import prisma from '../prisma/client.js';
import { AlertService } from '../services/alertService.js';

const colmenasRoutes = new Elysia({ prefix: '/colmenas' });

// Get all colmenas for authenticated user
colmenasRoutes.get('/', async ({ headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;
    const colmenas = await prisma.colmena.findMany({
      where: { usuarioId: userId }
    });

   

    return {
      success: true,
      data: colmenas,
      message: 'Colmenas obtenidas exitosamente'
    } as ApiResponse<Colmena[]>;
  } catch (error: any) {
    console.error('Get colmenas error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// Get single colmena by ID
colmenasRoutes.get('/:id', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const { id } = params;
    const userId = user?.id;

    const colmena = await prisma.colmena.findFirst({
      where: {
        id: id,
        usuarioId: userId
      }
    });

    if (!colmena) {
      return {
        success: false,
        error: 'Colmena no encontrada'
      } as ApiResponse;
    }

    return {
      success: true,
      data: colmena,
      message: 'Colmena obtenida exitosamente'
    } as ApiResponse<Colmena>;
  } catch (error: any) {
    console.error('Get colmena error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// Create new colmena
colmenasRoutes.post('/', async ({ body, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;

    const colmenaData = body as any;
    const newColmena = await prisma.colmena.create({
      data: {
        nombre: colmenaData.nombre,
        estado: colmenaData.estado || 'activa',
        fechaInstalacion: new Date(colmenaData.fechaInstalacion),
        apiarioId: colmenaData.apiarioId,
        usuarioId: userId
      }
    });

    // Crear alertas recurrentes automáticamente
    try {
      await AlertService.createRecurrentAlertsForEntity(
        'colmena',
        newColmena.id,
        newColmena.nombre,
        userId
      );
    } catch (alertError) {
      console.error('Error creando alertas recurrentes para colmena:', alertError);
      // No fallar la creación de la colmena por error en alertas
    }

    return {
      success: true,
      data: newColmena,
      message: 'Colmena creada exitosamente'
    } as ApiResponse<Colmena>;
  } catch (error: any) {
    console.error('Create colmena error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// Update colmena
colmenasRoutes.put('/:id', async ({ params, body, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const { id } = params;
    const userId = user?.id;

    const colmenaData = body as any;
    const updatedColmena = await prisma.colmena.updateMany({
      where: {
        id: id,
        usuarioId: userId
      },
      data: {
        nombre: colmenaData.nombre,
        estado: colmenaData.estado,
        apiarioId: colmenaData.apiarioId,
        fechaInstalacion: colmenaData.fechaInstalacion ? new Date(colmenaData.fechaInstalacion) : undefined
      }
    });

    if (updatedColmena.count === 0) {
      return {
        success: false,
        error: 'Colmena no encontrada'
      } as ApiResponse;
    }

    const colmena = await prisma.colmena.findUnique({
      where: { id: id }
    });

    return {
      success: true,
      data: colmena,
      message: 'Colmena actualizada exitosamente'
    } as ApiResponse<Colmena>;
  } catch (error: any) {
    console.error('Update colmena error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// Delete colmena
colmenasRoutes.delete('/:id', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const { id } = params;
    const userId = user?.id;

    const deletedColmena = await prisma.colmena.deleteMany({
      where: {
        id: id,
        usuarioId: userId
      }
    });

    if (deletedColmena.count === 0) {
      return {
        success: false,
        error: 'Colmena no encontrada'
      } as ApiResponse;
    }

    return {
      success: true,
      message: 'Colmena eliminada exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Delete colmena error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

export default colmenasRoutes;