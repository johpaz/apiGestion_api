import { Elysia } from 'elysia';
import { z } from 'zod';
import { authGuard } from '../middleware/auth';
import prisma from '../prisma/client';
import { getPaymentStatus, validateFinancialAmounts } from '../services/financialPolicy';

const financialSchema = z.object({
  tipo: z.enum(['ingreso', 'egreso']),
  descripcion: z.string().trim().min(1, 'Indica qué se vendió o el concepto').max(240),
  monto: z.number().finite().min(0),
  fecha: z.string().min(1).optional(),
  categoria: z.string().trim().max(80).optional().nullable(),
  referencia: z.string().trim().max(120).optional().nullable(),
  esVenta: z.boolean().default(false),
  producto: z.string().trim().max(120).optional().nullable(),
  cantidad: z.number().finite().positive().optional().nullable(),
  unidad: z.string().trim().max(40).optional().nullable(),
  compradorNombre: z.string().trim().max(160).optional().nullable(),
  valorTotal: z.number().finite().positive().optional().nullable(),
  medioPago: z.string().trim().max(60).optional().nullable(),
  observaciones: z.string().trim().max(500).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.esVenta && data.tipo !== 'ingreso') {
    ctx.addIssue({ code: 'custom', message: 'Una venta debe registrarse como ingreso', path: ['tipo'] });
  }
  const error = validateFinancialAmounts({ isSale: data.esVenta, amount: data.monto, total: data.valorTotal });
  if (error) ctx.addIssue({ code: 'custom', message: error, path: ['monto'] });
});

type FinancialInput = z.infer<typeof financialSchema>;

function fail(context: any, status: number, error: string, details?: unknown) {
  context.set.status = status;
  return { success: false, error, details };
}

function parseDate(value?: string) {
  const date = value ? new Date(`${value.slice(0, 10)}T12:00:00.000Z`) : new Date();
  return Number.isNaN(date.getTime()) ? null : date;
}

function serialize(transaction: any) {
  const total = transaction.esVenta ? (transaction.valorTotal ?? transaction.monto) : null;
  return {
    id: transaction.id,
    fecha: transaction.fecha.toISOString(),
    tipo: transaction.tipo,
    categoria: transaction.categoria || 'otros',
    descripcion: transaction.descripcion,
    monto: transaction.monto,
    referencia: transaction.referencia,
    esVenta: transaction.esVenta,
    producto: transaction.producto,
    cantidad: transaction.cantidad,
    unidad: transaction.unidad,
    compradorNombre: transaction.compradorNombre,
    valorTotal: total,
    estadoPago: transaction.esVenta ? (transaction.estadoPago ?? getPaymentStatus(total ?? transaction.monto, transaction.monto)) : null,
    medioPago: transaction.medioPago,
    observaciones: transaction.observaciones,
    origen: transaction.origen,
    bloqueada: Boolean(transaction.ventaNucleo),
    usuarioId: transaction.usuarioId,
    fechaCreacion: transaction.fechaCreacion,
    fechaActualizacion: transaction.fechaActualizacion,
  };
}

function toData(data: FinancialInput, date: Date) {
  const total = data.esVenta ? data.valorTotal! : null;
  return {
    tipo: data.tipo,
    descripcion: data.descripcion,
    monto: data.monto,
    fecha: date,
    categoria: data.esVenta ? (data.categoria || 'venta_otros') : data.categoria,
    referencia: data.referencia || null,
    esVenta: data.esVenta,
    producto: data.esVenta ? (data.producto || data.descripcion) : null,
    cantidad: data.esVenta ? data.cantidad : null,
    unidad: data.esVenta ? data.unidad : null,
    compradorNombre: data.esVenta ? data.compradorNombre : null,
    valorTotal: total,
    estadoPago: data.esVenta ? getPaymentStatus(total!, data.monto) : null,
    medioPago: data.tipo === 'ingreso' ? data.medioPago : null,
    observaciones: data.observaciones || null,
  };
}

const routes = new Elysia({ prefix: '/finanzas' }).use(authGuard);

routes.get('/', async (context: any) => {
  const transactions = await prisma.transaccion.findMany({
    where: { usuarioId: context.user.id, anuladoAt: null },
    include: { ventaNucleo: { select: { id: true } } },
    orderBy: [{ fecha: 'desc' }, { fechaCreacion: 'desc' }],
  });
  return { success: true, data: transactions.map(serialize) };
});

routes.get('/resumen', async (context: any) => {
  const transactions = await prisma.transaccion.findMany({
    where: { usuarioId: context.user.id, anuladoAt: null },
    select: { tipo: true, monto: true, esVenta: true, valorTotal: true },
  });
  const ingresos = transactions.filter((item) => item.tipo === 'ingreso').reduce((sum, item) => sum + item.monto, 0);
  const egresos = transactions.filter((item) => item.tipo === 'egreso').reduce((sum, item) => sum + item.monto, 0);
  const sales = transactions.filter((item) => item.esVenta);
  const totalVentas = sales.reduce((sum, item) => sum + (item.valorTotal ?? item.monto), 0);
  const cobradoVentas = sales.reduce((sum, item) => sum + item.monto, 0);
  return {
    success: true,
    data: {
      ingresos,
      egresos,
      balance: ingresos - egresos,
      totalRegistros: transactions.length,
      totalVentas,
      cobradoVentas,
      porCobrar: Math.max(0, totalVentas - cobradoVentas),
      numeroVentas: sales.length,
    },
  };
});

routes.get('/mensual', async (context: any) => {
  const year = new Date().getFullYear();
  const transactions = await prisma.transaccion.findMany({
    where: {
      usuarioId: context.user.id,
      anuladoAt: null,
      fecha: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lt: new Date(`${year + 1}-01-01T00:00:00.000Z`) },
    },
    select: { fecha: true, tipo: true, monto: true, esVenta: true, valorTotal: true },
  });
  const months = Array.from({ length: 12 }, (_, index) => ({ mes: index + 1, ingresos: 0, egresos: 0, ventas: 0, balance: 0 }));
  for (const item of transactions) {
    const month = months[item.fecha.getUTCMonth()];
    if (item.tipo === 'ingreso') month.ingresos += item.monto;
    else month.egresos += item.monto;
    if (item.esVenta) month.ventas += item.valorTotal ?? item.monto;
    month.balance = month.ingresos - month.egresos;
  }
  return { success: true, data: months, year };
});

routes.post('/', async (context: any) => {
  const parsed = financialSchema.safeParse(context.body);
  if (!parsed.success) return fail(context, 400, parsed.error.issues[0]?.message || 'Datos inválidos', parsed.error.flatten());
  const date = parseDate(parsed.data.fecha);
  if (!date) return fail(context, 400, 'La fecha no es válida');
  const transaction = await prisma.transaccion.create({
    data: { ...toData(parsed.data, date), usuarioId: context.user.id },
    include: { ventaNucleo: { select: { id: true } } },
  });
  context.set.status = 201;
  return { success: true, data: serialize(transaction), message: parsed.data.esVenta ? 'Venta registrada' : 'Movimiento registrado' };
});

routes.put('/:id', async (context: any) => {
  const existing = await prisma.transaccion.findFirst({
    where: { id: context.params.id, usuarioId: context.user.id, anuladoAt: null },
    include: { ventaNucleo: { select: { id: true } } },
  });
  if (!existing) return fail(context, 404, 'Registro no encontrado');
  if (existing.ventaNucleo) return fail(context, 409, 'Esta venta se gestiona desde Núcleos para conservar su trazabilidad');
  const parsed = financialSchema.safeParse(context.body);
  if (!parsed.success) return fail(context, 400, parsed.error.issues[0]?.message || 'Datos inválidos', parsed.error.flatten());
  const date = parseDate(parsed.data.fecha);
  if (!date) return fail(context, 400, 'La fecha no es válida');
  const transaction = await prisma.transaccion.update({
    where: { id: existing.id },
    data: toData(parsed.data, date),
    include: { ventaNucleo: { select: { id: true } } },
  });
  return { success: true, data: serialize(transaction), message: 'Registro actualizado' };
});

routes.delete('/:id', async (context: any) => {
  const existing = await prisma.transaccion.findFirst({
    where: { id: context.params.id, usuarioId: context.user.id, anuladoAt: null },
    include: { ventaNucleo: { select: { id: true } } },
  });
  if (!existing) return fail(context, 404, 'Registro no encontrado');
  if (existing.ventaNucleo) return fail(context, 409, 'Anula esta venta desde Núcleos para conservar su trazabilidad');
  await prisma.transaccion.update({
    where: { id: existing.id },
    data: { anuladoAt: new Date(), anuladoPorId: context.user.id, motivoAnulacion: 'Anulado desde ventas e ingresos' },
  });
  return { success: true, message: 'Registro anulado; se conserva en el historial' };
});

export default routes;
