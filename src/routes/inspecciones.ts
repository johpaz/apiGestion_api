import { Elysia } from 'elysia';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, InspeccionSanitaria, Colmena } from '../types/apicola';
import { sql, insert, updateById, updateWhere, idList, type Row } from '../db';
import { AlertService } from '../services/alertService';

const inspeccionesRoutes = new Elysia({ prefix: '/inspecciones' });

// Equivalente a include: { colmenas, nucleos, enjambres, usuario } (el usuario nunca expone su password).
// Tablas de relación muchos-a-muchos (_XToInspeccion): en _NucleoToInspeccion A = inspección y B = núcleo;
// en _ColmenaToInspeccion y _EnjambreToInspeccion A = colmena/enjambre y B = inspección.
async function withRelations(inspecciones: Row[]) {
  if (!inspecciones.length) return [];
  const ids = sql.array(idList(inspecciones), 'TEXT');
  const userIds = sql.array([...new Set(inspecciones.map(i => i.usuarioId as string))], 'TEXT');
  const [colmenas, nucleos, enjambres, usuarios] = await Promise.all([
    sql`SELECT c.*, r."B" AS "inspeccionId" FROM "_ColmenaToInspeccion" r JOIN colmenas c ON c.id = r."A" WHERE r."B" = ANY(${ids})`,
    sql`SELECT n.*, r."A" AS "inspeccionId" FROM "_NucleoToInspeccion" r JOIN nucleos n ON n.id = r."B" WHERE r."A" = ANY(${ids})`,
    sql`SELECT e.*, r."B" AS "inspeccionId" FROM "_EnjambreToInspeccion" r JOIN enjambres e ON e.id = r."A" WHERE r."B" = ANY(${ids})`,
    sql`SELECT id, nombre, email, rol, activo, moneda, "colmenasAsignadas", "fechaRegistro", "ultimoAcceso", "alertasActivadas", "notificacionesEmail", idioma, "imagenPerfil"
        FROM usuarios WHERE id = ANY(${userIds})`,
  ]);
  const userById = new Map(usuarios.map((u: Row) => [u.id, u]));
  const byInspeccion = (rows: Row[]) => {
    const map = new Map<string, Row[]>();
    for (const { inspeccionId, ...rest } of rows) map.set(inspeccionId, [...(map.get(inspeccionId) ?? []), rest]);
    return map;
  };
  const [c, n, e] = [byInspeccion(colmenas), byInspeccion(nucleos), byInspeccion(enjambres)];
  return inspecciones.map(i => ({
    ...i,
    colmenas: c.get(i.id) ?? [],
    nucleos: n.get(i.id) ?? [],
    enjambres: e.get(i.id) ?? [],
    usuario: userById.get(i.usuarioId) ?? null,
  }));
}

inspeccionesRoutes.get('/', async ({ headers }) => {
  try {
   
    const user = await authenticateToken({ headers });
     
    const userId = user?.id;
   

    const inspecciones = await withRelations(
      user.rol === 'administrador'
        ? await sql`SELECT * FROM inspecciones WHERE "anuladoAt" IS NULL ORDER BY fecha DESC`
        : await sql`SELECT * FROM inspecciones WHERE "usuarioId" = ${userId} AND "anuladoAt" IS NULL ORDER BY fecha DESC`
    );

    return {
      success: true,
      data: inspecciones as unknown as InspeccionSanitaria[],
      message: 'Inspecciones obtenidas exitosamente'
    } as ApiResponse<InspeccionSanitaria[]>;
  } catch (error: any) {
    console.error('Get inspecciones error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

inspeccionesRoutes.get('/colmena/:colmenaId', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });

    const { colmenaId } = params;
    const userId = user?.id;
   

    console.log('DEBUG: GET /inspecciones/colmena/:colmenaId - userId:', userId, 'colmenaId:', colmenaId);

    const inspecciones = await withRelations(await sql`
      SELECT i.* FROM inspecciones i
      WHERE i."usuarioId" = ${userId}
        AND EXISTS (SELECT 1 FROM "_ColmenaToInspeccion" r WHERE r."B" = i.id AND r."A" = ${colmenaId})`);

    return {
      success: true,
      data: inspecciones as unknown as InspeccionSanitaria[],
      message: 'Inspecciones de colmena obtenidas exitosamente'
    } as ApiResponse<InspeccionSanitaria[]>;
  } catch (error: any) {
    console.error('Get inspecciones by colmena error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

inspeccionesRoutes.post('/', async ({ body, headers }) => {
  try {
    const user = await authenticateToken({ headers });

    const userId = user?.id;
  

    const inspeccionData = body as any;
    console.log('DEBUG: POST /inspecciones - userId:', userId, 'Datos recibidos:', inspeccionData);

    if (user.rol === 'administrador') {
      return { success: false, error: 'El administrador tiene acceso de auditoría únicamente' } as ApiResponse;
    }

    const colmenaIds: string[] = inspeccionData.colmenaIds || [];
    const nucleoIds: string[] = inspeccionData.nucleoIds || [];
    const enjambreIds: string[] = inspeccionData.enjambreIds || [];
    const [ownedColmenas, ownedNucleos, ownedEnjambres] = await Promise.all([
      sql`SELECT count(*)::int AS n FROM colmenas WHERE id = ANY(${sql.array(colmenaIds, 'TEXT')}) AND "usuarioId" = ${userId}`.then(r => r[0].n as number),
      sql`SELECT count(*)::int AS n FROM nucleos n JOIN apiarios a ON a.id = n."apiarioId" WHERE n.id = ANY(${sql.array(nucleoIds, 'TEXT')}) AND a."usuarioId" = ${userId}`.then(r => r[0].n as number),
      sql`SELECT count(*)::int AS n FROM enjambres e JOIN colmenas c ON c.id = e."colmenaId" WHERE e.id = ANY(${sql.array(enjambreIds, 'TEXT')}) AND c."usuarioId" = ${userId}`.then(r => r[0].n as number),
    ]);
    if (ownedColmenas !== (inspeccionData.colmenaIds || []).length || ownedNucleos !== (inspeccionData.nucleoIds || []).length || ownedEnjambres !== (inspeccionData.enjambreIds || []).length) {
      return { success: false, error: 'Una entidad no existe o no pertenece al usuario' } as ApiResponse;
    }

    const created = await sql.begin(async tx => {
      const row = await insert('inspecciones', {
        fecha: inspeccionData.fecha ? new Date(inspeccionData.fecha) : new Date(),
        estadoSanidad: inspeccionData.estadoSanidad || 'saludable',
        observaciones: inspeccionData.observaciones,
        posiblesEnfermedades: inspeccionData.posiblesEnfermedades || [],
        patologiasApicolas: inspeccionData.patologiasApicolas || [],
        numColmenasAfectadas: inspeccionData.numColmenasAfectadas,
        signosClinicos: inspeccionData.signosClinicos || [],
        proximaRevision: inspeccionData.proximaRevision ? new Date(inspeccionData.proximaRevision) : undefined,
        nucleoIds,
        usuarioId: userId
      }, tx as any);
      for (const id of colmenaIds) await tx`INSERT INTO "_ColmenaToInspeccion" ("A", "B") VALUES (${id}, ${row.id}) ON CONFLICT DO NOTHING`;
      for (const id of nucleoIds) await tx`INSERT INTO "_NucleoToInspeccion" ("A", "B") VALUES (${row.id}, ${id}) ON CONFLICT DO NOTHING`;
      for (const id of enjambreIds) await tx`INSERT INTO "_EnjambreToInspeccion" ("A", "B") VALUES (${id}, ${row.id}) ON CONFLICT DO NOTHING`;
      return row;
    });
    const [newInspeccion] = await withRelations([created]);

    try {
      await AlertService.generateInspectionAlerts(newInspeccion, userId);
    } catch (alertError) {
      console.error('Error generando alertas automáticas:', alertError);
    }

    // Registrar actividad de inspección
    try {
      const colmenaNombre = inspeccionData.colmenaIds?.length > 0
        ? await sql`SELECT nombre FROM colmenas WHERE id = ${inspeccionData.colmenaIds[0]}`
            .then((rows: Row[]) => rows[0]?.nombre || 'Colmena')
        : 'Colmena';

      await insert('actividades', {
        tipo: 'inspeccion',
        titulo: 'Inspección sanitaria completada',
        descripcion: `Inspección sanitaria completada - Estado: ${inspeccionData.estadoSanidad || 'saludable'}`,
        entidadTipo: 'colmena',
        entidadId: inspeccionData.colmenaIds?.[0],
        entidadNombre: colmenaNombre,
        estado: inspeccionData.estadoSanidad === 'enferma' || inspeccionData.estadoSanidad === 'cuarentena' ? 'warning' : 'success',
        usuarioId: userId
      });
    } catch (activityError) {
      console.error('Error registrando actividad de inspección:', activityError);
    }

    return {
      success: true,
      data: newInspeccion as unknown as InspeccionSanitaria,
      message: 'Inspección creada exitosamente'
    } as ApiResponse<InspeccionSanitaria>;
  } catch (error: any) {
    console.error('Create inspeccion error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

inspeccionesRoutes.put('/:id', async ({ params, body, headers }) => {
  try {
    const user = await authenticateToken({ headers });

    const { id } = params;
    const userId = user?.id;
    const inspeccionData = body as any;

    const updated = await updateWhere(
      'inspecciones',
      {
        estadoSanidad: inspeccionData.estadoSanidad,
        observaciones: inspeccionData.observaciones,
        posiblesEnfermedades: inspeccionData.posiblesEnfermedades,
        patologiasApicolas: inspeccionData.patologiasApicolas,
        numColmenasAfectadas: inspeccionData.numColmenasAfectadas,
        signosClinicos: inspeccionData.signosClinicos,
        proximaRevision: inspeccionData.proximaRevision ? new Date(inspeccionData.proximaRevision) : undefined,
        // Note: Relations are handled separately for updates
        nucleoIds: inspeccionData.nucleoIds,
      },
      sql`id = ${id} AND "usuarioId" = ${userId}`
    );

    if (updated.length === 0) {
      return { success: false, error: 'Inspección no encontrada o no autorizada' } as ApiResponse;
    }

    const [inspeccion] = await withRelations(updated);

    try {
      await AlertService.generateInspectionAlerts(inspeccion, userId);
    } catch (alertError) {
      console.error('Error generando alertas automáticas:', alertError);
    }

    return {
      success: true,
      data: inspeccion as unknown as InspeccionSanitaria,
      message: 'Inspección actualizada exitosamente'
    } as ApiResponse<InspeccionSanitaria>;
  } catch (error: any) {
    console.error('Update inspeccion error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

inspeccionesRoutes.post('/:id/anulaciones', async ({ params, body, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const { id } = params;
    const motivo = String((body as any)?.motivo || '').trim();
    if (motivo.length < 5) return { success: false, error: 'El motivo de anulación es obligatorio' } as ApiResponse;
    const [inspeccion] = await sql`SELECT * FROM inspecciones WHERE id = ${id}`;
    if (!inspeccion) return { success: false, error: 'Inspección no encontrada' } as ApiResponse;
    if (user.rol !== 'administrador' && inspeccion.usuarioId !== user.id) return { success: false, error: 'No tienes permisos' } as ApiResponse;
    if (inspeccion.anuladoAt) return { success: false, error: 'La inspección ya está anulada' } as ApiResponse;
    const updated = await updateById('inspecciones', id, { anuladoAt: new Date(), anuladoPorId: user.id, motivoAnulacion: motivo });
    return {
      success: true,
      data: updated,
      message: 'Inspección anulada sin eliminar su historial'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Anular inspeccion error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

inspeccionesRoutes.delete('/:id', () => ({
  success: false,
  error: 'Las inspecciones no se eliminan; usa una anulación con motivo'
} as ApiResponse));

export default inspeccionesRoutes;
