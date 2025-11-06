import { Elysia } from 'elysia';
import { authGuard } from '../middleware/auth';
import type { ApiResponse } from '../types/apicola';
import prisma from '../prisma/client';

const reportesRoutes = new Elysia({ prefix: '/reportes' })
  .use(authGuard);

// GET /metrics?year={year} - Retorna métricas resumen: totalProduccion, colmenasActivas, promedioPorColmena, mejorMes
reportesRoutes.get('/metrics', async (context: any) => {
  try {
    const userId = context.user?.id;
    const year = parseInt(context.query.year);

    if (!year || isNaN(year)) {
      throw new Error('Año inválido');
    }

    // Total producción de miel en el año
    const totalProduccionResult = await prisma.produccion.aggregate({
      where: {
        usuarioId: userId,
        tipoProducto: 'miel',
        fecha: {
          gte: new Date(year, 0, 1),
          lt: new Date(year + 1, 0, 1)
        }
      },
      _sum: {
        cantidad: true
      }
    });

    const totalProduccion = totalProduccionResult._sum.cantidad || 0;

    // Colmenas activas
    const colmenasActivas = await prisma.colmena.count({
      where: {
        usuarioId: userId,
        estado: 'activa'
      }
    });

    const promedioPorColmena = colmenasActivas > 0 ? totalProduccion / colmenasActivas : 0;

    // Mejor mes
    const mejorMesResult = await prisma.$queryRaw`
      SELECT EXTRACT(MONTH FROM "fecha") as mes, SUM("cantidad") as total
      FROM producciones
      WHERE "usuarioId" = ${userId} AND "tipoProducto" = 'miel' AND EXTRACT(YEAR FROM "fecha") = ${year}
      GROUP BY EXTRACT(MONTH FROM "fecha")
      ORDER BY total DESC
      LIMIT 1
    `;

    const mejorMes = (mejorMesResult as any[])[0]?.mes || null;

    return {
      success: true,
      data: {
        totalProduccion,
        colmenasActivas,
        promedioPorColmena,
        mejorMes: mejorMes ? parseInt(mejorMes) : null
      },
      message: 'Métricas obtenidas exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Get metrics error:', error);
    throw new Error('Error interno del servidor');
  }
});

// GET /produccion-mensual?year={year} - Array de producción mensual con mes, kg, colmenas
reportesRoutes.get('/produccion-mensual', async (context: any) => {
  try {
    const userId = context.user?.id;
    const year = parseInt(context.query.year);

    if (!year || isNaN(year)) {
      throw new Error('Año inválido');
    }

    const monthlyData = await prisma.$queryRaw`
      SELECT
        EXTRACT(MONTH FROM p."fecha") as mes,
        COALESCE(SUM(p."cantidad"), 0) as kg,
        COUNT(DISTINCT p."colmenaId") as colmenas
      FROM producciones p
      WHERE p."usuarioId" = ${userId} AND p."tipoProducto" = 'miel' AND EXTRACT(YEAR FROM p."fecha") = ${year}
      GROUP BY EXTRACT(MONTH FROM p."fecha")
      ORDER BY mes
    `;

    // Initialize array with 12 months
    const monthlySummary = Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      kg: 0,
      colmenas: 0
    }));

    // Fill in the data
    (monthlyData as any[]).forEach((row: any) => {
      const mesIndex = parseInt(row.mes) - 1;
      monthlySummary[mesIndex].kg = parseFloat(row.kg) || 0;
      monthlySummary[mesIndex].colmenas = parseInt(row.colmenas) || 0;
    });

    return {
      success: true,
      data: monthlySummary,
      message: 'Producción mensual obtenida exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Get produccion-mensual error:', error);
    throw new Error('Error interno del servidor');
  }
});

// GET /produccion-apiarios?year={year} - Array de producción por apiario con apiario, kg, colmenas
reportesRoutes.get('/produccion-apiarios', async (context: any) => {
  try {
    const userId = context.user?.id;
    const year = parseInt(context.query.year);

    if (!year || isNaN(year)) {
      throw new Error('Año inválido');
    }

    const apiariosData = await prisma.$queryRaw`
      SELECT
        a."nombre" as apiario,
        COALESCE(SUM(p."cantidad"), 0) as kg,
        COUNT(DISTINCT p."colmenaId") as colmenas
      FROM apiarios a
      LEFT JOIN producciones p ON a.id = p."apiarioId" AND p."usuarioId" = ${userId} AND p."tipoProducto" = 'miel' AND EXTRACT(YEAR FROM p."fecha") = ${year}
      WHERE a."usuarioId" = ${userId}
      GROUP BY a.id, a."nombre"
      ORDER BY kg DESC
    `;

    return {
      success: true,
      data: (apiariosData as any[]).map(row => ({
        apiario: row.apiario,
        kg: parseFloat(row.kg) || 0,
        colmenas: parseInt(row.colmenas) || 0
      })),
      message: 'Producción por apiarios obtenida exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Get produccion-apiarios error:', error);
    throw new Error('Error interno del servidor');
  }
});

// GET /estado-sanitario - Distribución porcentual de estados sanitarios de colmenas
reportesRoutes.get('/estado-sanitario', async (context: any) => {
  try {
    const userId = context.user?.id;

    const totalColmenas = await prisma.colmena.count({
      where: { usuarioId: userId }
    });

    if (totalColmenas === 0) {
      return {
        success: true,
        data: [],
        message: 'No hay colmenas para mostrar estado sanitario'
      } as ApiResponse;
    }

    // Get latest inspection for each colmena
    const estadoSanitarioData = await prisma.$queryRaw`
      SELECT
        i."estadoSanidad",
        COUNT(*) as count
      FROM inspecciones i
      INNER JOIN (
        SELECT "colmenaId", MAX("fecha") as max_fecha
        FROM inspecciones
        WHERE "usuarioId" = ${userId}
        GROUP BY "colmenaId"
      ) latest ON i."colmenaId" = latest."colmenaId" AND i."fecha" = latest.max_fecha
      WHERE i."usuarioId" = ${userId}
      GROUP BY i."estadoSanidad"
    `;

    const data = (estadoSanitarioData as any[]).map(row => ({
      estado: row.estadoSanidad,
      count: parseInt(row.count),
      porcentaje: Math.round((parseInt(row.count) / totalColmenas) * 100)
    }));

    return {
      success: true,
      data,
      message: 'Estado sanitario obtenido exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Get estado-sanitario error:', error);
    throw new Error('Error interno del servidor');
  }
});

// GET /tendencia-anual - Tendencia histórica anual de producción y colmenas (2020-2024)
reportesRoutes.get('/tendencia-anual', async (context: any) => {
  try {
    const userId = context.user?.id;

    const tendenciaData = await prisma.$queryRaw`
      SELECT
        EXTRACT(YEAR FROM p."fecha") as year,
        COALESCE(SUM(p."cantidad"), 0) as produccion,
        COUNT(DISTINCT c.id) as colmenas
      FROM producciones p
      CROSS JOIN colmenas c
      WHERE p."usuarioId" = ${userId} AND p."tipoProducto" = 'miel'
        AND c."usuarioId" = ${userId}
        AND EXTRACT(YEAR FROM p."fecha") BETWEEN 2020 AND 2024
        AND EXTRACT(YEAR FROM c."fechaCreacion") <= EXTRACT(YEAR FROM p."fecha")
      GROUP BY EXTRACT(YEAR FROM p."fecha")
      ORDER BY year
    `;

    // Initialize with years 2020-2024
    const tendencia = Array.from({ length: 5 }, (_, i) => ({
      year: 2020 + i,
      produccion: 0,
      colmenas: 0
    }));

    // Fill in the data
    (tendenciaData as any[]).forEach((row: any) => {
      const yearIndex = parseInt(row.year) - 2020;
      if (yearIndex >= 0 && yearIndex < 5) {
        tendencia[yearIndex].produccion = parseFloat(row.produccion) || 0;
        tendencia[yearIndex].colmenas = parseInt(row.colmenas) || 0;
      }
    });

    return {
      success: true,
      data: tendencia,
      message: 'Tendencia anual obtenida exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Get tendencia-anual error:', error);
    throw new Error('Error interno del servidor');
  }
});

export default reportesRoutes;