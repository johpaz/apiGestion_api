export interface InventorySourceInput {
  esPersonalizado?: boolean;
  catalogoItemId?: string;
  nombre?: string;
  unidad?: string;
}

export const validateInventorySource = (input: InventorySourceInput): string | null => {
  if (input.esPersonalizado) {
    if (input.catalogoItemId?.trim()) return 'Un artículo personalizado no debe usar un elemento del catálogo';
    if (!input.nombre?.trim() || input.nombre.trim().length < 2) return 'Escribe el nombre del artículo personalizado';
    if (!input.unidad?.trim()) return 'Selecciona la unidad del artículo personalizado';
    return null;
  }

  return input.catalogoItemId?.trim() ? null : 'Selecciona un artículo del catálogo o crea uno personalizado';
};

export function inventoryPurchaseTotal(input: { isPurchase: boolean; type: 'entrada' | 'salida' | 'ajuste'; quantity: number; unitCost?: number }): number {
  if (!input.isPurchase) return 0;
  if (input.type !== 'entrada') throw new Error('Solo una entrada por compra puede registrar un gasto');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('La compra debe tener una cantidad mayor que cero');
  if (!Number.isFinite(input.unitCost) || (input.unitCost ?? 0) <= 0) throw new Error('Indica el precio unitario pagado; el valor de mercado no es un gasto');
  const total = Math.round(input.quantity * input.unitCost! * 100) / 100;
  if (!Number.isFinite(total) || total <= 0 || total > Number.MAX_SAFE_INTEGER) throw new Error('El valor total de la compra no es válido');
  return total;
}
