import { Elysia } from 'elysia';
import { authGuard } from '../middleware/auth';
import { requireRole } from '../middleware/authorization';
import { sql, upsert, type Row } from '../db';

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
    sql`SELECT count(*)::int AS n FROM usuarios`.then(r => r[0].n as number),
    sql`SELECT count(*)::int AS n FROM usuarios WHERE activo = true`.then(r => r[0].n as number),
    sql`SELECT rol, count(*)::int AS n FROM usuarios GROUP BY rol`,
    sql`SELECT count(*)::int AS n FROM colmenas`.then(r => r[0].n as number),
    sql`SELECT count(*)::int AS n FROM apiarios`.then(r => r[0].n as number),
    sql`SELECT sum(cantidad)::float AS total FROM producciones`.then(r => ({ _sum: { cantidad: r[0].total as number | null } })),
    sql`SELECT tipo, sum(monto)::float AS total FROM transacciones WHERE "anuladoAt" IS NULL GROUP BY tipo`,
    sql`SELECT count(*)::int AS n FROM alertas WHERE leida = false AND activa = true`.then(r => r[0].n as number),
    sql`SELECT id, nombre, email, rol, activo, "fechaRegistro" FROM usuarios ORDER BY "fechaRegistro" DESC LIMIT 5`,
    sql`SELECT fecha, cantidad FROM producciones WHERE fecha >= ${since} ORDER BY fecha ASC`,
  ]);

  const roles: Record<string, number> = { apicultor: 0, administrador: 0 };
  for (const row of usersByRole) roles[row.rol] = row.n;

  const finances = { ingresos: 0, egresos: 0 };
  for (const row of transactions as Row[]) {
    if (row.tipo === 'ingreso') finances.ingresos = row.total ?? 0;
    if (row.tipo === 'egreso') finances.egresos = row.total ?? 0;
  }

  const monthFormatter = new Intl.DateTimeFormat('es-CO', { month: 'short' });
  const monthlyProduction = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(since.getFullYear(), since.getMonth() + index, 1);
    const kg = monthlyRows
      .filter((row: Row) => row.fecha.getFullYear() === date.getFullYear() && row.fecha.getMonth() === date.getMonth())
      .reduce((sum: number, row: Row) => sum + row.cantidad, 0);
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
  await sql`INSERT INTO configuracion_sistema ${sql({ id: SETTINGS_ID, ...defaultSettings, updatedAt: new Date() })} ON CONFLICT (id) DO NOTHING`;
  const [settings] = await sql`SELECT * FROM configuracion_sistema WHERE id = ${SETTINGS_ID}`;
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
  const settings = await upsert('configuracion_sistema', ['id'], { id: SETTINGS_ID, ...data }, data);
  return { success: true, data: settings, message: 'Configuración actualizada' };
});

export default adminRoutes;
