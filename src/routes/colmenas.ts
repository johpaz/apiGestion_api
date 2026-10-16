import { Elysia } from 'elysia';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, Colmena } from '../types/apicola';
import { sql, insert, updateWhere } from '../db';
import { AlertService } from '../services/alertService';

const colmenasRoutes = new Elysia({ prefix: '/colmenas' });

// Get all colmenas for authenticated user
colmenasRoutes.get('/', async ({ headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const userId = user?.id;
    const colmenas = await sql`SELECT * FROM colmenas WHERE "usuarioId" = ${userId}`;

   

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

    const colmena = (await sql`SELECT * FROM colmenas WHERE id = ${id} AND "usuarioId" = ${userId} LIMIT 1`)[0];

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
    const newColmena = await insert('colmenas', {
      nombre: colmenaData.nombre,
      estado: colmenaData.estado || 'activa',
      fechaInstalacion: new Date(colmenaData.fechaInstalacion),
      apiarioId: colmenaData.apiarioId,
      usuarioId: userId
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
    const updated = await updateWhere(
      'colmenas',
      {
        nombre: colmenaData.nombre,
        estado: colmenaData.estado,
        apiarioId: colmenaData.apiarioId,
        fechaInstalacion: colmenaData.fechaInstalacion ? new Date(colmenaData.fechaInstalacion) : undefined
      },
      sql`id = ${id} AND "usuarioId" = ${userId}`
    );

    if (updated.length === 0) {
      return {
        success: false,
        error: 'Colmena no encontrada'
      } as ApiResponse;
    }

    return {
      success: true,
      data: updated[0],
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

    const deleted = await sql`DELETE FROM colmenas WHERE id = ${id} AND "usuarioId" = ${userId} RETURNING id`;

    if (deleted.length === 0) {
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