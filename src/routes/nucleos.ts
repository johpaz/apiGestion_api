import { Elysia } from 'elysia';
import { z } from 'zod';
import { authGuard } from '../middleware/auth';
import { sql, insert, updateById, idList, type Row } from '../db';
import { AlertService } from '../services/alertService';
import { validateNucleusFinalization } from '../services/traceabilityPolicy';

const createSchema = z.object({
  numero: z.coerce.number().int().positive(),
  codigo: z.string().trim().min(2).max(40),
  tipo: z.string().trim().min(2).max(80).default('Langstroth'),
  estado: z.enum(['en_formacion', 'en_desarrollo', 'listo']).default('en_formacion'),
  fechaFormacion: z.string().datetime().optional(),
  apiarioId: z.string().min(1),
  colmenaOrigenId: z.string().optional(),
  donanteIds: z.array(z.string()).default([]),
  origenReina: z.enum(['criada', 'comprada', 'capturada', 'desconocida']).default('desconocida'),
  detalleOrigenReina: z.string().trim().max(500).optional(),
  proveedorReina: z.string().trim().max(160).optional(),
});

// Sin defaults: un PATCH solo debe modificar los campos enviados
const updateSchema = z.object({
  numero: z.coerce.number().int().positive(),
  codigo: z.string().trim().min(2).max(40),
  tipo: z.string().trim().min(2).max(80),
  estado: z.enum(['en_formacion', 'en_desarrollo', 'listo']),
  origenReina: z.enum(['criada', 'comprada', 'capturada', 'desconocida']),
  detalleOrigenReina: z.string().trim().max(500),
  proveedorReina: z.string().trim().max(160),
}).partial();

const conversionSchema = z.object({
  nombreColmena: z.string().trim().min(2).max(120),
  apiarioId: z.string().min(1),
  fecha: z.string().datetime().optional(),
  observaciones: z.string().trim().max(1000).optional(),
});

const ventaSchema = z.object({
  compradorNombre: z.string().trim().min(2).max(160),
  compradorIdentificacion: z.string().trim().max(80).optional(),
  compradorContacto: z.string().trim().max(160).optional(),
  destinoApiario: z.string().trim().min(2).max(200),
  destinoCiudad: z.string().trim().max(120).optional(),
  fecha: z.string().datetime().optional(),
  monto: z.coerce.number().positive(),
  moneda: z.enum(['COP', 'USD', 'EUR']),
  comprobantePath: z.string().url().optional(),
});

const group = (rows: Row[], key: string) => {
  const map = new Map<string, Row[]>();
  for (const row of rows) map.set(row[key], [...(map.get(row[key]) ?? []), row]);
  return map;
};
const byId = (rows: Row[]) => new Map(rows.map((r) => [r.id, r]));

// Equivalente al include anterior: apiario, colmenaOrigen, donantes(+colmena), eventos vigentes, ventas y conversiones(+colmena)
async function withNucleoRelations(nucleos: Row[]): Promise<Row[]> {
  if (!nucleos.length) return [];
  const ids = sql.array(idList(nucleos), 'TEXT');
  const [apiarios, colmenasOrigen, donantes, eventos, ventas, conversiones] = await Promise.all([
    sql`SELECT id, nombre, ciudad, "registroIcaNumero" FROM apiarios WHERE id = ANY(${sql.array([...new Set(nucleos.map((n) => n.apiarioId as string))], 'TEXT')})`,
    sql`SELECT id, nombre FROM colmenas WHERE id = ANY(${sql.array(nucleos.map((n) => n.colmenaOrigenId as string).filter(Boolean), 'TEXT')})`,
    sql`SELECT d.*, c.id AS "c_id", c.nombre AS "c_nombre" FROM nucleos_donantes d JOIN colmenas c ON c.id = d."colmenaId" WHERE d."nucleoId" = ANY(${ids})`,
    sql`SELECT * FROM eventos_nucleo WHERE "nucleoId" = ANY(${ids}) AND "anuladoAt" IS NULL ORDER BY fecha DESC`,
    sql`SELECT * FROM ventas_nucleo WHERE "nucleoId" = ANY(${ids}) ORDER BY fecha DESC`,
    sql`SELECT v.*, c.id AS "c_id", c.nombre AS "c_nombre", c.estado AS "c_estado" FROM conversiones_nucleo v JOIN colmenas c ON c.id = v."colmenaId" WHERE v."nucleoId" = ANY(${ids}) ORDER BY v.fecha DESC`,
  ]);
  const apiarioById = byId(apiarios);
  const origenById = byId(colmenasOrigen);
  const donantesBy = group(donantes.map(({ c_id, c_nombre, ...d }: Row) => ({ ...d, colmena: { id: c_id, nombre: c_nombre } })), 'nucleoId');
  const eventosBy = group(eventos, 'nucleoId');
  const ventasBy = group(ventas, 'nucleoId');
  const conversionesBy = group(conversiones.map(({ c_id, c_nombre, c_estado, ...v }: Row) => ({ ...v, colmena: { id: c_id, nombre: c_nombre, estado: c_estado } })), 'nucleoId');
  return nucleos.map((n) => ({
    ...n,
    apiario: apiarioById.get(n.apiarioId) ?? null,
    colmenaOrigen: n.colmenaOrigenId ? origenById.get(n.colmenaOrigenId) ?? null : null,
    donantes: donantesBy.get(n.id) ?? [],
    eventos: eventosBy.get(n.id) ?? [],
    ventas: ventasBy.get(n.id) ?? [],
    conversiones: conversionesBy.get(n.id) ?? [],
  }));
}

const loadOne = async (rows: Row[]) => (await withNucleoRelations(rows))[0] ?? null;

const fail = (context: any, status: number, error: string) => {
  context.set.status = status;
  return { success: false, error };
};

const findOwnedNucleo = async (id: string, userId: string) => loadOne(await sql`
  SELECT n.* FROM nucleos n JOIN apiarios a ON a.id = n."apiarioId"
  WHERE n.id = ${id} AND a."usuarioId" = ${userId} LIMIT 1`);

const hasOpenCase = async (nucleoId: string) => {
  const [row] = await sql`
    SELECT 1 AS found FROM casos_sanitarios c
    WHERE c."anuladoAt" IS NULL AND c.estado IN ('abierto', 'en_seguimiento')
      AND EXISTS (SELECT 1 FROM casos_sanitarios_objetivos o WHERE o."casoId" = c.id AND o."nucleoId" = ${nucleoId})
    LIMIT 1`;
  return Boolean(row);
};

const isUniqueViolation = (error: any) => error?.code === '23505' || error?.errno === '23505';

const ownedNucleoRows = (id: string, context: any) => context.user.rol === 'administrador'
  ? sql`SELECT * FROM nucleos WHERE id = ${id} LIMIT 1`
  : sql`SELECT n.* FROM nucleos n JOIN apiarios a ON a.id = n."apiarioId" WHERE n.id = ${id} AND a."usuarioId" = ${context.user.id} LIMIT 1`;

const nucleosRoutes = new Elysia({ prefix: '/nucleos' }).use(authGuard);

nucleosRoutes.get('/', async (context: any) => {
  const rows = context.user.rol === 'administrador'
    ? await sql`SELECT * FROM nucleos ORDER BY "fechaFormacion" DESC`
    : await sql`SELECT n.* FROM nucleos n JOIN apiarios a ON a.id = n."apiarioId" WHERE a."usuarioId" = ${context.user.id} ORDER BY n."fechaFormacion" DESC`;
  return { success: true, data: await withNucleoRelations(rows) };
});

nucleosRoutes.get('/:id', async (context: any) => {
  const nucleo = await loadOne(await ownedNucleoRows(context.params.id, context));
  return nucleo ? { success: true, data: nucleo } : fail(context, 404, 'Núcleo no encontrado');
});

nucleosRoutes.get('/:id/trazabilidad', async (context: any) => {
  const nucleo = await loadOne(await ownedNucleoRows(context.params.id, context));
  if (!nucleo) return fail(context, 404, 'Núcleo no encontrado');

  // _NucleoToInspeccion: A = inspección, B = núcleo
  const inspecciones = await sql`
    SELECT i.* FROM "_NucleoToInspeccion" r JOIN inspecciones i ON i.id = r."A"
    WHERE r."B" = ${nucleo.id} AND i."anuladoAt" IS NULL ORDER BY i.fecha DESC`;
  const objetivos = await sql`SELECT * FROM casos_sanitarios_objetivos WHERE "nucleoId" = ${nucleo.id}`;
  let casosSanitarios: Row[] = [];
  if (objetivos.length) {
    const casoIds = sql.array(objetivos.map((o: Row) => o.casoId as string), 'TEXT');
    const [casos, patologias, acciones] = await Promise.all([
      sql`SELECT * FROM casos_sanitarios WHERE id = ANY(${casoIds})`,
      sql`SELECT p.* FROM patologias_sanitarias p WHERE p.id IN (SELECT "patologiaId" FROM casos_sanitarios WHERE id = ANY(${casoIds}))`,
      sql`SELECT * FROM acciones_sanitarias WHERE "casoId" = ANY(${casoIds}) AND "anuladoAt" IS NULL`,
    ]);
    const patologiaById = byId(patologias);
    const accionesBy = group(acciones, 'casoId');
    const casoById = new Map(casos.map((c: Row) => [c.id, { ...c, patologia: c.patologiaId ? patologiaById.get(c.patologiaId) ?? null : null, acciones: accionesBy.get(c.id) ?? [] }]));
    casosSanitarios = objetivos.map((o: Row) => ({ ...o, caso: casoById.get(o.casoId) }));
  }
  return { success: true, data: { ...nucleo, inspecciones, casosSanitarios } };
});

nucleosRoutes.post('/', async (context: any) => {
  if (context.user.rol === 'administrador') return fail(context, 403, 'El administrador tiene acceso de auditoría únicamente');
  const parsed = createSchema.safeParse(context.body);
  if (!parsed.success) return fail(context, 400, parsed.error.issues[0]?.message || 'Datos inválidos');
  const data = parsed.data;
  const [apiario] = await sql`SELECT * FROM apiarios WHERE id = ${data.apiarioId} AND "usuarioId" = ${context.user.id} LIMIT 1`;
  if (!apiario) return fail(context, 404, 'Apiario no encontrado');

  const donorIds = Array.from(new Set([...data.donanteIds, ...(data.colmenaOrigenId ? [data.colmenaOrigenId] : [])]));
  if (donorIds.length) {
    const [{ n: donors }] = await sql`SELECT count(*)::int AS n FROM colmenas WHERE id = ANY(${sql.array(donorIds, 'TEXT')}) AND "apiarioId" = ${apiario.id} AND "usuarioId" = ${context.user.id}`;
    if (donors !== donorIds.length) return fail(context, 400, 'Todas las colmenas donantes deben pertenecer al apiario');
  }

  try {
    const created = await sql.begin(async (tx) => {
      const fechaFormacion = data.fechaFormacion ? new Date(data.fechaFormacion) : new Date();
      const row = await insert('nucleos', {
        numero: data.numero,
        codigo: data.codigo,
        tipo: data.tipo,
        estado: data.estado,
        fechaInstalacion: fechaFormacion,
        fechaFormacion,
        apiarioId: apiario.id,
        colmenaOrigenId: data.colmenaOrigenId,
        origenReina: data.origenReina,
        detalleOrigenReina: data.detalleOrigenReina,
        proveedorReina: data.proveedorReina,
      }, tx as any);
      for (const colmenaId of donorIds) await insert('nucleos_donantes', { nucleoId: row.id, colmenaId }, tx as any);
      await insert('eventos_nucleo', { nucleoId: row.id, tipo: 'creado', detalle: `Núcleo ${data.codigo} formado en ${apiario.nombre}`, registradoPorId: context.user.id }, tx as any);
      return row;
    });
    const nucleo = await loadOne([created]);

    AlertService.createRecurrentAlertsForEntity('nucleo', nucleo.id, `Núcleo ${nucleo.codigo}`, context.user.id).catch(console.error);
    context.set.status = 201;
    return { success: true, data: nucleo, message: 'Núcleo registrado con trazabilidad' };
  } catch (error: any) {
    if (isUniqueViolation(error)) return fail(context, 409, 'El código del núcleo ya existe en este apiario');
    throw error;
  }
});

nucleosRoutes.patch('/:id', async (context: any) => {
  if (context.user.rol === 'administrador') return fail(context, 403, 'El administrador tiene acceso de auditoría únicamente');
  const parsed = updateSchema.safeParse(context.body);
  if (!parsed.success) return fail(context, 400, parsed.error.issues[0]?.message || 'Datos inválidos');
  const nucleo = await findOwnedNucleo(context.params.id, context.user.id);
  if (!nucleo) return fail(context, 404, 'Núcleo no encontrado');
  if (['convertido', 'vendido', 'destruido', 'anulado'].includes(nucleo.estado)) return fail(context, 409, 'Un núcleo cerrado no puede editarse');

  const updatedRow = await sql.begin(async (tx) => {
    const result = await updateById('nucleos', nucleo.id, parsed.data, tx as any);
    await insert('eventos_nucleo', { nucleoId: nucleo.id, tipo: parsed.data.estado && parsed.data.estado !== nucleo.estado ? 'cambio_estado' : 'actualizado', detalle: 'Datos del núcleo actualizados', datos: JSON.stringify(parsed.data), registradoPorId: context.user.id }, tx as any);
    return result!;
  });
  return { success: true, data: await loadOne([updatedRow]) };
});

nucleosRoutes.post('/:id/conversiones', async (context: any) => {
  if (context.user.rol === 'administrador') return fail(context, 403, 'El administrador tiene acceso de auditoría únicamente');
  const parsed = conversionSchema.safeParse(context.body);
  if (!parsed.success) return fail(context, 400, parsed.error.issues[0]?.message || 'Datos inválidos');
  const nucleo = await findOwnedNucleo(context.params.id, context.user.id);
  if (!nucleo) return fail(context, 404, 'Núcleo no encontrado');
  const policyError = validateNucleusFinalization(nucleo.estado, await hasOpenCase(nucleo.id));
  if (policyError) return fail(context, 409, policyError);
  const [apiario] = await sql`SELECT * FROM apiarios WHERE id = ${parsed.data.apiarioId} AND "usuarioId" = ${context.user.id} LIMIT 1`;
  if (!apiario) return fail(context, 404, 'Apiario de destino no encontrado');

  const conversion = await sql.begin(async (tx) => {
    const fecha = parsed.data.fecha ? new Date(parsed.data.fecha) : new Date();
    const colmena = await insert('colmenas', { nombre: parsed.data.nombreColmena, estado: 'activa', fechaInstalacion: fecha, apiarioId: apiario.id, usuarioId: context.user.id }, tx as any);
    const result = await insert('conversiones_nucleo', { nucleoId: nucleo.id, colmenaId: colmena.id, fecha, observaciones: parsed.data.observaciones, creadoPorId: context.user.id }, tx as any);
    await updateById('nucleos', nucleo.id, { estado: 'convertido' }, tx as any);
    await insert('eventos_nucleo', { nucleoId: nucleo.id, tipo: 'convertido', detalle: `Convertido en colmena ${colmena.nombre}`, datos: JSON.stringify({ colmenaId: colmena.id, apiarioId: apiario.id }), registradoPorId: context.user.id }, tx as any);
    return { ...result, colmena };
  });
  context.set.status = 201;
  return { success: true, data: conversion, message: 'Núcleo convertido conservando su linaje' };
});

nucleosRoutes.post('/:id/ventas', async (context: any) => {
  if (context.user.rol === 'administrador') return fail(context, 403, 'El administrador tiene acceso de auditoría únicamente');
  const parsed = ventaSchema.safeParse(context.body);
  if (!parsed.success) return fail(context, 400, parsed.error.issues[0]?.message || 'Datos inválidos');
  const nucleo = await findOwnedNucleo(context.params.id, context.user.id);
  if (!nucleo) return fail(context, 404, 'Núcleo no encontrado');
  const policyError = validateNucleusFinalization(nucleo.estado, await hasOpenCase(nucleo.id));
  if (policyError) return fail(context, 409, policyError);

  const venta = await sql.begin(async (tx) => {
    const fecha = parsed.data.fecha ? new Date(parsed.data.fecha) : new Date();
    const transaccion = await insert('transacciones', { tipo: 'ingreso', descripcion: `Venta del núcleo ${nucleo.codigo} a ${parsed.data.compradorNombre}`, monto: parsed.data.monto, fecha, categoria: 'venta_nucleo', referencia: parsed.data.comprobantePath, esVenta: true, producto: `Núcleo ${nucleo.codigo}`, cantidad: 1, unidad: 'unidad', compradorNombre: parsed.data.compradorNombre, valorTotal: parsed.data.monto, estadoPago: 'pagado', origen: 'venta_nucleo', usuarioId: context.user.id }, tx as any);
    const result = await insert('ventas_nucleo', { ...parsed.data, fecha, nucleoId: nucleo.id, transaccionId: transaccion.id, creadoPorId: context.user.id }, tx as any);
    await updateById('nucleos', nucleo.id, { estado: 'vendido' }, tx as any);
    await insert('eventos_nucleo', { nucleoId: nucleo.id, tipo: 'vendido', detalle: `Vendido a ${parsed.data.compradorNombre}; destino: ${parsed.data.destinoApiario}`, datos: JSON.stringify({ ventaId: result.id, transaccionId: transaccion.id }), registradoPorId: context.user.id }, tx as any);
    return { ...result, transaccion };
  });
  context.set.status = 201;
  return { success: true, data: venta, message: 'Venta e ingreso financiero registrados' };
});

nucleosRoutes.post('/:id/anulaciones', async (context: any) => {
  const parsed = z.object({ motivo: z.string().trim().min(5).max(1000) }).safeParse(context.body);
  if (!parsed.success) return fail(context, 400, 'El motivo es obligatorio');
  const [nucleo] = await sql`
    SELECT n.*, a."usuarioId" AS "apiarioUsuarioId" FROM nucleos n JOIN apiarios a ON a.id = n."apiarioId" WHERE n.id = ${context.params.id}`;
  if (!nucleo) return fail(context, 404, 'Núcleo no encontrado');
  if (context.user.rol !== 'administrador' && nucleo.apiarioUsuarioId !== context.user.id) return fail(context, 403, 'No tienes permisos');
  if (['convertido', 'vendido', 'destruido'].includes(nucleo.estado)) return fail(context, 409, 'El resultado final debe anularse desde su venta, conversión o caso sanitario');
  const updated = await sql.begin(async (tx) => {
    const result = await updateById('nucleos', nucleo.id, { estado: 'anulado' }, tx as any);
    await insert('eventos_nucleo', { nucleoId: nucleo.id, tipo: 'anulado', detalle: parsed.data.motivo, registradoPorId: context.user.id }, tx as any);
    return result;
  });
  return { success: true, data: updated };
});

nucleosRoutes.post('/:id/ventas/:ventaId/anulaciones', async (context: any) => {
  const parsed = z.object({ motivo: z.string().trim().min(5).max(1000) }).safeParse(context.body);
  if (!parsed.success) return fail(context, 400, 'El motivo es obligatorio');
  const [venta] = await sql`
    SELECT v.*, a."usuarioId" AS "apiarioUsuarioId" FROM ventas_nucleo v
    JOIN nucleos n ON n.id = v."nucleoId" JOIN apiarios a ON a.id = n."apiarioId"
    WHERE v.id = ${context.params.ventaId} AND v."nucleoId" = ${context.params.id} LIMIT 1`;
  if (!venta) return fail(context, 404, 'Venta no encontrada');
  if (context.user.rol !== 'administrador' && venta.apiarioUsuarioId !== context.user.id) return fail(context, 403, 'No tienes permisos');
  if (venta.anuladoAt) return fail(context, 409, 'La venta ya está anulada');
  await sql.begin(async (tx) => {
    await updateById('ventas_nucleo', venta.id, { anuladoAt: new Date(), anuladoPorId: context.user.id, motivoAnulacion: parsed.data.motivo }, tx as any);
    await updateById('transacciones', venta.transaccionId, { anuladoAt: new Date(), anuladoPorId: context.user.id, motivoAnulacion: parsed.data.motivo }, tx as any);
    await updateById('nucleos', venta.nucleoId, { estado: 'listo' }, tx as any);
    await insert('eventos_nucleo', { nucleoId: venta.nucleoId, tipo: 'anulado', detalle: `Venta anulada: ${parsed.data.motivo}`, registradoPorId: context.user.id }, tx as any);
  });
  return { success: true, message: 'Venta e ingreso anulados; la trazabilidad fue conservada' };
});

nucleosRoutes.post('/:id/conversiones/:conversionId/anulaciones', async (context: any) => {
  const parsed = z.object({ motivo: z.string().trim().min(5).max(1000) }).safeParse(context.body);
  if (!parsed.success) return fail(context, 400, 'El motivo es obligatorio');
  const [conversion] = await sql`
    SELECT v.*, a."usuarioId" AS "apiarioUsuarioId" FROM conversiones_nucleo v
    JOIN nucleos n ON n.id = v."nucleoId" JOIN apiarios a ON a.id = n."apiarioId"
    WHERE v.id = ${context.params.conversionId} AND v."nucleoId" = ${context.params.id} LIMIT 1`;
  if (!conversion) return fail(context, 404, 'Conversión no encontrada');
  if (context.user.rol !== 'administrador' && conversion.apiarioUsuarioId !== context.user.id) return fail(context, 403, 'No tienes permisos');
  if (conversion.anuladoAt) return fail(context, 409, 'La conversión ya está anulada');

  const colmenaId = conversion.colmenaId;
  const [inspecciones, producciones, enjambres, casos, nucleosOrigen, nucleosDonados] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM inspecciones i WHERE i."anuladoAt" IS NULL AND EXISTS (SELECT 1 FROM "_ColmenaToInspeccion" r WHERE r."B" = i.id AND r."A" = ${colmenaId})`,
    sql`SELECT count(*)::int AS n FROM producciones WHERE "colmenaId" = ${colmenaId}`,
    sql`SELECT count(*)::int AS n FROM enjambres WHERE "colmenaId" = ${colmenaId}`,
    sql`SELECT count(*)::int AS n FROM casos_sanitarios_objetivos o JOIN casos_sanitarios c ON c.id = o."casoId" WHERE o."colmenaId" = ${colmenaId} AND c."anuladoAt" IS NULL`,
    sql`SELECT count(*)::int AS n FROM nucleos WHERE "colmenaOrigenId" = ${colmenaId} AND estado <> 'anulado'`,
    sql`SELECT count(*)::int AS n FROM nucleos_donantes d JOIN nucleos n ON n.id = d."nucleoId" WHERE d."colmenaId" = ${colmenaId} AND n.estado <> 'anulado'`,
  ]).then((results) => results.map((r) => r[0].n as number));
  if ([inspecciones, producciones, enjambres, casos, nucleosOrigen, nucleosDonados].some(Boolean)) {
    return fail(context, 409, 'La colmena resultante ya tiene actividad posterior; la conversión no puede anularse');
  }

  await sql.begin(async (tx) => {
    await updateById('conversiones_nucleo', conversion.id, { anuladoAt: new Date(), anuladoPorId: context.user.id, motivoAnulacion: parsed.data.motivo }, tx as any);
    await updateById('colmenas', conversion.colmenaId, { estado: 'abandonada' }, tx as any);
    await updateById('nucleos', conversion.nucleoId, { estado: 'listo' }, tx as any);
    await insert('eventos_nucleo', { nucleoId: conversion.nucleoId, tipo: 'anulado', detalle: `Conversión anulada: ${parsed.data.motivo}`, datos: JSON.stringify({ conversionId: conversion.id, colmenaId: conversion.colmenaId }), registradoPorId: context.user.id }, tx as any);
  });
  return { success: true, message: 'Conversión anulada; la colmena resultante quedó inactiva y la trazabilidad fue conservada' };
});

nucleosRoutes.delete('/:id', (context: any) => fail(context, 405, 'Los núcleos no se eliminan; usa una anulación con motivo'));

export default nucleosRoutes;
