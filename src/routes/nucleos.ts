import { Elysia } from 'elysia';
import { authGuard } from '../middleware/auth.js';
import type { ApiResponse, Nucleo } from '../types/apicola.js';
import prisma from '../prisma/client.js';
import { AlertService } from '../services/alertService.js';

const nucleosRoutes = new Elysia({ prefix: '/nucleos' })
  .use(authGuard);

// Get all nucleos for authenticated user
nucleosRoutes.get('/', async (context: any) => {
  try {
    const userId = context.user?.id;
    const nucleos = await prisma.nucleo.findMany({
      where: { colmena: { usuarioId: userId } },
      include: { colmena: true }
    });

    return {
      success: true,
      data: nucleos as unknown as Nucleo[],
      message: 'Núcleos obtenidos exitosamente'
    } as ApiResponse<Nucleo[]>;
  } catch (error: any) {
    console.error('Get nucleos error:', error);
    throw new Error('Error interno del servidor');
  }
});

// Create new nucleo
nucleosRoutes.post('/', async (context: any) => {
  try {
    const userId = context.user?.id;
    const nucleoData = context.body;

    const newNucleo = await prisma.nucleo.create({
      data: {
        numero: nucleoData.numero,
        tipo: nucleoData.tipo || 'Langstroth',
        estado: nucleoData.estado || 'Nuevo',
        fechaInstalacion: new Date(nucleoData.fechaInstalacion),
        colmenaId: nucleoData.colmenaId
      },
      include: { colmena: true }
    });

    // Crear alertas recurrentes automáticamente
    try {
      const nucleoNombre = `Núcleo ${newNucleo.numero} - ${newNucleo.tipo}`;
      await AlertService.createRecurrentAlertsForEntity(
        'nucleo',
        newNucleo.id,
        nucleoNombre,
        userId
      );
    } catch (alertError) {
      console.error('Error creando alertas recurrentes para núcleo:', alertError);
      // No fallar la creación del núcleo por error en alertas
    }

    return {
      success: true,
      data: newNucleo as unknown as Nucleo,
      message: 'Núcleo registrado exitosamente'
    } as ApiResponse<Nucleo>;
  } catch (error: any) {
    console.error('Create nucleo error:', error);
    throw new Error('Error interno del servidor');
  }
});

// Update nucleo
nucleosRoutes.put('/:id', async (context: any) => {
  try {
    const userId = context.user?.id;
    const nucleoId = context.params.id;
    const updateData = context.body;

    // Verificar que el núcleo pertenece al usuario
    const existingNucleo = await prisma.nucleo.findFirst({
      where: {
        id: nucleoId,
        colmena: { usuarioId: userId }
      }
    });

    if (!existingNucleo) {
      throw new Error('Núcleo no encontrado o no autorizado');
    }

    const updatedNucleo = await prisma.nucleo.update({
      where: { id: nucleoId },
      data: {
        numero: updateData.numero,
        tipo: updateData.tipo,
        estado: updateData.estado,
        fechaInstalacion: updateData.fechaInstalacion ? new Date(updateData.fechaInstalacion) : undefined
      },
      include: { colmena: true }
    });

    return {
      success: true,
      data: updatedNucleo as unknown as Nucleo,
      message: 'Núcleo actualizado exitosamente'
    } as ApiResponse<Nucleo>;
  } catch (error: any) {
    console.error('Update nucleo error:', error);
    throw new Error('Error interno del servidor');
  }
});

// Delete nucleo
nucleosRoutes.delete('/:id', async (context: any) => {
  try {
    const userId = context.user?.id;
    const nucleoId = context.params.id;

    // Verificar que el núcleo pertenece al usuario
    const existingNucleo = await prisma.nucleo.findFirst({
      where: {
        id: nucleoId,
        colmena: { usuarioId: userId }
      }
    });

    if (!existingNucleo) {
      throw new Error('Núcleo no encontrado o no autorizado');
    }

    await prisma.nucleo.delete({
      where: { id: nucleoId }
    });

    return {
      success: true,
      message: 'Núcleo eliminado exitosamente'
    } as ApiResponse<null>;
  } catch (error: any) {
    console.error('Delete nucleo error:', error);
    throw new Error('Error interno del servidor');
  }
});

export default nucleosRoutes;