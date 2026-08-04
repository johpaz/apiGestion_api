import { Elysia } from 'elysia';
import { z } from 'zod';
import { authGuard } from '../middleware/auth';
import prisma from '../prisma/client';
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

const updateSchema = createSchema.pick({
  numero: true, codigo: true, tipo: true, estado: true, origenReina: true,
  detalleOrigenReina: true, proveedorReina: true,
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

const includeNucleo = {
  apiario: { select: { id: true, nombre: true, ciudad: true, registroIcaNumero: true } },
  colmenaOrigen: { select: { id: true, nombre: true } },
  donantes: { include: { colmena: { select: { id: true, nombre: true } } } },
  eventos: { where: { anuladoAt: null }, orderBy: { fecha: 'desc' as const } },
  ventas: { orderBy: { fecha: 'desc' as const } },
  conversiones: { include: { colmena: { select: { id: true, nombre: true, estado: true } } }, orderBy: { fecha: 'desc' as const } },
};

const fail = (context: any, status: number, error: string) => {
  context.set.status = status;
  return { success: false, error };
};

const findOwnedNucleo = (id: string, userId: string) => prisma.nucleo.findFirst({
  where: { id, apiario: { usuarioId: userId } }, include: includeNucleo,
});

const hasOpenCase = async (nucleoId: string) => Boolean(await prisma.casoSanitario.findFirst({
  where: {
    anuladoAt: null,
    estado: { in: ['abierto', 'en_seguimiento'] },
    objetivos: { some: { nucleoId } },
  },
  select: { id: true },
}));

const nucleosRoutes = new Elysia({ prefix: '/nucleos' }).use(authGuard);

nucleosRoutes.get('/', async (context: any) => {
  const where = context.user.rol === 'administrador' ? {} : { apiario: { usuarioId: context.user.id } };
  const nucleos = await prisma.nucleo.findMany({ where, include: includeNucleo, orderBy: { fechaFormacion: 'desc' } });
  return { success: true, data: nucleos };
});

nucleosRoutes.get('/:id', async (context: any) => {
  const nucleo = await prisma.nucleo.findFirst({
    where: { id: context.params.id, ...(context.user.rol === 'administrador' ? {} : { apiario: { usuarioId: context.user.id } }) },
    include: includeNucleo,
  });
  return nucleo ? { success: true, data: nucleo } : fail(context, 404, 'Núcleo no encontrado');
});

nucleosRoutes.get('/:id/trazabilidad', async (context: any) => {
  const nucleo = await prisma.nucleo.findFirst({
    where: { id: context.params.id, ...(context.user.rol === 'administrador' ? {} : { apiario: { usuarioId: context.user.id } }) },
    include: {
      ...includeNucleo,
      inspecciones: { where: { anuladoAt: null }, orderBy: { fecha: 'desc' } },
      casosSanitarios: { include: { caso: { include: { patologia: true, acciones: { where: { anuladoAt: null } } } } } },
    },
  });
  return nucleo ? { success: true, data: nucleo } : fail(context, 404, 'Núcleo no encontrado');
});

nucleosRoutes.post('/', async (context: any) => {
  if (context.user.rol === 'administrador') return fail(context, 403, 'El administrador tiene acceso de auditoría únicamente');
  const parsed = createSchema.safeParse(context.body);
  if (!parsed.success) return fail(context, 400, parsed.error.issues[0]?.message || 'Datos inválidos');
  const data = parsed.data;
  const apiario = await prisma.apiario.findFirst({ where: { id: data.apiarioId, usuarioId: context.user.id } });
  if (!apiario) return fail(context, 404, 'Apiario no encontrado');

  const donorIds = Array.from(new Set([...data.donanteIds, ...(data.colmenaOrigenId ? [data.colmenaOrigenId] : [])]));
  if (donorIds.length) {
    const donors = await prisma.colmena.count({ where: { id: { in: donorIds }, apiarioId: apiario.id, usuarioId: context.user.id } });
    if (donors !== donorIds.length) return fail(context, 400, 'Todas las colmenas donantes deben pertenecer al apiario');
  }

  try {
    const nucleo = await prisma.$transaction(async (tx) => {
      const created = await tx.nucleo.create({
        data: {
          numero: data.numero,
          codigo: data.codigo,
          tipo: data.tipo,
          estado: data.estado,
          fechaInstalacion: data.fechaFormacion ? new Date(data.fechaFormacion) : new Date(),
          fechaFormacion: data.fechaFormacion ? new Date(data.fechaFormacion) : new Date(),
          apiarioId: apiario.id,
          colmenaOrigenId: data.colmenaOrigenId,
          origenReina: data.origenReina,
          detalleOrigenReina: data.detalleOrigenReina,
          proveedorReina: data.proveedorReina,
          donantes: { create: donorIds.map((colmenaId) => ({ colmenaId })) },
          eventos: { create: { tipo: 'creado', detalle: `Núcleo ${data.codigo} formado en ${apiario.nombre}`, registradoPorId: context.user.id } },
        },
        include: includeNucleo,
      });
      return created;
    });

    AlertService.createRecurrentAlertsForEntity('nucleo', nucleo.id, `Núcleo ${nucleo.codigo}`, context.user.id).catch(console.error);
    context.set.status = 201;
    return { success: true, data: nucleo, message: 'Núcleo registrado con trazabilidad' };
  } catch (error: any) {
    if (error.code === 'P2002') return fail(context, 409, 'El código del núcleo ya existe en este apiario');
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

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.nucleo.update({ where: { id: nucleo.id }, data: parsed.data, include: includeNucleo });
    await tx.eventoNucleo.create({
      data: { nucleoId: nucleo.id, tipo: parsed.data.estado && parsed.data.estado !== nucleo.estado ? 'cambio_estado' : 'actualizado', detalle: 'Datos del núcleo actualizados', datos: parsed.data, registradoPorId: context.user.id },
    });
    return result;
  });
  return { success: true, data: updated };
});

nucleosRoutes.post('/:id/conversiones', async (context: any) => {
  if (context.user.rol === 'administrador') return fail(context, 403, 'El administrador tiene acceso de auditoría únicamente');
  const parsed = conversionSchema.safeParse(context.body);
  if (!parsed.success) return fail(context, 400, parsed.error.issues[0]?.message || 'Datos inválidos');
  const nucleo = await findOwnedNucleo(context.params.id, context.user.id);
  if (!nucleo) return fail(context, 404, 'Núcleo no encontrado');
  const policyError = validateNucleusFinalization(nucleo.estado, await hasOpenCase(nucleo.id));
  if (policyError) return fail(context, 409, policyError);
  const apiario = await prisma.apiario.findFirst({ where: { id: parsed.data.apiarioId, usuarioId: context.user.id } });
  if (!apiario) return fail(context, 404, 'Apiario de destino no encontrado');

  const conversion = await prisma.$transaction(async (tx) => {
    const fecha = parsed.data.fecha ? new Date(parsed.data.fecha) : new Date();
    const colmena = await tx.colmena.create({ data: { nombre: parsed.data.nombreColmena, estado: 'activa', fechaInstalacion: fecha, apiarioId: apiario.id, usuarioId: context.user.id } });
    const result = await tx.conversionNucleo.create({ data: { nucleoId: nucleo.id, colmenaId: colmena.id, fecha, observaciones: parsed.data.observaciones, creadoPorId: context.user.id }, include: { colmena: true } });
    await tx.nucleo.update({ where: { id: nucleo.id }, data: { estado: 'convertido' } });
    await tx.eventoNucleo.create({ data: { nucleoId: nucleo.id, tipo: 'convertido', detalle: `Convertido en colmena ${colmena.nombre}`, datos: { colmenaId: colmena.id, apiarioId: apiario.id }, registradoPorId: context.user.id } });
    return result;
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

  const venta = await prisma.$transaction(async (tx) => {
    const fecha = parsed.data.fecha ? new Date(parsed.data.fecha) : new Date();
    const transaccion = await tx.transaccion.create({ data: { tipo: 'ingreso', descripcion: `Venta del núcleo ${nucleo.codigo} a ${parsed.data.compradorNombre}`, monto: parsed.data.monto, fecha, categoria: 'venta_nucleo', referencia: parsed.data.comprobantePath, esVenta: true, producto: `Núcleo ${nucleo.codigo}`, cantidad: 1, unidad: 'unidad', compradorNombre: parsed.data.compradorNombre, valorTotal: parsed.data.monto, estadoPago: 'pagado', origen: 'venta_nucleo', usuarioId: context.user.id } });
    const result = await tx.ventaNucleo.create({ data: { ...parsed.data, fecha, nucleoId: nucleo.id, transaccionId: transaccion.id, creadoPorId: context.user.id }, include: { transaccion: true } });
    await tx.nucleo.update({ where: { id: nucleo.id }, data: { estado: 'vendido' } });
    await tx.eventoNucleo.create({ data: { nucleoId: nucleo.id, tipo: 'vendido', detalle: `Vendido a ${parsed.data.compradorNombre}; destino: ${parsed.data.destinoApiario}`, datos: { ventaId: result.id, transaccionId: transaccion.id }, registradoPorId: context.user.id } });
    return result;
  });
  context.set.status = 201;
  return { success: true, data: venta, message: 'Venta e ingreso financiero registrados' };
});

nucleosRoutes.post('/:id/anulaciones', async (context: any) => {
  const parsed = z.object({ motivo: z.string().trim().min(5).max(1000) }).safeParse(context.body);
  if (!parsed.success) return fail(context, 400, 'El motivo es obligatorio');
  const nucleo = await prisma.nucleo.findUnique({ where: { id: context.params.id }, include: { apiario: true } });
  if (!nucleo) return fail(context, 404, 'Núcleo no encontrado');
  if (context.user.rol !== 'administrador' && nucleo.apiario.usuarioId !== context.user.id) return fail(context, 403, 'No tienes permisos');
  if (['convertido', 'vendido', 'destruido'].includes(nucleo.estado)) return fail(context, 409, 'El resultado final debe anularse desde su venta, conversión o caso sanitario');
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.nucleo.update({ where: { id: nucleo.id }, data: { estado: 'anulado' } });
    await tx.eventoNucleo.create({ data: { nucleoId: nucleo.id, tipo: 'anulado', detalle: parsed.data.motivo, registradoPorId: context.user.id } });
    return result;
  });
  return { success: true, data: updated };
});

nucleosRoutes.post('/:id/ventas/:ventaId/anulaciones', async (context: any) => {
  const parsed = z.object({ motivo: z.string().trim().min(5).max(1000) }).safeParse(context.body);
  if (!parsed.success) return fail(context, 400, 'El motivo es obligatorio');
  const venta = await prisma.ventaNucleo.findFirst({ where: { id: context.params.ventaId, nucleoId: context.params.id }, include: { nucleo: { include: { apiario: true } } } });
  if (!venta) return fail(context, 404, 'Venta no encontrada');
  if (context.user.rol !== 'administrador' && venta.nucleo.apiario.usuarioId !== context.user.id) return fail(context, 403, 'No tienes permisos');
  if (venta.anuladoAt) return fail(context, 409, 'La venta ya está anulada');
  await prisma.$transaction(async (tx) => {
    await tx.ventaNucleo.update({ where: { id: venta.id }, data: { anuladoAt: new Date(), anuladoPorId: context.user.id, motivoAnulacion: parsed.data.motivo } });
    await tx.transaccion.update({ where: { id: venta.transaccionId }, data: { anuladoAt: new Date(), anuladoPorId: context.user.id, motivoAnulacion: parsed.data.motivo } });
    await tx.nucleo.update({ where: { id: venta.nucleoId }, data: { estado: 'listo' } });
    await tx.eventoNucleo.create({ data: { nucleoId: venta.nucleoId, tipo: 'anulado', detalle: `Venta anulada: ${parsed.data.motivo}`, registradoPorId: context.user.id } });
  });
  return { success: true, message: 'Venta e ingreso anulados; la trazabilidad fue conservada' };
});

nucleosRoutes.post('/:id/conversiones/:conversionId/anulaciones', async (context: any) => {
  const parsed = z.object({ motivo: z.string().trim().min(5).max(1000) }).safeParse(context.body);
  if (!parsed.success) return fail(context, 400, 'El motivo es obligatorio');
  const conversion = await prisma.conversionNucleo.findFirst({
    where: { id: context.params.conversionId, nucleoId: context.params.id },
    include: { nucleo: { include: { apiario: true } } },
  });
  if (!conversion) return fail(context, 404, 'Conversión no encontrada');
  if (context.user.rol !== 'administrador' && conversion.nucleo.apiario.usuarioId !== context.user.id) return fail(context, 403, 'No tienes permisos');
  if (conversion.anuladoAt) return fail(context, 409, 'La conversión ya está anulada');

  const [inspecciones, producciones, enjambres, casos, nucleosOrigen, nucleosDonados] = await Promise.all([
    prisma.inspeccion.count({ where: { anuladoAt: null, colmenas: { some: { id: conversion.colmenaId } } } }),
    prisma.produccion.count({ where: { colmenaId: conversion.colmenaId } }),
    prisma.enjambre.count({ where: { colmenaId: conversion.colmenaId } }),
    prisma.casoSanitarioObjetivo.count({ where: { colmenaId: conversion.colmenaId, caso: { anuladoAt: null } } }),
    prisma.nucleo.count({ where: { colmenaOrigenId: conversion.colmenaId, estado: { not: 'anulado' } } }),
    prisma.nucleoDonante.count({ where: { colmenaId: conversion.colmenaId, nucleo: { estado: { not: 'anulado' } } } }),
  ]);
  if ([inspecciones, producciones, enjambres, casos, nucleosOrigen, nucleosDonados].some(Boolean)) {
    return fail(context, 409, 'La colmena resultante ya tiene actividad posterior; la conversión no puede anularse');
  }

  await prisma.$transaction(async (tx) => {
    await tx.conversionNucleo.update({ where: { id: conversion.id }, data: { anuladoAt: new Date(), anuladoPorId: context.user.id, motivoAnulacion: parsed.data.motivo } });
    await tx.colmena.update({ where: { id: conversion.colmenaId }, data: { estado: 'abandonada' } });
    await tx.nucleo.update({ where: { id: conversion.nucleoId }, data: { estado: 'listo' } });
    await tx.eventoNucleo.create({ data: { nucleoId: conversion.nucleoId, tipo: 'anulado', detalle: `Conversión anulada: ${parsed.data.motivo}`, datos: { conversionId: conversion.id, colmenaId: conversion.colmenaId }, registradoPorId: context.user.id } });
  });
  return { success: true, message: 'Conversión anulada; la colmena resultante quedó inactiva y la trazabilidad fue conservada' };
});

nucleosRoutes.delete('/:id', (context: any) => fail(context, 405, 'Los núcleos no se eliminan; usa una anulación con motivo'));

export default nucleosRoutes;
