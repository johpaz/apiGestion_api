import { Elysia } from 'elysia';
import { z } from 'zod';
import { authGuard } from '../middleware/auth';
import { sql, insert, updateById, idList, type Row } from '../db';
import { validateHealthAction } from '../services/traceabilityPolicy';

const objetivoSchema = z.object({
  tipo: z.enum(['colmena', 'nucleo', 'enjambre']),
  id: z.string().min(1),
});

const crearCasoSchema = z.object({
  titulo: z.string().trim().min(3).max(120),
  descripcion: z.string().trim().max(2000).optional(),
  gravedad: z.enum(['baja', 'media', 'alta', 'critica']).default('media'),
  patologiaId: z.string().optional(),
  inspeccionOrigenId: z.string().optional(),
  proximaRevision: z.string().datetime().optional(),
  objetivos: z.array(objetivoSchema).min(1),
});

const crearAccionSchema = z.object({
  tipo: z.enum([
    'aislamiento', 'toma_muestra', 'diagnostico', 'notificacion_ica',
    'control_fisico', 'control_biologico', 'control_autorizado_ica',
    'limpieza_desinfeccion', 'seguimiento', 'recuperacion',
    'sacrificio_destruccion', 'disposicion_final',
  ]),
  fecha: z.string().datetime().optional(),
  descripcion: z.string().trim().min(3).max(3000),
  objetivoIds: z.array(z.string()).default([]),
  responsable: z.string().trim().max(160).optional(),
  metodo: z.string().trim().max(1000).optional(),
  disposicionFinal: z.string().trim().max(1000).optional(),
  productoNombre: z.string().trim().max(160).optional(),
  productoRegistroIca: z.string().trim().max(120).optional(),
  retiroHasta: z.string().datetime().optional(),
  referenciaIca: z.string().trim().max(160).optional(),
  evidencias: z.array(z.string().url()).default([]),
});

const byId = (rows: Row[]) => new Map(rows.map((r) => [r.id, r]));
const group = (rows: Row[], key: string) => {
  const map = new Map<string, Row[]>();
  for (const row of rows) map.set(row[key], [...(map.get(row[key]) ?? []), row]);
  return map;
};

// Equivalente al include anterior: apiario, patologia, objetivos(+colmena/nucleo/enjambre) y acciones vigentes
async function withCasoRelations(casos: Row[]) {
  if (!casos.length) return [];
  const ids = sql.array(idList(casos), 'TEXT');
  const [apiarios, patologias, objetivos, acciones] = await Promise.all([
    sql`SELECT id, nombre, "registroIcaNumero" FROM apiarios WHERE id = ANY(${sql.array([...new Set(casos.map((c) => c.apiarioId as string))], 'TEXT')})`,
    sql`SELECT * FROM patologias_sanitarias WHERE id = ANY(${sql.array(casos.map((c) => c.patologiaId as string).filter(Boolean), 'TEXT')})`,
    sql`SELECT * FROM casos_sanitarios_objetivos WHERE "casoId" = ANY(${ids})`,
    sql`SELECT * FROM acciones_sanitarias WHERE "casoId" = ANY(${ids}) AND "anuladoAt" IS NULL ORDER BY fecha ASC`,
  ]);
  const pick = (rows: Row[], key: string) => [...new Set(rows.map((o) => o[key] as string).filter(Boolean))];
  const [colmenas, nucleos, enjambres] = await Promise.all([
    sql`SELECT id, nombre, estado FROM colmenas WHERE id = ANY(${sql.array(pick(objetivos, 'colmenaId'), 'TEXT')})`,
    sql`SELECT id, codigo, numero, estado FROM nucleos WHERE id = ANY(${sql.array(pick(objetivos, 'nucleoId'), 'TEXT')})`,
    sql`SELECT id, nombre, estado FROM enjambres WHERE id = ANY(${sql.array(pick(objetivos, 'enjambreId'), 'TEXT')})`,
  ]);
  const [apiarioById, patologiaById, colmenaById, nucleoById, enjambreById] = [apiarios, patologias, colmenas, nucleos, enjambres].map(byId);
  const objetivosBy = group(objetivos.map((o: Row) => ({
    ...o,
    colmena: o.colmenaId ? colmenaById.get(o.colmenaId) ?? null : null,
    nucleo: o.nucleoId ? nucleoById.get(o.nucleoId) ?? null : null,
    enjambre: o.enjambreId ? enjambreById.get(o.enjambreId) ?? null : null,
  })), 'casoId');
  const accionesBy = group(acciones, 'casoId');
  return casos.map((c) => ({
    ...c,
    apiario: apiarioById.get(c.apiarioId) ?? null,
    patologia: c.patologiaId ? patologiaById.get(c.patologiaId) ?? null : null,
    objetivos: objetivosBy.get(c.id) ?? [],
    acciones: accionesBy.get(c.id) ?? [],
  }));
}

const fail = (context: any, status: number, error: string) => {
  context.set.status = status;
  return { success: false, error };
};

const getObjective = async (tipo: string, id: string, userId: string) => {
  if (tipo === 'colmena') {
    const [entity] = await sql`SELECT id, "apiarioId" FROM colmenas WHERE id = ${id} AND "usuarioId" = ${userId} LIMIT 1`;
    return entity && { tipo, id: entity.id as string, apiarioId: entity.apiarioId as string };
  }
  if (tipo === 'nucleo') {
    const [entity] = await sql`SELECT n.id, n."apiarioId" FROM nucleos n JOIN apiarios a ON a.id = n."apiarioId" WHERE n.id = ${id} AND a."usuarioId" = ${userId} LIMIT 1`;
    return entity && { tipo, id: entity.id as string, apiarioId: entity.apiarioId as string };
  }
  const [entity] = await sql`SELECT e.id, c."apiarioId" FROM enjambres e JOIN colmenas c ON c.id = e."colmenaId" WHERE e.id = ${id} AND c."usuarioId" = ${userId} LIMIT 1`;
  return entity && { tipo, id: entity.id as string, apiarioId: entity.apiarioId as string };
};

const casosSanitariosRoutes = new Elysia({ prefix: '/casos-sanitarios' }).use(authGuard);

casosSanitariosRoutes.get('/catalogo/patologias', async () => ({
  success: true,
  data: await sql`SELECT * FROM patologias_sanitarias WHERE activa = true ORDER BY nombre ASC`,
}));

casosSanitariosRoutes.get('/', async (context: any) => {
  const userId = context.user.rol !== 'administrador' ? context.user.id : null;
  const estado = context.query?.estado ?? null;
  const apiarioId = context.query?.apiarioId ?? null;

  const casos = await sql`
    SELECT * FROM casos_sanitarios
    WHERE "anuladoAt" IS NULL
      ${userId ? sql`AND "usuarioId" = ${userId}` : sql``}
      ${estado ? sql`AND estado = ${estado}` : sql``}
      ${apiarioId ? sql`AND "apiarioId" = ${apiarioId}` : sql``}
    ORDER BY "fechaApertura" DESC`;
  return { success: true, data: await withCasoRelations(casos) };
});

casosSanitariosRoutes.get('/:id', async (context: any) => {
  const rows = context.user.rol === 'administrador'
    ? await sql`SELECT * FROM casos_sanitarios WHERE id = ${context.params.id} LIMIT 1`
    : await sql`SELECT * FROM casos_sanitarios WHERE id = ${context.params.id} AND "usuarioId" = ${context.user.id} LIMIT 1`;
  const [caso] = await withCasoRelations(rows);
  return caso ? { success: true, data: caso } : fail(context, 404, 'Caso sanitario no encontrado');
});

casosSanitariosRoutes.post('/', async (context: any) => {
  if (context.user.rol === 'administrador') return fail(context, 403, 'El administrador tiene acceso de auditoría únicamente');
  const parsed = crearCasoSchema.safeParse(context.body);
  if (!parsed.success) return fail(context, 400, parsed.error.issues[0]?.message || 'Datos inválidos');

  const objectives = await Promise.all(parsed.data.objetivos.map((item) => getObjective(item.tipo, item.id, context.user.id)));
  if (objectives.some((item) => !item)) return fail(context, 404, 'Una entidad no existe o no pertenece al usuario');
  const apiarioId = objectives[0]!.apiarioId;
  if (objectives.some((item) => item!.apiarioId !== apiarioId)) return fail(context, 400, 'Todos los objetivos deben pertenecer al mismo apiario');

  const [pathology] = parsed.data.patologiaId
    ? await sql`SELECT * FROM patologias_sanitarias WHERE id = ${parsed.data.patologiaId}`
    : [];
  if (parsed.data.patologiaId && !pathology) return fail(context, 400, 'Patología no válida');

  const codigo = `CAS-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const created = await sql.begin(async (tx) => {
    const row = await insert('casos_sanitarios', {
      codigo,
      titulo: parsed.data.titulo,
      descripcion: parsed.data.descripcion,
      gravedad: parsed.data.gravedad,
      proximaRevision: parsed.data.proximaRevision ? new Date(parsed.data.proximaRevision) : undefined,
      usuarioId: context.user.id,
      apiarioId,
      patologiaId: pathology?.id,
      requiereNotificacionIca: pathology?.declaracionObligatoria ?? false,
      inspeccionOrigenId: parsed.data.inspeccionOrigenId,
    }, tx as any);
    for (const item of objectives) {
      await tx`INSERT INTO casos_sanitarios_objetivos ${tx({
        id: crypto.randomUUID().replace(/-/g, ''),
        casoId: row.id,
        colmenaId: item!.tipo === 'colmena' ? item!.id : null,
        nucleoId: item!.tipo === 'nucleo' ? item!.id : null,
        enjambreId: item!.tipo === 'enjambre' ? item!.id : null,
      })}`;
    }
    return row;
  });
  const [caso] = await withCasoRelations([created]);
  context.set.status = 201;
  return { success: true, data: caso, message: 'Caso sanitario abierto' };
});

casosSanitariosRoutes.post('/:id/acciones', async (context: any) => {
  if (context.user.rol === 'administrador') return fail(context, 403, 'El administrador tiene acceso de auditoría únicamente');
  const parsed = crearAccionSchema.safeParse(context.body);
  if (!parsed.success) return fail(context, 400, parsed.error.issues[0]?.message || 'Datos inválidos');

  const [casoRow] = await sql`SELECT * FROM casos_sanitarios WHERE id = ${context.params.id} AND "usuarioId" = ${context.user.id} AND "anuladoAt" IS NULL LIMIT 1`;
  if (!casoRow) return fail(context, 404, 'Caso sanitario no encontrado');
  const caso = { ...casoRow, objetivos: await sql`SELECT * FROM casos_sanitarios_objetivos WHERE "casoId" = ${casoRow.id}` };
  if (!['abierto', 'en_seguimiento'].includes(caso.estado)) return fail(context, 409, 'El caso ya está cerrado');

  const data = parsed.data;
  const policyError = validateHealthAction(data, caso.objetivos.map((item: Row) => item.id));
  if (policyError) return fail(context, 400, policyError);

  const result = await sql.begin(async (tx) => {
    const accion = await insert('acciones_sanitarias', {
      casoId: caso.id,
      tipo: data.tipo,
      fecha: data.fecha ? new Date(data.fecha) : new Date(),
      descripcion: data.descripcion,
      objetivoIds: data.objetivoIds,
      responsable: data.responsable,
      metodo: data.metodo,
      disposicionFinal: data.disposicionFinal,
      productoNombre: data.productoNombre,
      productoRegistroIca: data.productoRegistroIca,
      retiroHasta: data.retiroHasta ? new Date(data.retiroHasta) : undefined,
      referenciaIca: data.referenciaIca,
      evidencias: data.evidencias,
      registradoPorId: context.user.id,
    }, tx as any);

    if (data.tipo === 'sacrificio_destruccion') {
      for (const objetivo of caso.objetivos) {
        if (objetivo.colmenaId) await updateById('colmenas', objetivo.colmenaId, { estado: 'destruida' }, tx as any);
        if (objetivo.nucleoId) {
          await updateById('nucleos', objetivo.nucleoId, { estado: 'destruido' }, tx as any);
          await insert('eventos_nucleo', { nucleoId: objetivo.nucleoId, tipo: 'destruido', detalle: data.descripcion, registradoPorId: context.user.id }, tx as any);
        }
        if (objetivo.enjambreId) await updateById('enjambres', objetivo.enjambreId, { estado: 'inactivo' }, tx as any);
      }
      await updateById('casos_sanitarios', caso.id, { estado: 'cerrado_sacrificio', fechaCierre: new Date() }, tx as any);
    } else if (data.tipo === 'recuperacion') {
      await updateById('casos_sanitarios', caso.id, { estado: 'cerrado_recuperado', fechaCierre: new Date() }, tx as any);
    } else if (caso.estado === 'abierto') {
      await updateById('casos_sanitarios', caso.id, { estado: 'en_seguimiento' }, tx as any);
    }
    return accion;
  });

  context.set.status = 201;
  return { success: true, data: result, message: 'Acción sanitaria registrada' };
});

casosSanitariosRoutes.post('/:id/anulaciones', async (context: any) => {
  const motivo = z.object({ motivo: z.string().trim().min(5).max(1000) }).safeParse(context.body);
  if (!motivo.success) return fail(context, 400, 'El motivo de anulación es obligatorio');
  const [caso] = await sql`SELECT * FROM casos_sanitarios WHERE id = ${context.params.id}`;
  if (!caso) return fail(context, 404, 'Caso sanitario no encontrado');
  if (context.user.rol !== 'administrador' && caso.usuarioId !== context.user.id) return fail(context, 403, 'No tienes permisos');
  if (caso.anuladoAt) return fail(context, 409, 'El caso ya fue anulado');
  const updated = await updateById('casos_sanitarios', caso.id, { estado: 'anulado', anuladoAt: new Date(), anuladoPorId: context.user.id, motivoAnulacion: motivo.data.motivo });
  return { success: true, data: updated, message: 'Caso anulado sin eliminar su trazabilidad' };
});

casosSanitariosRoutes.post('/:id/acciones/:accionId/anulaciones', async (context: any) => {
  const motivo = z.object({ motivo: z.string().trim().min(5).max(1000) }).safeParse(context.body);
  if (!motivo.success) return fail(context, 400, 'El motivo de anulación es obligatorio');
  const [action] = await sql`
    SELECT a.*, c."usuarioId" AS "casoUsuarioId" FROM acciones_sanitarias a JOIN casos_sanitarios c ON c.id = a."casoId"
    WHERE a.id = ${context.params.accionId} AND a."casoId" = ${context.params.id} LIMIT 1`;
  if (!action) return fail(context, 404, 'Acción sanitaria no encontrada');
  if (context.user.rol !== 'administrador' && action.casoUsuarioId !== context.user.id) return fail(context, 403, 'No tienes permisos');
  if (['sacrificio_destruccion', 'recuperacion'].includes(action.tipo)) return fail(context, 409, 'Una resolución final requiere un proceso de reversión y no puede anularse directamente');
  const updated = await updateById('acciones_sanitarias', action.id, { anuladoAt: new Date(), anuladoPorId: context.user.id, motivoAnulacion: motivo.data.motivo });
  return { success: true, data: updated };
});

export default casosSanitariosRoutes;
