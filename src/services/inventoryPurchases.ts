import { insert, type Executor, type Row } from '../db';

export async function recordInventoryExpense(db: Executor, item: Row, movement: Row, userId: string, amount: number) {
  if (!amount) return null;
  return insert('transacciones', {
    usuarioId: userId, tipo: 'egreso', descripcion: `Compra de ${item.nombre}`, monto: amount,
    fecha: movement.fecha, categoria: item.tipoItem === 'activo' ? 'compra_activos' : 'compra_insumos',
    referencia: `INV:${movement.id}`, esVenta: false, producto: item.nombre,
    cantidad: movement.cantidad, unidad: item.unidad, origen: 'compra_inventario',
    observaciones: `Compra vinculada al artículo ${item.id} y al movimiento ${movement.id}.`,
  }, db);
}
