import { Elysia } from 'elysia';
import { z } from 'zod';
import { authGuard } from '../middleware/auth';
import prisma from '../prisma/client';
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

const includeCaso = {
  apiario: { select: { id: true, nombre: true, registroIcaNumero: true } },
  patologia: true,
  objetivos: {
    include: {
      colmena: { select: { id: true, nombre: true, estado: true } },
      nucleo: { select: { id: true, codigo: true, numero: true, estado: true } },
      enjambre: { select: { id: true, nombre: true, estado: true } },
    },
  },
  acciones: { where: { anuladoAt: null }, orderBy: { fecha: 'asc' as const } },
};

const fail = (context: any, status: number, error: string) => {
  context.set.status = status;
  return { success: false, error };
};

const getObjective = async (tipo: string, id: string, userId: string) => {
  if (tipo === 'colmena') {
    const entity = await prisma.colmena.findFirst({ where: { id, usuarioId: userId }, select: { id: true, apiarioId: true } });
    return entity && { tipo, id: entity.id, apiarioId: entity.apiarioId };
  }
  if (tipo === 'nucleo') {
    const entity = await prisma.nucleo.findFirst({ where: { id, apiario: { usuarioId: userId } }, select: { id: true, apiarioId: true } });
    return entity && { tipo, id: entity.id, apiarioId: entity.apiarioId };
  }
  const entity = await prisma.enjambre.findFirst({
    where: { id, colmena: { usuarioId: userId } },
    select: { id: true, colmena: { select: { apiarioId: true } } },
  });
  return entity && { tipo, id: entity.id, apiarioId: entity.colmena.apiarioId };
};

const casosSanitariosRoutes = new Elysia({ prefix: '/casos-sanitarios' }).use(authGuard);

casosSanitariosRoutes.get('/catalogo/patologias', async () => ({
  success: true,
  data: await prisma.patologiaSanitaria.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' } }),
}));

casosSanitariosRoutes.get('/', async (context: any) => {
  const where: any = { anuladoAt: null };
  if (context.user.rol !== 'administrador') where.usuarioId = context.user.id;
  if (context.query?.estado) where.estado = context.query.estado;
  if (context.query?.apiarioId) where.apiarioId = context.query.apiarioId;

  const casos = await prisma.casoSanitario.findMany({
    where,
    include: includeCaso,
    orderBy: { fechaApertura: 'desc' },
  });
  return { success: true, data: casos };
});

casosSanitariosRoutes.get('/:id', async (context: any) => {
  const caso = await prisma.casoSanitario.findFirst({
    where: {
      id: context.params.id,
      ...(context.user.rol === 'administrador' ? {} : { usuarioId: context.user.id }),
    },
    include: includeCaso,
  });
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

  const pathology = parsed.data.patologiaId
    ? await prisma.patologiaSanitaria.findUnique({ where: { id: parsed.data.patologiaId } })
    : null;
  if (parsed.data.patologiaId && !pathology) return fail(context, 400, 'Patología no válida');

  const codigo = `CAS-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const caso = await prisma.casoSanitario.create({
    data: {
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
      objetivos: {
        create: objectives.map((item) => ({
          colmenaId: item!.tipo === 'colmena' ? item!.id : undefined,
          nucleoId: item!.tipo === 'nucleo' ? item!.id : undefined,
          enjambreId: item!.tipo === 'enjambre' ? item!.id : undefined,
        })),
      },
    },
    include: includeCaso,
  });
  context.set.status = 201;
  return { success: true, data: caso, message: 'Caso sanitario abierto' };
});

casosSanitariosRoutes.post('/:id/acciones', async (context: any) => {
  if (context.user.rol === 'administrador') return fail(context, 403, 'El administrador tiene acceso de auditoría únicamente');
  const parsed = crearAccionSchema.safeParse(context.body);
  if (!parsed.success) return fail(context, 400, parsed.error.issues[0]?.message || 'Datos inválidos');

  const caso = await prisma.casoSanitario.findFirst({
    where: { id: context.params.id, usuarioId: context.user.id, anuladoAt: null },
    include: { objetivos: true },
  });
  if (!caso) return fail(context, 404, 'Caso sanitario no encontrado');
  if (!['abierto', 'en_seguimiento'].includes(caso.estado)) return fail(context, 409, 'El caso ya está cerrado');

  const data = parsed.data;
  const policyError = validateHealthAction(data, caso.objetivos.map((item) => item.id));
  if (policyError) return fail(context, 400, policyError);

  const result = await prisma.$transaction(async (tx) => {
    const accion = await tx.accionSanitaria.create({
      data: {
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
      },
    });

    if (data.tipo === 'sacrificio_destruccion') {
      for (const objetivo of caso.objetivos) {
        if (objetivo.colmenaId) await tx.colmena.update({ where: { id: objetivo.colmenaId }, data: { estado: 'destruida' } });
        if (objetivo.nucleoId) {
          await tx.nucleo.update({ where: { id: objetivo.nucleoId }, data: { estado: 'destruido' } });
          await tx.eventoNucleo.create({ data: { nucleoId: objetivo.nucleoId, tipo: 'destruido', detalle: data.descripcion, registradoPorId: context.user.id } });
        }
        if (objetivo.enjambreId) await tx.enjambre.update({ where: { id: objetivo.enjambreId }, data: { estado: 'inactivo' } });
      }
      await tx.casoSanitario.update({ where: { id: caso.id }, data: { estado: 'cerrado_sacrificio', fechaCierre: new Date() } });
    } else if (data.tipo === 'recuperacion') {
      await tx.casoSanitario.update({ where: { id: caso.id }, data: { estado: 'cerrado_recuperado', fechaCierre: new Date() } });
    } else if (caso.estado === 'abierto') {
      await tx.casoSanitario.update({ where: { id: caso.id }, data: { estado: 'en_seguimiento' } });
    }
    return accion;
  });

  context.set.status = 201;
  return { success: true, data: result, message: 'Acción sanitaria registrada' };
});

casosSanitariosRoutes.post('/:id/anulaciones', async (context: any) => {
  const motivo = z.object({ motivo: z.string().trim().min(5).max(1000) }).safeParse(context.body);
  if (!motivo.success) return fail(context, 400, 'El motivo de anulación es obligatorio');
  const caso = await prisma.casoSanitario.findFirst({ where: { id: context.params.id } });
  if (!caso) return fail(context, 404, 'Caso sanitario no encontrado');
  if (context.user.rol !== 'administrador' && caso.usuarioId !== context.user.id) return fail(context, 403, 'No tienes permisos');
  if (caso.anuladoAt) return fail(context, 409, 'El caso ya fue anulado');
  const updated = await prisma.casoSanitario.update({
    where: { id: caso.id },
    data: { estado: 'anulado', anuladoAt: new Date(), anuladoPorId: context.user.id, motivoAnulacion: motivo.data.motivo },
  });
  return { success: true, data: updated, message: 'Caso anulado sin eliminar su trazabilidad' };
});

casosSanitariosRoutes.post('/:id/acciones/:accionId/anulaciones', async (context: any) => {
  const motivo = z.object({ motivo: z.string().trim().min(5).max(1000) }).safeParse(context.body);
  if (!motivo.success) return fail(context, 400, 'El motivo de anulación es obligatorio');
  const action = await prisma.accionSanitaria.findFirst({ where: { id: context.params.accionId, casoId: context.params.id }, include: { caso: true } });
  if (!action) return fail(context, 404, 'Acción sanitaria no encontrada');
  if (context.user.rol !== 'administrador' && action.caso.usuarioId !== context.user.id) return fail(context, 403, 'No tienes permisos');
  if (['sacrificio_destruccion', 'recuperacion'].includes(action.tipo)) return fail(context, 409, 'Una resolución final requiere un proceso de reversión y no puede anularse directamente');
  const updated = await prisma.accionSanitaria.update({
    where: { id: action.id },
    data: { anuladoAt: new Date(), anuladoPorId: context.user.id, motivoAnulacion: motivo.data.motivo },
  });
  return { success: true, data: updated };
});

export default casosSanitariosRoutes;
