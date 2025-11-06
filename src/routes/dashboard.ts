import { Elysia } from 'elysia';
import { authenticateToken } from '../middleware/auth.js';
import type { ApiResponse, RegistroFinanciero } from '../types/apicola.js';
import { Moneda } from '../types/apicola.js';
import type { Transaccion, Inspeccion, Usuario, Colmena, Enjambre, Nucleo, InsumoApicola, Produccion, Producto, Apiario, Actividad } from '../generated/prisma/client.js';
import prisma from '../prisma/client.js';
import { CurrencyService } from '../services/currencyService.js';

const dashboardRoutes = new Elysia({ prefix: '/dashboard' });

// Get dashboard statistics
dashboardRoutes.get('/stats', async ({ headers }) => {
   try {
     console.log('🔍 DEBUG API: Solicitud a /dashboard/stats recibida');
     const user = await authenticateToken({ headers });
     const userId = user?.id;
     console.log('🔍 DEBUG API: User ID:', userId);

    // Get user's data from database including currency preference and role
    const [userData, colmenas, inspecciones, productos, producciones, transacciones, enjambres, nucleos, insumos, apiarios] = await Promise.all([
      prisma.usuario.findUnique({ where: { id: userId }, select: { moneda: true, rol: true } }),
      prisma.colmena.findMany({ where: { usuarioId: userId } }),
      prisma.inspeccion.findMany({ where: { usuarioId: userId } }),
      prisma.producto.findMany({ where: { usuarioId: userId } }),
      prisma.produccion.findMany({ where: { usuarioId: userId } }),
      prisma.transaccion.findMany({ where: { usuarioId: userId } }),
      prisma.enjambre.findMany({ where: { colmena: { usuarioId: userId } } }),
      prisma.nucleo.findMany({ where: { colmena: { usuarioId: userId } } }),
      prisma.insumoApicola.findMany({ where: { usuarioId: userId } }),
      prisma.apiario.findMany({ where: { usuarioId: userId } })
    ]);

    // Get user's currency preference and role (default to COP if not set)
    const userCurrency: Moneda = (userData?.moneda as Moneda) || Moneda.COP;
    const userRole = userData?.rol || 'apicultor';
    console.log('🔍 DEBUG API: User currency:', userCurrency, 'Role:', userRole);

    // Calculate statistics
    const colmenasActivas = colmenas.filter((c: Colmena) => c.estado === 'activa').length;
    const colmenasInactivas = colmenas.filter((c: Colmena) => c.estado === 'inactiva').length;

    const produccionTotal = productos.reduce((sum: number, p: Producto) => sum + p.cantidad, 0);

    const ingresos = transacciones
      .filter((t: Transaccion) => t.tipo === 'ingreso')
      .reduce((sum: number, t: Transaccion) => sum + t.monto, 0);

    const egresos = transacciones
      .filter((t: Transaccion) => t.tipo === 'egreso')
      .reduce((sum: number, t: Transaccion) => sum + t.monto, 0);

    // Convert financial values to user's currency (from COP base)
    const ingresosConversion = await CurrencyService.convert(ingresos, 'COP', userCurrency);
    const egresosConversion = await CurrencyService.convert(egresos, 'COP', userCurrency);
    const ingresosConvertidos = ingresosConversion.convertedAmount;
    const egresosConvertidos = egresosConversion.convertedAmount;
    const balanceConvertido = ingresosConvertidos - egresosConvertidos;

    // Recent inspections with issues
    const inspeccionesConProblemas = inspecciones.filter((i: Inspeccion) =>
      i.estadoSanidad === 'enferma' || i.estadoSanidad === 'cuarentena'
    ).length;

    // Pending inspections (mock calculation)
    const inspeccionesPendientes = Math.max(0, colmenasActivas - inspecciones.length);

    // Calculate enjambres statistics
    const enjambresActivos = enjambres.filter((e: Enjambre) => e.estado === 'activo').length;
    const enjambresInactivos = enjambres.filter((e: Enjambre) => e.estado === 'inactivo').length;
    const enjambresDivididos = enjambres.filter((e: Enjambre) => e.estado === 'dividido').length;
    const enjambresFusionados = enjambres.filter((e: Enjambre) => e.estado === 'fusionado').length;

    // Calculate nucleos statistics
    const nucleosTotal = nucleos.length;
    const nucleosPorEstado = nucleos.reduce((acc: Record<string, number>, n: Nucleo) => {
      acc[n.estado] = (acc[n.estado] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const nucleosPorTipo = nucleos.reduce((acc: Record<string, number>, n: Nucleo) => {
      acc[n.tipo] = (acc[n.tipo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate insumos statistics
    const insumosTotal = insumos.length;
    const insumosPorCategoria = insumos.reduce((acc: Record<string, number>, i: InsumoApicola) => {
      acc[i.categoria] = (acc[i.categoria] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const insumosStockBajo = insumos.filter((i: InsumoApicola) => i.cantidadActual < i.cantidadMinima).length;
    const insumosAgotados = insumos.filter((i: InsumoApicola) => i.cantidadActual <= 0).length;
    const insumosStockBueno = insumos.filter((i: InsumoApicola) => i.cantidadActual >= i.cantidadMinima).length;

    // Calculate apiarios statistics
    const apiariosTotal = apiarios.length;
    // Note: Apiario model doesn't have 'estado' field, so all are considered active
    const apiariosActivos = apiarios.length;
    const apiariosInactivos = 0;
    const apiariosPorUbicacion = apiarios.reduce((acc: Record<string, number>, a: Apiario) => {
      const ubicacion = `${a.ciudad}, ${a.pais}`;
      acc[ubicacion] = (acc[ubicacion] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate monthly production data
    const produccionMensual = productos.reduce((acc: Record<string, number>, p: Producto) => {
      const fechaProduccion = p.fechaProduccion || new Date();
      const mes = new Date(fechaProduccion).toISOString().slice(0, 7); // YYYY-MM format
      acc[mes] = (acc[mes] || 0) + p.cantidad;
      return acc;
    }, {} as Record<string, number>);

    // Calculate production by type from producciones table
    const produccionPorTipo = producciones.reduce((acc: Record<string, number>, p: Produccion) => {
      const tipo = p.tipoProducto;
      acc[tipo] = (acc[tipo] || 0) + p.cantidad;
      return acc;
    }, {} as Record<string, number>);

    // Calculate total productions count
    const totalProducciones = producciones.length;

    // Convert to array format for frontend, last 12 months
    const meses = [];
    const fechaActual = new Date();
    for (let i = 11; i >= 0; i--) {
      const fecha = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - i, 1);
      const mesKey = fecha.toISOString().slice(0, 7);
      const nombreMes = fecha.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
      meses.push({
        mes: nombreMes,
        produccion: produccionMensual[mesKey] || 0
      });
    }

    // Calculate users statistics (only for administrators)
    let usuariosStats: { total: number; activos: number; porRol: Record<string, number> } | null = null;
    if (userRole === 'administrador') {
      const usuarios = await prisma.usuario.findMany();
      const usuariosActivos = usuarios.filter((u: Usuario) => u.activo).length;
      const usuariosPorRol = usuarios.reduce((acc: Record<string, number>, u: Usuario) => {
        acc[u.rol] = (acc[u.rol] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      usuariosStats = {
        total: usuarios.length,
        activos: usuariosActivos,
        porRol: usuariosPorRol
      };
    }

    const stats = {
      colmenas: {
        total: colmenas.length,
        activas: colmenasActivas,
        inactivas: colmenasInactivas
      },
      produccion: {
        totalKg: produccionTotal,
        promedioColmena: colmenasActivas > 0 ? produccionTotal / colmenasActivas : 0,
        totalProducciones: totalProducciones,
        porTipo: produccionPorTipo
      },
      sanidad: {
        inspeccionesRealizadas: inspecciones.length,
        inspeccionesPendientes,
        colmenasConProblemas: inspeccionesConProblemas
      },
      enjambres: {
        total: enjambres.length,
        activos: enjambresActivos,
        inactivos: enjambresInactivos,
        divididos: enjambresDivididos,
        fusionados: enjambresFusionados
      },
      nucleos: {
        total: nucleosTotal,
        porEstado: nucleosPorEstado,
        porTipo: nucleosPorTipo
      },
      insumos: {
        total: insumosTotal,
        porCategoria: insumosPorCategoria,
        stockBajo: insumosStockBajo,
        agotados: insumosAgotados,
        stockBueno: insumosStockBueno
      },
      apiarios: {
        total: apiariosTotal,
        activos: apiariosActivos,
        inactivos: apiariosInactivos,
        porUbicacion: apiariosPorUbicacion
      },
      finanzas: {
        ingresos: ingresosConvertidos,
        egresos: egresosConvertidos,
        balance: balanceConvertido,
        moneda: userCurrency
      },
      produccionMensual: meses,
      ...(usuariosStats && { usuarios: usuariosStats })
    };

    console.log('🔍 DEBUG API: Stats calculados:', stats);
    return {
      success: true,
      data: stats,
      message: 'Estadísticas del dashboard obtenidas exitosamente'
    } as ApiResponse;
  } catch (error: unknown) {
    console.error('❌ ERROR API: Get dashboard stats error:', error);
    console.error('❌ ERROR API: Stack trace:', error instanceof Error ? error.stack : error);
    throw new Error('Error interno del servidor');
  }
});

// Get recent activities
dashboardRoutes.get('/activities', async ({ headers }) => {
    try {
      console.log('🔍 DEBUG API: Solicitud a /dashboard/activities recibida');
      const user = await authenticateToken({ headers });
      const userId = user?.id;
      console.log('🔍 DEBUG API: User ID:', userId);

      // Get recent activities from database
      const activities = await prisma.actividad.findMany({
        where: { usuarioId: userId },
        orderBy: { fechaCreacion: 'desc' },
        take: 10,
        include: {
          usuario: false // No need to include user data
        }
      });

      // Format activities for frontend
      const formattedActivities = activities.map((activity) => ({
        id: activity.id,
        tipo: activity.tipo,
        titulo: activity.titulo,
        mensaje: activity.descripcion,
        entidadNombre: activity.entidadNombre,
        fecha: activity.fechaCreacion.toISOString().split('T')[0],
        estado: activity.estado
      }));

      console.log('🔍 DEBUG API: Activities obtenidas:', formattedActivities);
      return {
        success: true,
        data: formattedActivities,
        message: 'Actividades recientes obtenidas exitosamente'
      } as ApiResponse;
    } catch (error: unknown) {
      console.error('❌ ERROR API: Get recent activities error:', error);
      console.error('❌ ERROR API: Stack trace:', error instanceof Error ? error.stack : error);
      throw new Error('Error interno del servidor');
    }
  });

export default dashboardRoutes;