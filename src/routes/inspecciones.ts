import { Elysia } from 'elysia';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, InspeccionSanitaria, Colmena } from '../types/apicola';
import prisma from '../prisma/client';
import { AlertService } from '../services/alertService';

const inspeccionesRoutes = new Elysia({ prefix: '/inspecciones' });



inspeccionesRoutes.get('/', async ({ headers }) => {
  try {
   
    const user = await authenticateToken({ headers });
     
    const userId = user?.id;
   

    const inspecciones = await prisma.inspeccion.findMany({
      where: { ...(user.rol === 'administrador' ? {} : { usuarioId: userId }), anuladoAt: null },
      include: {
        colmenas: true,
        nucleos: true,
        enjambres: true,
        usuario: true
      },
      orderBy: { fecha: 'desc' }
    });

    return {
      success: true,
      data: inspecciones as unknown as InspeccionSanitaria[],
      message: 'Inspecciones obtenidas exitosamente'
    } as ApiResponse<InspeccionSanitaria[]>;
  } catch (error: any) {
    console.error('Get inspecciones error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

inspeccionesRoutes.get('/colmena/:colmenaId', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });

    const { colmenaId } = params;
    const userId = user?.id;
   

    console.log('DEBUG: GET /inspecciones/colmena/:colmenaId - userId:', userId, 'colmenaId:', colmenaId);

    const inspecciones = await prisma.inspeccion.findMany({
      where: {
        colmenas: {
          some: {
            id: colmenaId
          }
        },
        usuarioId: userId
      },
      include: {
        colmenas: true,
        nucleos: true,
        enjambres: true,
        usuario: true
      }
    });

    return {
      success: true,
      data: inspecciones as unknown as InspeccionSanitaria[],
      message: 'Inspecciones de colmena obtenidas exitosamente'
    } as ApiResponse<InspeccionSanitaria[]>;
  } catch (error: any) {
    console.error('Get inspecciones by colmena error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

inspeccionesRoutes.post('/', async ({ body, headers }) => {
  try {
    const user = await authenticateToken({ headers });

    const userId = user?.id;
  

    const inspeccionData = body as any;
    console.log('DEBUG: POST /inspecciones - userId:', userId, 'Datos recibidos:', inspeccionData);

    if (user.rol === 'administrador') {
      return { success: false, error: 'El administrador tiene acceso de auditoría únicamente' } as ApiResponse;
    }

    const [ownedColmenas, ownedNucleos, ownedEnjambres] = await Promise.all([
      prisma.colmena.count({ where: { id: { in: inspeccionData.colmenaIds || [] }, usuarioId: userId } }),
      prisma.nucleo.count({ where: { id: { in: inspeccionData.nucleoIds || [] }, apiario: { usuarioId: userId } } }),
      prisma.enjambre.count({ where: { id: { in: inspeccionData.enjambreIds || [] }, colmena: { usuarioId: userId } } }),
    ]);
    if (ownedColmenas !== (inspeccionData.colmenaIds || []).length || ownedNucleos !== (inspeccionData.nucleoIds || []).length || ownedEnjambres !== (inspeccionData.enjambreIds || []).length) {
      return { success: false, error: 'Una entidad no existe o no pertenece al usuario' } as ApiResponse;
    }

    const newInspeccion = await prisma.inspeccion.create({
      data: {
        fecha: inspeccionData.fecha ? new Date(inspeccionData.fecha) : new Date(),
        estadoSanidad: inspeccionData.estadoSanidad || 'saludable',
        observaciones: inspeccionData.observaciones,
        posiblesEnfermedades: inspeccionData.posiblesEnfermedades || [],
        patologiasApicolas: inspeccionData.patologiasApicolas || [],
        numColmenasAfectadas: inspeccionData.numColmenasAfectadas,
        signosClinicos: inspeccionData.signosClinicos || [],
        proximaRevision: inspeccionData.proximaRevision ? new Date(inspeccionData.proximaRevision) : undefined,
        colmenas: {
          connect: inspeccionData.colmenaIds?.map((id: string) => ({ id })) || []
        },
        nucleoIds: inspeccionData.nucleoIds || [],
        nucleos: {
          connect: inspeccionData.nucleoIds?.map((id: string) => ({ id })) || []
        },
        enjambres: {
          connect: inspeccionData.enjambreIds?.map((id: string) => ({ id })) || []
        },
        usuarioId: userId
      },
      include: {
        colmenas: true,
        nucleos: true,
        enjambres: true,
        usuario: true
      }
    });

    try {
      await AlertService.generateInspectionAlerts(newInspeccion, userId);
    } catch (alertError) {
      console.error('Error generando alertas automáticas:', alertError);
    }

    // Registrar actividad de inspección
    try {
      const colmenaNombre = inspeccionData.colmenaIds?.length > 0
        ? await prisma.colmena.findUnique({
            where: { id: inspeccionData.colmenaIds[0] },
            select: { nombre: true }
          }).then((c: { nombre: string } | null) => c?.nombre || 'Colmena')
        : 'Colmena';

      await prisma.actividad.create({
        data: {
          tipo: 'inspeccion',
          titulo: 'Inspección sanitaria completada',
          descripcion: `Inspección sanitaria completada - Estado: ${inspeccionData.estadoSanidad || 'saludable'}`,
          entidadTipo: 'colmena',
          entidadId: inspeccionData.colmenaIds?.[0],
          entidadNombre: colmenaNombre,
          estado: inspeccionData.estadoSanidad === 'enferma' || inspeccionData.estadoSanidad === 'cuarentena' ? 'warning' : 'success',
          usuarioId: userId
        }
      });
    } catch (activityError) {
      console.error('Error registrando actividad de inspección:', activityError);
    }

    return {
      success: true,
      data: newInspeccion as unknown as InspeccionSanitaria,
      message: 'Inspección creada exitosamente'
    } as ApiResponse<InspeccionSanitaria>;
  } catch (error: any) {
    console.error('Create inspeccion error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

inspeccionesRoutes.put('/:id', async ({ params, body, headers }) => {
  try {
    const user = await authenticateToken({ headers });

    const { id } = params;
    const userId = user?.id;
    const inspeccionData = body as any;

    const updated = await prisma.inspeccion.updateMany({
      where: {
        id: id,
        usuarioId: userId
      },
      data: {
        estadoSanidad: inspeccionData.estadoSanidad,
        observaciones: inspeccionData.observaciones,
        posiblesEnfermedades: inspeccionData.posiblesEnfermedades,
        patologiasApicolas: inspeccionData.patologiasApicolas,
        numColmenasAfectadas: inspeccionData.numColmenasAfectadas,
        signosClinicos: inspeccionData.signosClinicos,
        proximaRevision: inspeccionData.proximaRevision ? new Date(inspeccionData.proximaRevision) : undefined,
        // Note: Relations are handled separately for updates
        nucleoIds: inspeccionData.nucleoIds,
        // Note: Relations are handled separately for updates
      }
    });

    if (updated.count === 0) {
      return { success: false, error: 'Inspección no encontrada o no autorizada' } as ApiResponse;
    }

    const inspeccion = await prisma.inspeccion.findUnique({
      where: { id },
      include: { colmenas: true, nucleos: true, enjambres: true, usuario: true }
    });

    try {
      await AlertService.generateInspectionAlerts(inspeccion, userId);
    } catch (alertError) {
      console.error('Error generando alertas automáticas:', alertError);
    }

    return {
      success: true,
      data: inspeccion as unknown as InspeccionSanitaria,
      message: 'Inspección actualizada exitosamente'
    } as ApiResponse<InspeccionSanitaria>;
  } catch (error: any) {
    console.error('Update inspeccion error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

inspeccionesRoutes.post('/:id/anulaciones', async ({ params, body, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const { id } = params;
    const motivo = String((body as any)?.motivo || '').trim();
    if (motivo.length < 5) return { success: false, error: 'El motivo de anulación es obligatorio' } as ApiResponse;
    const inspeccion = await prisma.inspeccion.findUnique({ where: { id } });
    if (!inspeccion) return { success: false, error: 'Inspección no encontrada' } as ApiResponse;
    if (user.rol !== 'administrador' && inspeccion.usuarioId !== user.id) return { success: false, error: 'No tienes permisos' } as ApiResponse;
    if (inspeccion.anuladoAt) return { success: false, error: 'La inspección ya está anulada' } as ApiResponse;
    const updated = await prisma.inspeccion.update({
      where: { id },
      data: { anuladoAt: new Date(), anuladoPorId: user.id, motivoAnulacion: motivo }
    });
    return {
      success: true,
      data: updated,
      message: 'Inspección anulada sin eliminar su historial'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Anular inspeccion error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

inspeccionesRoutes.delete('/:id', () => ({
  success: false,
  error: 'Las inspecciones no se eliminan; usa una anulación con motivo'
} as ApiResponse));

export default inspeccionesRoutes;
