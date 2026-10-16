import { Elysia } from 'elysia';
import { authenticateToken } from '../middleware/auth';
import { AuthenticationError, AuthorizationError, requireRole } from '../middleware/authorization';
import { ApiResponse, RegistroFinanciero, Moneda } from '../types/apicola';
import { sql, type Row } from '../db';
import { CurrencyService } from '../services/currencyService';

// Filas de la base de datos
type Transaccion = Row & { tipo: string; monto: number };
type Inspeccion = Row & { estadoSanidad: string };
type Usuario = Row & { activo: boolean; rol: string };
type Colmena = Row & { estado: string };
type Enjambre = Row & { estado: string };
type Nucleo = Row & { estado: string; tipo: string };
type InsumoApicola = Row & { categoria: string; cantidadActual: number; cantidadMinima: number };
type Produccion = Row & { tipoProducto: string };
type Producto = Row & { cantidad: number; fechaProduccion: Date | null };
type Apiario = Row & { ciudad: string; pais: string };
type Actividad = Row & { fechaCreacion: Date };

const dashboardRoutes = new Elysia({ prefix: '/dashboard' });

// Get dashboard statistics
dashboardRoutes.get('/stats', async ({ headers }) => {
   try {
     console.log('🔍 DEBUG API: Solicitud a /dashboard/stats recibida');
     const user = await requireRole(['apicultor'])(await authenticateToken({ headers }));
     const userId = user?.id;
     console.log('🔍 DEBUG API: User ID:', userId);

    // Get user's data from database including currency preference and role
    const [userData, colmenas, inspecciones, productos, producciones, transacciones, enjambres, nucleos, insumos, apiarios] = await Promise.all([
      sql`SELECT moneda, rol FROM usuarios WHERE id = ${userId}`.then((r: Row[]) => r[0] ?? null),
      sql`SELECT * FROM colmenas WHERE "usuarioId" = ${userId}`,
      sql`SELECT * FROM inspecciones WHERE "usuarioId" = ${userId}`,
      sql`SELECT * FROM productos WHERE "usuarioId" = ${userId}`,
      sql`SELECT * FROM producciones WHERE "usuarioId" = ${userId}`,
      sql`SELECT * FROM transacciones WHERE "usuarioId" = ${userId} AND "anuladoAt" IS NULL`,
      sql`SELECT e.* FROM enjambres e JOIN colmenas c ON c.id = e."colmenaId" WHERE c."usuarioId" = ${userId}`,
      sql`SELECT n.* FROM nucleos n JOIN apiarios a ON a.id = n."apiarioId" WHERE a."usuarioId" = ${userId}`,
      sql`SELECT * FROM insumos_apicola WHERE "usuarioId" = ${userId}`,
      sql`SELECT * FROM apiarios WHERE "usuarioId" = ${userId}`
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
    const insumosStockBajo = insumos.filter((i: InsumoApicola) => i.cantidadActual > 0 && i.cantidadActual < i.cantidadMinima).length;
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
      const usuarios = await sql`SELECT id, activo, rol FROM usuarios`;
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

    const distribucionSanidad = inspecciones
      .filter((inspection) => !inspection.anuladoAt)
      .reduce((distribution: Record<string, number>, inspection) => {
        distribution[inspection.estadoSanidad] = (distribution[inspection.estadoSanidad] || 0) + 1;
        return distribution;
      }, {});

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
        distribucionSanidad,
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
      if (error instanceof AuthenticationError || error instanceof AuthorizationError) throw error;
    console.error('❌ ERROR API: Get dashboard stats error:', error);
    console.error('❌ ERROR API: Stack trace:', error instanceof Error ? error.stack : error);
    throw new Error('Error interno del servidor');
  }
});

// Get recent activities
dashboardRoutes.get('/activities', async ({ headers }) => {
    try {
      console.log('🔍 DEBUG API: Solicitud a /dashboard/activities recibida');
      const user = await requireRole(['apicultor'])(await authenticateToken({ headers }));
      const userId = user?.id;
      console.log('🔍 DEBUG API: User ID:', userId);

      // Get recent activities from database
      const activities = await sql`SELECT * FROM actividades WHERE "usuarioId" = ${userId} ORDER BY "fechaCreacion" DESC LIMIT 10`;

      // Format activities for frontend
      const formattedActivities = activities.map((activity: Actividad) => ({
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
      if (error instanceof AuthenticationError || error instanceof AuthorizationError) throw error;
      console.error('❌ ERROR API: Get recent activities error:', error);
      console.error('❌ ERROR API: Stack trace:', error instanceof Error ? error.stack : error);
      throw new Error('Error interno del servidor');
    }
  });

export default dashboardRoutes;
