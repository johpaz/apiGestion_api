import { Elysia } from 'elysia';
import { authGuard } from '../middleware/auth';
import { requireRole } from '../middleware/authorization';
import prisma from '../prisma/client';

const SETTINGS_ID = 'principal';

const defaultSettings = {
  appName: 'ApiColmena Pro',
  maintenanceMode: false,
  allowRegistration: true,
  defaultLanguage: 'es',
  defaultCurrency: 'COP' as const,
  timezone: 'America/Bogota',
  dateFormat: 'DD/MM/YYYY',
  emailNotifications: true,
  pushNotifications: true,
  maintenanceAlerts: true,
};

const adminRoutes = new Elysia({ prefix: '/admin' }).use(authGuard);

adminRoutes.get('/dashboard', async (context: any) => {
  await requireRole(['administrador'])(context.user);

  const since = new Date();
  since.setMonth(since.getMonth() - 5, 1);
  since.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    activeUsers,
    usersByRole,
    colmenas,
    apiarios,
    production,
    transactions,
    pendingAlerts,
    recentUsers,
    monthlyRows,
  ] = await Promise.all([
    prisma.usuario.count(),
    prisma.usuario.count({ where: { activo: true } }),
    prisma.usuario.groupBy({ by: ['rol'], _count: { _all: true } }),
    prisma.colmena.count(),
    prisma.apiario.count(),
    prisma.produccion.aggregate({ _sum: { cantidad: true } }),
    prisma.transaccion.groupBy({ by: ['tipo'], where: { anuladoAt: null }, _sum: { monto: true } }),
    prisma.alerta.count({ where: { leida: false, activa: true } }),
    prisma.usuario.findMany({
      orderBy: { fechaRegistro: 'desc' },
      take: 5,
      select: { id: true, nombre: true, email: true, rol: true, activo: true, fechaRegistro: true },
    }),
    prisma.produccion.findMany({
      where: { fecha: { gte: since } },
      select: { fecha: true, cantidad: true },
      orderBy: { fecha: 'asc' },
    }),
  ]);

  const roles = { apicultor: 0, administrador: 0 };
  for (const row of usersByRole) roles[row.rol] = row._count._all;

  const finances = { ingresos: 0, egresos: 0 };
  for (const row of transactions) {
    if (row.tipo === 'ingreso') finances.ingresos = row._sum.monto ?? 0;
    if (row.tipo === 'egreso') finances.egresos = row._sum.monto ?? 0;
  }

  const monthFormatter = new Intl.DateTimeFormat('es-CO', { month: 'short' });
  const monthlyProduction = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(since.getFullYear(), since.getMonth() + index, 1);
    const kg = monthlyRows
      .filter((row) => row.fecha.getFullYear() === date.getFullYear() && row.fecha.getMonth() === date.getMonth())
      .reduce((sum, row) => sum + row.cantidad, 0);
    return { month: monthFormatter.format(date).replace('.', ''), kg };
  });

  return {
    success: true,
    data: {
      totals: {
        usuarios: totalUsers,
        usuariosActivos: activeUsers,
        colmenas,
        apiarios,
        produccionKg: production._sum.cantidad ?? 0,
        ingresos: finances.ingresos,
        egresos: finances.egresos,
        alertasPendientes: pendingAlerts,
      },
      usersByRole: roles,
      monthlyProduction,
      recentUsers,
    },
  };
});

adminRoutes.get('/settings', async (context: any) => {
  await requireRole(['administrador'])(context.user);
  const settings = await prisma.configuracionSistema.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...defaultSettings },
    update: {},
  });
  return { success: true, data: settings };
});

adminRoutes.put('/settings', async (context: any) => {
  await requireRole(['administrador'])(context.user);
  const body = context.body ?? {};
  const currencies = ['COP', 'USD', 'EUR'];
  const languages = ['es', 'en'];
  const dateFormats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

  if (
    typeof body.appName !== 'string' || body.appName.trim().length < 2 || body.appName.trim().length > 80 ||
    typeof body.maintenanceMode !== 'boolean' || typeof body.allowRegistration !== 'boolean' ||
    !languages.includes(body.defaultLanguage) || !currencies.includes(body.defaultCurrency) ||
    typeof body.timezone !== 'string' || body.timezone.length > 80 || !dateFormats.includes(body.dateFormat) ||
    typeof body.emailNotifications !== 'boolean' || typeof body.pushNotifications !== 'boolean' ||
    typeof body.maintenanceAlerts !== 'boolean'
  ) {
    context.set.status = 400;
    return { success: false, error: 'Configuración inválida' };
  }

  const data = {
    appName: body.appName.trim(),
    maintenanceMode: body.maintenanceMode,
    allowRegistration: body.allowRegistration,
    defaultLanguage: body.defaultLanguage,
    defaultCurrency: body.defaultCurrency,
    timezone: body.timezone.trim(),
    dateFormat: body.dateFormat,
    emailNotifications: body.emailNotifications,
    pushNotifications: body.pushNotifications,
    maintenanceAlerts: body.maintenanceAlerts,
    updatedBy: context.user.id,
  };
  const settings = await prisma.configuracionSistema.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  return { success: true, data: settings, message: 'Configuración actualizada' };
});

export default adminRoutes;
