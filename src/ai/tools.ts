import { sql, type Row } from '../db';

/**
 * Catálogo de herramientas de datos para los agentes (y para el servidor MCP v2).
 *
 * Reglas que no se negocian:
 *  - Todas son de SOLO LECTURA: el agente conversa con los datos, no los modifica.
 *  - Cada consulta se filtra por el usuario autenticado (`ctx.userId`); el modelo nunca
 *    elige de quién son los datos. Las `admin_*` exigen rol administrador y devuelven
 *    agregados (sin contraseñas ni claves).
 *  - Los argumentos del modelo se normalizan (límites, fechas, enums) antes de tocar SQL
 *    y siempre viajan como parámetros, nunca concatenados.
 */

export type Audience = 'apicultor' | 'administrador';

export interface ToolContext {
  userId: string;
  rol: Audience;
}

export interface DataTool {
  name: string;
  description: string;
  audience: Audience;
  parameters: {
    type: 'object';
    properties: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

// ─── Normalización de argumentos ────────────────────────────────────────────

export const MAX_ROWS = 50;

export function limitOf(value: unknown, fallback = 20): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, MAX_ROWS);
}

/** ISO `YYYY-MM-DD` (o fecha-hora) → Date; cualquier otra cosa se ignora. */
export function dateOf(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function idOf(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

const round = (n: unknown, d = 2) => {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : 0;
};

/** Rango de fechas opcional sobre la columna `fecha` del alias dado (lista cerrada: nunca texto del modelo). */
function between(alias: 'i' | 'p' | 't', from: Date | null, to: Date | null) {
  const column = alias === 'i' ? sql`i.fecha` : alias === 'p' ? sql`p.fecha` : sql`t.fecha`;
  const lower = from ? sql`AND ${column} >= ${from}` : sql``;
  const upper = to ? sql`AND ${column} <= ${to}` : sql``;
  return sql`${lower} ${upper}`;
}

const DATE_PROPS = {
  desde: { type: 'string', description: 'Fecha inicial ISO (YYYY-MM-DD), opcional' },
  hasta: { type: 'string', description: 'Fecha final ISO (YYYY-MM-DD), opcional' },
};

const LIMIT_PROP = {
  limite: { type: 'integer', description: `Máximo de filas (1-${MAX_ROWS}, por defecto 20)` },
};

const none = { type: 'object', properties: {} } as const;

// ─── Herramientas del apicultor ─────────────────────────────────────────────

const apicultorTools: DataTool[] = [
  {
    name: 'apiario_resumen_general',
    audience: 'apicultor',
    description:
      'Foto general del negocio del apicultor: cuántos apiarios, colmenas (por estado), núcleos, ' +
      'enjambres, casos sanitarios abiertos, alertas sin leer e insumos bajo el mínimo. Úsala primero para orientarte.',
    parameters: none,
    async run({ userId }) {
      const [apiarios, colmenas, nucleos, enjambres, casos, alertas, insumos, usuario] = await Promise.all([
        sql`SELECT count(*)::int AS n FROM apiarios WHERE "usuarioId" = ${userId}`,
        sql`SELECT estado, count(*)::int AS n FROM colmenas WHERE "usuarioId" = ${userId} GROUP BY estado`,
        sql`SELECT n.estado, count(*)::int AS n FROM nucleos n JOIN apiarios a ON a.id = n."apiarioId"
            WHERE a."usuarioId" = ${userId} GROUP BY n.estado`,
        sql`SELECT e.estado, count(*)::int AS n FROM enjambres e JOIN colmenas c ON c.id = e."colmenaId"
            WHERE c."usuarioId" = ${userId} GROUP BY e.estado`,
        sql`SELECT count(*)::int AS n FROM casos_sanitarios
            WHERE "usuarioId" = ${userId} AND "anuladoAt" IS NULL AND estado IN ('abierto','en_seguimiento')`,
        sql`SELECT count(*)::int AS n FROM alertas WHERE "usuarioId" = ${userId} AND leida = false AND activa = true`,
        sql`SELECT count(*)::int AS n FROM insumos_apicola
            WHERE "usuarioId" = ${userId} AND "anuladoAt" IS NULL AND "tipoItem" = 'insumo' AND "cantidadActual" <= "cantidadMinima"`,
        sql`SELECT moneda FROM usuarios WHERE id = ${userId}`,
      ]);
      const byState = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.estado, r.n]));
      return {
        moneda: usuario[0]?.moneda ?? 'COP',
        apiarios: apiarios[0].n,
        colmenasPorEstado: byState(colmenas),
        nucleosPorEstado: byState(nucleos),
        enjambresPorEstado: byState(enjambres),
        casosSanitariosAbiertos: casos[0].n,
        alertasSinLeer: alertas[0].n,
        insumosBajoMinimo: insumos[0].n,
      };
    },
  },
  {
    name: 'apiario_listar',
    audience: 'apicultor',
    description:
      'Lista los apiarios del apicultor con su ubicación, número de colmenas y vigencia del registro ICA.',
    parameters: { type: 'object', properties: { ...LIMIT_PROP } },
    async run({ userId }, args) {
      const rows = await sql`
        SELECT a.id, a.nombre, a.ciudad, a.pais, a.direccion,
               a."registroIcaNumero", a."registroIcaVenceEn",
               (SELECT count(*)::int FROM colmenas c WHERE c."apiarioId" = a.id) AS colmenas,
               (SELECT count(*)::int FROM nucleos n WHERE n."apiarioId" = a.id) AS nucleos
        FROM apiarios a WHERE a."usuarioId" = ${userId}
        ORDER BY a.nombre LIMIT ${limitOf(args.limite)}`;
      const now = Date.now();
      return rows.map((a: Row) => ({
        ...a,
        registroIcaVigente: a.registroIcaVenceEn ? new Date(a.registroIcaVenceEn).getTime() >= now : null,
      }));
    },
  },
  {
    name: 'colmena_listar',
    audience: 'apicultor',
    description:
      'Lista colmenas del apicultor con estado, cuadros, reina y apiario. Filtra por apiario o estado.',
    parameters: {
      type: 'object',
      properties: {
        apiarioId: { type: 'string', description: 'Id del apiario (opcional)' },
        estado: { type: 'string', enum: ['activa', 'inactiva', 'abandonada', 'destruida'], description: 'Estado (opcional)' },
        ...LIMIT_PROP,
      },
    },
    async run({ userId }, args) {
      const apiarioId = idOf(args.apiarioId);
      const estado = oneOf(args.estado, ['activa', 'inactiva', 'abandonada', 'destruida'] as const);
      return sql`
        SELECT c.id, c.nombre, c.estado, c.cuadros, c.reyna, c."tipoReyna", c."fechaReyna",
               c."fechaInstalacion", a.nombre AS apiario, c."apiarioId"
        FROM colmenas c JOIN apiarios a ON a.id = c."apiarioId"
        WHERE c."usuarioId" = ${userId}
          ${apiarioId ? sql`AND c."apiarioId" = ${apiarioId}` : sql``}
          ${estado ? sql`AND c.estado = ${estado}` : sql``}
        ORDER BY a.nombre, c.nombre LIMIT ${limitOf(args.limite)}`;
    },
  },
  {
    name: 'colmena_detalle',
    audience: 'apicultor',
    description:
      'Ficha completa de UNA colmena: datos, últimas inspecciones, producción acumulada y casos sanitarios que la involucran.',
    parameters: {
      type: 'object',
      properties: { colmenaId: { type: 'string', description: 'Id de la colmena' } },
      required: ['colmenaId'],
    },
    async run({ userId }, args) {
      const id = idOf(args.colmenaId);
      if (!id) return { error: 'colmenaId inválido' };
      const [colmena] = await sql`
        SELECT c.*, a.nombre AS apiario FROM colmenas c JOIN apiarios a ON a.id = c."apiarioId"
        WHERE c.id = ${id} AND c."usuarioId" = ${userId}`;
      if (!colmena) return { error: 'Colmena no encontrada' };
      const [inspecciones, produccion, casos] = await Promise.all([
        sql`SELECT i.id, i.fecha, i."estadoSanidad", i.observaciones, i."posiblesEnfermedades", i."proximaRevision"
            FROM inspecciones i
            WHERE i."usuarioId" = ${userId} AND i."anuladoAt" IS NULL
              AND EXISTS (SELECT 1 FROM "_ColmenaToInspeccion" r WHERE r."B" = i.id AND r."A" = ${id})
            ORDER BY i.fecha DESC LIMIT 5`,
        sql`SELECT "tipoProducto", sum(cantidad)::float AS total, max(unidad) AS unidad
            FROM producciones WHERE "usuarioId" = ${userId} AND "colmenaId" = ${id} GROUP BY "tipoProducto"`,
        sql`SELECT cs.id, cs.codigo, cs.titulo, cs.estado, cs.gravedad
            FROM casos_sanitarios cs JOIN casos_sanitarios_objetivos o ON o."casoId" = cs.id
            WHERE cs."usuarioId" = ${userId} AND cs."anuladoAt" IS NULL AND o."colmenaId" = ${id}
            ORDER BY cs."fechaApertura" DESC LIMIT 5`,
      ]);
      return { colmena, ultimasInspecciones: inspecciones, produccionAcumulada: produccion, casosSanitarios: casos };
    },
  },
  {
    name: 'inspeccion_listar',
    audience: 'apicultor',
    description:
      'Inspecciones del apicultor, más recientes primero. Permite filtrar por colmena, estado sanitario y rango de fechas.',
    parameters: {
      type: 'object',
      properties: {
        colmenaId: { type: 'string', description: 'Id de la colmena (opcional)' },
        estadoSanidad: { type: 'string', enum: ['saludable', 'enferma', 'tratada', 'cuarentena'] },
        ...DATE_PROPS,
        ...LIMIT_PROP,
      },
    },
    async run({ userId }, args) {
      const colmenaId = idOf(args.colmenaId);
      const estado = oneOf(args.estadoSanidad, ['saludable', 'enferma', 'tratada', 'cuarentena'] as const);
      return sql`
        SELECT i.id, i.fecha, i."estadoSanidad", i.observaciones, i."proximaRevision",
               i."patologiasApicolas", i."posiblesEnfermedades", i."signosClinicos",
               (SELECT array_agg(c.nombre) FROM "_ColmenaToInspeccion" r JOIN colmenas c ON c.id = r."A"
                 WHERE r."B" = i.id) AS colmenas
        FROM inspecciones i
        WHERE i."usuarioId" = ${userId} AND i."anuladoAt" IS NULL
          ${colmenaId ? sql`AND EXISTS (SELECT 1 FROM "_ColmenaToInspeccion" r WHERE r."B" = i.id AND r."A" = ${colmenaId})` : sql``}
          ${estado ? sql`AND i."estadoSanidad" = ${estado}` : sql``}
          ${between('i', dateOf(args.desde), dateOf(args.hasta))}
        ORDER BY i.fecha DESC LIMIT ${limitOf(args.limite)}`;
    },
  },
  {
    name: 'sanidad_casos_listar',
    audience: 'apicultor',
    description:
      'Casos sanitarios del apicultor (sospechas o enfermedades) con gravedad, patología, si requiere notificación al ICA y próxima revisión.',
    parameters: {
      type: 'object',
      properties: {
        estado: { type: 'string', enum: ['abierto', 'en_seguimiento', 'cerrado_recuperado', 'cerrado_sacrificio'] },
        gravedad: { type: 'string', enum: ['baja', 'media', 'alta', 'critica'] },
        soloAbiertos: { type: 'boolean', description: 'true = solo abiertos o en seguimiento' },
        ...LIMIT_PROP,
      },
    },
    async run({ userId }, args) {
      const estado = oneOf(args.estado, ['abierto', 'en_seguimiento', 'cerrado_recuperado', 'cerrado_sacrificio'] as const);
      const gravedad = oneOf(args.gravedad, ['baja', 'media', 'alta', 'critica'] as const);
      return sql`
        SELECT cs.id, cs.codigo, cs.titulo, cs.descripcion, cs.estado, cs.gravedad, cs."fechaApertura",
               cs."proximaRevision", cs."fechaCierre", cs."requiereNotificacionIca",
               p.nombre AS patologia, p."declaracionObligatoria", a.nombre AS apiario,
               (SELECT count(*)::int FROM acciones_sanitarias x WHERE x."casoId" = cs.id AND x."anuladoAt" IS NULL) AS acciones
        FROM casos_sanitarios cs
        JOIN apiarios a ON a.id = cs."apiarioId"
        LEFT JOIN patologias_sanitarias p ON p.id = cs."patologiaId"
        WHERE cs."usuarioId" = ${userId} AND cs."anuladoAt" IS NULL
          ${args.soloAbiertos === true ? sql`AND cs.estado IN ('abierto','en_seguimiento')` : sql``}
          ${estado ? sql`AND cs.estado = ${estado}` : sql``}
          ${gravedad ? sql`AND cs.gravedad = ${gravedad}` : sql``}
        ORDER BY cs."fechaApertura" DESC LIMIT ${limitOf(args.limite)}`;
    },
  },
  {
    name: 'nucleo_listar',
    audience: 'apicultor',
    description: 'Núcleos del apicultor con código, estado, origen de la reina, apiario y colmena de origen.',
    parameters: {
      type: 'object',
      properties: {
        estado: {
          type: 'string',
          enum: ['en_formacion', 'en_desarrollo', 'listo', 'convertido', 'vendido', 'destruido'],
        },
        apiarioId: { type: 'string', description: 'Id del apiario (opcional)' },
        ...LIMIT_PROP,
      },
    },
    async run({ userId }, args) {
      const estado = oneOf(args.estado, ['en_formacion', 'en_desarrollo', 'listo', 'convertido', 'vendido', 'destruido'] as const);
      const apiarioId = idOf(args.apiarioId);
      return sql`
        SELECT n.id, n.codigo, n.estado, n."origenReina", n."fechaFormacion", a.nombre AS apiario,
               c.nombre AS "colmenaOrigen"
        FROM nucleos n
        JOIN apiarios a ON a.id = n."apiarioId"
        LEFT JOIN colmenas c ON c.id = n."colmenaOrigenId"
        WHERE a."usuarioId" = ${userId}
          ${estado ? sql`AND n.estado = ${estado}` : sql``}
          ${apiarioId ? sql`AND n."apiarioId" = ${apiarioId}` : sql``}
        ORDER BY n."fechaFormacion" DESC LIMIT ${limitOf(args.limite)}`;
    },
  },
  {
    name: 'produccion_resumen',
    audience: 'apicultor',
    description:
      'Producción total del apicultor agrupada por mes, tipo de producto, apiario o colmena, en un rango de fechas.',
    parameters: {
      type: 'object',
      properties: {
        agruparPor: { type: 'string', enum: ['mes', 'tipoProducto', 'apiario', 'colmena'], description: 'Por defecto: mes' },
        ...DATE_PROPS,
        ...LIMIT_PROP,
      },
    },
    async run({ userId }, args) {
      const groupBy = oneOf(args.agruparPor, ['mes', 'tipoProducto', 'apiario', 'colmena'] as const) ?? 'mes';
      const range = between('p', dateOf(args.desde), dateOf(args.hasta));
      const limit = limitOf(args.limite, 24);
      const rows =
        groupBy === 'mes'
          ? await sql`SELECT to_char(date_trunc('month', p.fecha), 'YYYY-MM') AS grupo, p."tipoProducto", sum(p.cantidad)::float AS total, max(p.unidad) AS unidad
                      FROM producciones p WHERE p."usuarioId" = ${userId} ${range}
                      GROUP BY 1, 2 ORDER BY 1 DESC LIMIT ${limit}`
          : groupBy === 'tipoProducto'
            ? await sql`SELECT p."tipoProducto" AS grupo, sum(p.cantidad)::float AS total, max(p.unidad) AS unidad
                        FROM producciones p WHERE p."usuarioId" = ${userId} ${range}
                        GROUP BY 1 ORDER BY total DESC LIMIT ${limit}`
            : groupBy === 'apiario'
              ? await sql`SELECT a.nombre AS grupo, p."tipoProducto", sum(p.cantidad)::float AS total, max(p.unidad) AS unidad
                          FROM producciones p JOIN apiarios a ON a.id = p."apiarioId"
                          WHERE p."usuarioId" = ${userId} ${range}
                          GROUP BY 1, 2 ORDER BY total DESC LIMIT ${limit}`
              : await sql`SELECT c.nombre AS grupo, p."tipoProducto", sum(p.cantidad)::float AS total, max(p.unidad) AS unidad
                          FROM producciones p JOIN colmenas c ON c.id = p."colmenaId"
                          WHERE p."usuarioId" = ${userId} ${range}
                          GROUP BY 1, 2 ORDER BY total DESC LIMIT ${limit}`;
      return { agruparPor: groupBy, filas: rows };
    },
  },
  {
    name: 'finanzas_resumen',
    audience: 'apicultor',
    description:
      'Ingresos, egresos y balance del apicultor (sin transacciones anuladas), agrupados por mes o categoría. ' +
      'Incluye el total de ventas pendientes de cobro.',
    parameters: {
      type: 'object',
      properties: {
        agruparPor: { type: 'string', enum: ['mes', 'categoria'], description: 'Por defecto: mes' },
        ...DATE_PROPS,
        ...LIMIT_PROP,
      },
    },
    async run({ userId }, args) {
      const groupBy = oneOf(args.agruparPor, ['mes', 'categoria'] as const) ?? 'mes';
      const range = between('t', dateOf(args.desde), dateOf(args.hasta));
      const limit = limitOf(args.limite, 24);
      const [grupos, totales, pendientes, usuario] = await Promise.all([
        groupBy === 'mes'
          ? sql`SELECT to_char(date_trunc('month', t.fecha), 'YYYY-MM') AS grupo, t.tipo, sum(t.monto)::float AS total
                FROM transacciones t WHERE t."usuarioId" = ${userId} AND t."anuladoAt" IS NULL ${range}
                GROUP BY 1, 2 ORDER BY 1 DESC LIMIT ${limit}`
          : sql`SELECT coalesce(t.categoria, 'sin_categoria') AS grupo, t.tipo, sum(t.monto)::float AS total
                FROM transacciones t WHERE t."usuarioId" = ${userId} AND t."anuladoAt" IS NULL ${range}
                GROUP BY 1, 2 ORDER BY total DESC LIMIT ${limit}`,
        sql`SELECT t.tipo, sum(t.monto)::float AS total FROM transacciones t
            WHERE t."usuarioId" = ${userId} AND t."anuladoAt" IS NULL ${range} GROUP BY t.tipo`,
        sql`SELECT count(*)::int AS ventas, coalesce(sum(coalesce(t."valorTotal", t.monto)), 0)::float AS total
            FROM transacciones t WHERE t."usuarioId" = ${userId} AND t."anuladoAt" IS NULL
              AND t."esVenta" = true AND t."estadoPago" IN ('pendiente','parcial')`,
        sql`SELECT moneda FROM usuarios WHERE id = ${userId}`,
      ]);
      const sum = (tipo: string) => totales.find((r: Row) => r.tipo === tipo)?.total ?? 0;
      return {
        moneda: usuario[0]?.moneda ?? 'COP',
        ingresos: round(sum('ingreso')),
        egresos: round(sum('egreso')),
        balance: round(sum('ingreso') - sum('egreso')),
        ventasPendientesDeCobro: { cantidad: pendientes[0].ventas, total: round(pendientes[0].total) },
        agruparPor: groupBy,
        filas: grupos,
      };
    },
  },
  {
    name: 'inventario_estado',
    audience: 'apicultor',
    description:
      'Insumos y activos del apicultor con cantidad actual vs. mínima, caducidad y proveedor. Con soloCriticos=true devuelve ' +
      'únicamente lo que está en o bajo el mínimo o próximo a caducar (60 días).',
    parameters: {
      type: 'object',
      properties: {
        soloCriticos: { type: 'boolean' },
        categoria: { type: 'string', description: 'Categoría de insumo (ej. tratamientos, marcos), opcional' },
        ...LIMIT_PROP,
      },
    },
    async run({ userId }, args) {
      const categoria = typeof args.categoria === 'string' && /^[a-z_]{2,40}$/.test(args.categoria) ? args.categoria : null;
      return sql`
        SELECT nombre, categoria, "tipoItem", "cantidadActual", "cantidadMinima", unidad, "estadoStock",
               "fechaCaducidad", proveedor, ubicacion
        FROM insumos_apicola
        WHERE "usuarioId" = ${userId} AND "anuladoAt" IS NULL
          ${categoria ? sql`AND categoria::text = ${categoria}` : sql``}
          ${args.soloCriticos === true
            ? sql`AND ("cantidadActual" <= "cantidadMinima" OR "fechaCaducidad" <= now() + interval '60 days')`
            : sql``}
        ORDER BY ("cantidadActual" / NULLIF("cantidadMinima", 0)) ASC NULLS LAST, nombre
        LIMIT ${limitOf(args.limite)}`;
    },
  },
  {
    name: 'alertas_listar',
    audience: 'apicultor',
    description: 'Alertas del apicultor (inspección, sanidad, mantenimiento...), por prioridad y fecha.',
    parameters: {
      type: 'object',
      properties: {
        soloNoLeidas: { type: 'boolean', description: 'Por defecto true' },
        prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'critica'] },
        ...LIMIT_PROP,
      },
    },
    async run({ userId }, args) {
      const prioridad = oneOf(args.prioridad, ['baja', 'media', 'alta', 'critica'] as const);
      return sql`
        SELECT id, titulo, mensaje, tipo, prioridad, leida, "fechaCreacion", "proximaEjecucion"
        FROM alertas
        WHERE "usuarioId" = ${userId} AND activa = true
          ${args.soloNoLeidas === false ? sql`` : sql`AND leida = false`}
          ${prioridad ? sql`AND prioridad = ${prioridad}` : sql``}
        ORDER BY "fechaCreacion" DESC LIMIT ${limitOf(args.limite)}`;
    },
  },
];

// ─── Herramientas del administrador (agregados de la plataforma) ────────────

const adminTools: DataTool[] = [
  {
    name: 'admin_metricas_plataforma',
    audience: 'administrador',
    description:
      'Métricas globales de la plataforma: usuarios (activos, por rol), apiarios, colmenas, producción total, ' +
      'ingresos/egresos acumulados y alertas pendientes.',
    parameters: none,
    async run() {
      const [usuarios, colmenas, apiarios, produccion, finanzas, alertas, registros] = await Promise.all([
        sql`SELECT rol, activo, count(*)::int AS n FROM usuarios GROUP BY rol, activo`,
        sql`SELECT estado, count(*)::int AS n FROM colmenas GROUP BY estado`,
        sql`SELECT count(*)::int AS n FROM apiarios`,
        sql`SELECT coalesce(sum(cantidad), 0)::float AS total FROM producciones`,
        sql`SELECT tipo, sum(monto)::float AS total FROM transacciones WHERE "anuladoAt" IS NULL GROUP BY tipo`,
        sql`SELECT count(*)::int AS n FROM alertas WHERE leida = false AND activa = true`,
        sql`SELECT to_char(date_trunc('month', "fechaRegistro"), 'YYYY-MM') AS mes, count(*)::int AS n
            FROM usuarios GROUP BY 1 ORDER BY 1 DESC LIMIT 6`,
      ]);
      return {
        usuarios: usuarios.map((r: Row) => ({ rol: r.rol, activo: r.activo, cantidad: r.n })),
        colmenasPorEstado: Object.fromEntries(colmenas.map((r: Row) => [r.estado, r.n])),
        apiarios: apiarios[0].n,
        produccionTotal: round(produccion[0].total),
        finanzasAcumuladas: Object.fromEntries(finanzas.map((r: Row) => [r.tipo, round(r.total)])),
        alertasPendientes: alertas[0].n,
        registrosPorMes: registros,
      };
    },
  },
  {
    name: 'admin_usuarios_listar',
    audience: 'administrador',
    description:
      'Lista usuarios de la plataforma (nombre, email, rol, estado, último acceso, # colmenas). No expone contraseñas.',
    parameters: {
      type: 'object',
      properties: {
        rol: { type: 'string', enum: ['apicultor', 'administrador'] },
        activo: { type: 'boolean' },
        buscar: { type: 'string', description: 'Texto a buscar en nombre o email (opcional)' },
        ...LIMIT_PROP,
      },
    },
    async run(_ctx, args) {
      const rol = oneOf(args.rol, ['apicultor', 'administrador'] as const);
      const search =
        typeof args.buscar === 'string' && args.buscar.trim()
          ? `%${args.buscar.trim().slice(0, 60).replace(/[\\%_]/g, '\\$&')}%`
          : null;
      return sql`
        SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.moneda, u."fechaRegistro", u."ultimoAcceso",
               (SELECT count(*)::int FROM colmenas c WHERE c."usuarioId" = u.id) AS colmenas,
               (SELECT count(*)::int FROM apiarios a WHERE a."usuarioId" = u.id) AS apiarios
        FROM usuarios u
        WHERE true
          ${rol ? sql`AND u.rol = ${rol}` : sql``}
          ${typeof args.activo === 'boolean' ? sql`AND u.activo = ${args.activo}` : sql``}
          ${search ? sql`AND (u.nombre ILIKE ${search} OR u.email ILIKE ${search})` : sql``}
        ORDER BY u."fechaRegistro" DESC LIMIT ${limitOf(args.limite)}`;
    },
  },
  {
    name: 'admin_actividad_reciente',
    audience: 'administrador',
    description:
      'Actividad reciente de la plataforma: registros nuevos, usuarios que no han ingresado en N días y actividad por tipo.',
    parameters: {
      type: 'object',
      properties: { dias: { type: 'integer', description: 'Ventana en días (1-365, por defecto 30)' } },
    },
    async run(_ctx, args) {
      const dias = Math.min(Math.max(Math.trunc(Number(args.dias)) || 30, 1), 365);
      const since = new Date(Date.now() - dias * 86_400_000);
      const [nuevos, inactivos, porTipo] = await Promise.all([
        sql`SELECT count(*)::int AS n FROM usuarios WHERE "fechaRegistro" >= ${since}`,
        sql`SELECT count(*)::int AS n FROM usuarios
            WHERE activo = true AND rol = 'apicultor' AND ("ultimoAcceso" IS NULL OR "ultimoAcceso" < ${since})`,
        sql`SELECT tipo, count(*)::int AS n FROM actividades WHERE "fechaCreacion" >= ${since} GROUP BY tipo ORDER BY n DESC`,
      ]);
      return {
        ventanaDias: dias,
        usuariosNuevos: nuevos[0].n,
        apicultoresSinIngresar: inactivos[0].n,
        actividadPorTipo: porTipo,
      };
    },
  },
  {
    name: 'admin_sanidad_global',
    audience: 'administrador',
    description:
      'Vigilancia sanitaria agregada de toda la plataforma: casos abiertos por gravedad y patología, casos con notificación ' +
      'ICA obligatoria pendiente. No incluye datos personales.',
    parameters: none,
    async run() {
      const [porGravedad, porPatologia, ica] = await Promise.all([
        sql`SELECT gravedad, count(*)::int AS n FROM casos_sanitarios
            WHERE "anuladoAt" IS NULL AND estado IN ('abierto','en_seguimiento') GROUP BY gravedad`,
        sql`SELECT coalesce(p.nombre, 'Sin patología') AS patologia, count(*)::int AS n
            FROM casos_sanitarios cs LEFT JOIN patologias_sanitarias p ON p.id = cs."patologiaId"
            WHERE cs."anuladoAt" IS NULL AND cs.estado IN ('abierto','en_seguimiento')
            GROUP BY 1 ORDER BY n DESC LIMIT 10`,
        sql`SELECT count(*)::int AS n FROM casos_sanitarios
            WHERE "anuladoAt" IS NULL AND estado IN ('abierto','en_seguimiento') AND "requiereNotificacionIca" = true`,
      ]);
      return {
        abiertosPorGravedad: Object.fromEntries(porGravedad.map((r: Row) => [r.gravedad, r.n])),
        abiertosPorPatologia: porPatologia,
        conNotificacionIcaRequerida: ica[0].n,
      };
    },
  },
  {
    name: 'admin_produccion_global',
    audience: 'administrador',
    description: 'Producción total de la plataforma por mes o tipo de producto, en un rango de fechas.',
    parameters: {
      type: 'object',
      properties: {
        agruparPor: { type: 'string', enum: ['mes', 'tipoProducto'], description: 'Por defecto: mes' },
        ...DATE_PROPS,
        ...LIMIT_PROP,
      },
    },
    async run(_ctx, args) {
      const groupBy = oneOf(args.agruparPor, ['mes', 'tipoProducto'] as const) ?? 'mes';
      const range = between('p', dateOf(args.desde), dateOf(args.hasta));
      const limit = limitOf(args.limite, 24);
      const filas =
        groupBy === 'mes'
          ? await sql`SELECT to_char(date_trunc('month', p.fecha), 'YYYY-MM') AS grupo, sum(p.cantidad)::float AS total
                      FROM producciones p WHERE true ${range} GROUP BY 1 ORDER BY 1 DESC LIMIT ${limit}`
          : await sql`SELECT p."tipoProducto" AS grupo, sum(p.cantidad)::float AS total
                      FROM producciones p WHERE true ${range} GROUP BY 1 ORDER BY total DESC LIMIT ${limit}`;
      return { agruparPor: groupBy, filas };
    },
  },
  {
    name: 'admin_configuracion_sistema',
    audience: 'administrador',
    description: 'Configuración general de la plataforma (modo mantenimiento, registro abierto, idioma, moneda, zona horaria).',
    parameters: none,
    async run() {
      const [row] = await sql`SELECT * FROM configuracion_sistema WHERE id = 'principal'`;
      return row ?? { mensaje: 'Sin configuración guardada: se usan los valores por defecto' };
    },
  },
];

export const ALL_TOOLS: readonly DataTool[] = [...apicultorTools, ...adminTools];

export const toolsFor = (rol: Audience): DataTool[] => ALL_TOOLS.filter((t) => t.audience === rol);

export const findTool = (name: string): DataTool | undefined => ALL_TOOLS.find((t) => t.name === name);

/**
 * Ejecuta una herramienta con el contexto YA verificado. La comprobación de rol vive aquí y no en el
 * llamador: así el agente en proceso y el servidor MCP comparten exactamente la misma barrera.
 */
export async function runTool(ctx: ToolContext, name: string, args: unknown): Promise<unknown> {
  const tool = findTool(name);
  if (!tool) return { error: `Herramienta desconocida: ${name}` };
  if (tool.audience !== ctx.rol) return { error: 'No tienes permisos para usar esta herramienta' };
  const safeArgs = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  try {
    return await tool.run(ctx, safeArgs);
  } catch (error) {
    // El detalle de SQL no es para el modelo ni para el usuario: va al log del servidor.
    console.error(`[ai-tool] ${name} falló:`, error);
    return { error: 'No se pudo consultar ese dato en este momento' };
  }
}
