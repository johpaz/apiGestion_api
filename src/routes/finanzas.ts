import { Elysia } from 'elysia';
import { authGuard } from '../middleware/auth';
import { ApiResponse, RegistroFinanciero } from '../types/apicola';
import prisma from '../prisma/client';

const finanzasRoutes = new Elysia({ prefix: '/finanzas' })
  .use(authGuard);

// Get all financial records for authenticated user
finanzasRoutes.get('/', async (context: any) => {
  try {
    const userId = context.user?.id;
    const transacciones = await prisma.transaccion.findMany({
      where: { usuarioId: userId }
    });

    return {
      success: true,
      data: transacciones.map(t => ({
        id: t.id,
        fecha: t.fecha.toISOString(),
        tipo: t.tipo,
        categoria: t.categoria || 'otros',
        descripcion: t.descripcion,
        monto: t.monto,
        comprobante: t.referencia,
        usuarioId: t.usuarioId,
        createdAt: t.fechaCreacion,
        updatedAt: t.fechaActualizacion,
      })),
      message: 'Registros financieros obtenidos exitosamente'
    } as ApiResponse<RegistroFinanciero[]>;
  } catch (error: any) {
    console.error('Get finanzas error:', error);
    throw new Error('Error interno del servidor');
  }
});

// Get financial summary
finanzasRoutes.get('/resumen', async (context: any) => {
  try {
    const userId = context.user?.id;
    const transacciones = await prisma.transaccion.findMany({
      where: { usuarioId: userId }
    });

    const ingresos = transacciones
      .filter(t => t.tipo === 'ingreso')
      .reduce((sum, t) => sum + t.monto, 0);

    const egresos = transacciones
      .filter(t => t.tipo === 'egreso')
      .reduce((sum, t) => sum + t.monto, 0);

    const balance = ingresos - egresos;

    const resumen = {
      ingresos,
      egresos,
      balance,
      totalRegistros: transacciones.length
    };

    return {
      success: true,
      data: resumen,
      message: 'Resumen financiero obtenido exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Get financial summary error:', error);
    throw new Error('Error interno del servidor');
  }
});

// Create new financial record
finanzasRoutes.post('/', async (context: any) => {
   try {
     const userId = context.user?.id;
     const transaccionData = context.body;

     const newTransaccion = await prisma.transaccion.create({
       data: {
         tipo: transaccionData.tipo,
         descripcion: transaccionData.descripcion,
         monto: transaccionData.monto,
         fecha: transaccionData.fecha ? new Date(transaccionData.fecha) : new Date(),
         categoria: transaccionData.categoria,
         referencia: transaccionData.referencia,
         usuarioId: userId
       }
     });

     return {
       success: true,
       data: {
         id: newTransaccion.id,
         fecha: newTransaccion.fecha.toISOString(),
         tipo: newTransaccion.tipo,
         categoria: newTransaccion.categoria || 'otros',
         descripcion: newTransaccion.descripcion,
         monto: newTransaccion.monto,
         comprobante: newTransaccion.referencia,
         usuarioId: newTransaccion.usuarioId,
         createdAt: newTransaccion.fechaCreacion,
         updatedAt: newTransaccion.fechaActualizacion,
       },
       message: 'Registro financiero creado exitosamente'
     } as ApiResponse<RegistroFinanciero>;
   } catch (error: any) {
     console.error('Create financial record error:', error);
     throw new Error('Error interno del servidor');
   }
 });

// Update financial record
finanzasRoutes.put('/:id', async (context: any) => {
   try {
     const userId = context.user?.id;
     const id = context.params.id;
     const transaccionData = context.body;

     const updatedTransaccion = await prisma.transaccion.update({
       where: {
         id: id,
         usuarioId: userId
       },
       data: {
         tipo: transaccionData.tipo,
         descripcion: transaccionData.descripcion,
         monto: transaccionData.monto,
         fecha: transaccionData.fecha ? new Date(transaccionData.fecha) : undefined,
         categoria: transaccionData.categoria,
         referencia: transaccionData.referencia,
       }
     });

     return {
       success: true,
       data: {
         id: updatedTransaccion.id,
         fecha: updatedTransaccion.fecha.toISOString(),
         tipo: updatedTransaccion.tipo,
         categoria: updatedTransaccion.categoria || 'otros',
         descripcion: updatedTransaccion.descripcion,
         monto: updatedTransaccion.monto,
         comprobante: updatedTransaccion.referencia,
         usuarioId: updatedTransaccion.usuarioId,
         createdAt: updatedTransaccion.fechaCreacion,
         updatedAt: updatedTransaccion.fechaActualizacion,
       },
       message: 'Registro financiero actualizado exitosamente'
     } as ApiResponse<RegistroFinanciero>;
   } catch (error: any) {
     console.error('Update financial record error:', error);
     if (error.code === 'P2025') {
       throw new Error('Registro financiero no encontrado');
     }
     throw new Error('Error interno del servidor');
   }
 });

// Delete financial record
finanzasRoutes.delete('/:id', async (context: any) => {
   try {
     const userId = context.user?.id;
     const id = context.params.id;

     await prisma.transaccion.delete({
       where: {
         id: id,
         usuarioId: userId
       }
     });

     return {
       success: true,
       message: 'Registro financiero eliminado exitosamente'
     } as ApiResponse;
   } catch (error: any) {
     console.error('Delete financial record error:', error);
     if (error.code === 'P2025') {
       throw new Error('Registro financiero no encontrado');
     }
     throw new Error('Error interno del servidor');
   }
 });

export default finanzasRoutes;