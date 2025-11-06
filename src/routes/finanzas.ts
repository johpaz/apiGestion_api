import { Elysia } from 'elysia';
import { authGuard } from '../middleware/auth.js';
import type { ApiResponse, RegistroFinanciero } from '../types/apicola.js';
import type { Transaccion } from '../generated/prisma/client.js';
import { TipoTransaccion } from '../generated/prisma/enums.js';
import prisma from '../prisma/client.js';

interface TransaccionInput {
  tipo: TipoTransaccion;
  descripcion: string;
  monto: number;
  fecha?: string;
  categoria?: string;
  referencia?: string;
}

interface MonthlyRow {
  mes: string;
  ingresos: string;
  egresos: string;
}

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
      data: transacciones.map((t: Transaccion) => ({
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
      .filter((t: Transaccion) => t.tipo === 'ingreso')
      .reduce((sum: number, t: Transaccion) => sum + t.monto, 0);

    const egresos = transacciones
      .filter((t: Transaccion) => t.tipo === 'egreso')
      .reduce((sum: number, t: Transaccion) => sum + t.monto, 0);

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

// Get monthly financial summary for current year
finanzasRoutes.get('/mensual', async (context: any) => {
  try {
    const userId = context.user?.id;
    const currentYear = new Date().getFullYear();

    const monthlyData = await prisma.$queryRaw`
      SELECT
        EXTRACT(MONTH FROM fecha) as mes,
        SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) as ingresos,
        SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) as egresos
      FROM transacciones
      WHERE "usuarioId" = ${userId} AND EXTRACT(YEAR FROM fecha) = ${currentYear}
      GROUP BY EXTRACT(MONTH FROM fecha)
      ORDER BY mes
    `;

    // Initialize array with 12 months, all with 0 values
    const monthlySummary = Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      ingresos: 0,
      egresos: 0,
      balance: 0
    }));

    // Fill in the data from query results
    (monthlyData as MonthlyRow[]).forEach((row: MonthlyRow) => {
      const mesIndex = parseInt(row.mes) - 1;
      monthlySummary[mesIndex].ingresos = parseFloat(row.ingresos) || 0;
      monthlySummary[mesIndex].egresos = parseFloat(row.egresos) || 0;
      monthlySummary[mesIndex].balance = monthlySummary[mesIndex].ingresos - monthlySummary[mesIndex].egresos;
    });

    return {
      success: true,
      data: monthlySummary,
      message: 'Resumen financiero mensual obtenido exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Get monthly financial summary error:', error);
    throw new Error('Error interno del servidor');
  }
});

// Create new financial record
finanzasRoutes.post('/', async (context: any) => {
   try {
     const userId = context.user?.id;
     const transaccionData: TransaccionInput = context.body;

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
     const transaccionData: TransaccionInput = context.body;

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