export type PaymentStatus = 'pagado' | 'parcial' | 'pendiente';

export function getPaymentStatus(total: number, received: number): PaymentStatus {
  if (received <= 0) return 'pendiente';
  if (received < total) return 'parcial';
  return 'pagado';
}

export function validateFinancialAmounts(input: {
  isSale: boolean;
  amount: number;
  total?: number | null;
}): string | null {
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    return 'El valor recibido no puede ser negativo';
  }

  if (!input.isSale && input.amount <= 0) {
    return 'El monto debe ser mayor que cero';
  }

  if (input.isSale) {
    if (!Number.isFinite(input.total) || (input.total ?? 0) <= 0) {
      return 'El valor total de la venta debe ser mayor que cero';
    }
    if (input.amount > (input.total ?? 0)) {
      return 'El valor recibido no puede superar el total de la venta';
    }
  }

  return null;
}
