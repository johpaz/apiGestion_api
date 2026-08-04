import { describe, expect, test } from 'bun:test';
import { getPaymentStatus, validateFinancialAmounts } from './financialPolicy';

describe('política de ventas simples', () => {
  test('calcula el estado sin pedirlo al usuario', () => {
    expect(getPaymentStatus(100_000, 0)).toBe('pendiente');
    expect(getPaymentStatus(100_000, 40_000)).toBe('parcial');
    expect(getPaymentStatus(100_000, 100_000)).toBe('pagado');
  });

  test('permite una venta pendiente, pero no un ingreso de valor cero', () => {
    expect(validateFinancialAmounts({ isSale: true, amount: 0, total: 80_000 })).toBeNull();
    expect(validateFinancialAmounts({ isSale: false, amount: 0 })).toBe('El monto debe ser mayor que cero');
  });

  test('impide recibir más de lo vendido', () => {
    expect(validateFinancialAmounts({ isSale: true, amount: 90_000, total: 80_000 }))
      .toBe('El valor recibido no puede superar el total de la venta');
  });
});
