import { describe, expect, test } from 'bun:test';
import { inventoryPurchaseTotal, validateInventorySource } from './inventoryPolicy';

describe('inventory source policy', () => {
  test('accepts a standardized catalog item', () => {
    expect(validateInventorySource({ catalogoItemId: 'catalog-item', nombre: 'Alimentador', unidad: 'unidades' })).toBeNull();
  });

  test('accepts a beekeeper custom preparation without adding it to the master catalog', () => {
    expect(validateInventorySource({ esPersonalizado: true, nombre: 'Alimento proteico receta propia', unidad: 'kg' })).toBeNull();
  });

  test('requires choosing one source and complete custom identification', () => {
    expect(validateInventorySource({ nombre: 'Sin origen', unidad: 'kg' })).toContain('catálogo');
    expect(validateInventorySource({ esPersonalizado: true, nombre: '', unidad: 'kg' })).toContain('nombre');
    expect(validateInventorySource({ esPersonalizado: true, nombre: 'Receta', unidad: '' })).toContain('unidad');
  });
});

describe('purchases and inventory valuation', () => {
  test('records the actual quantity times the paid unit price', () => {
    expect(inventoryPurchaseTotal({isPurchase:true,type:'entrada',quantity:3.5,unitCost:12.34})).toBe(43.19);
  });
  test('does not turn initial stock or a valuation into an expense', () => {
    expect(inventoryPurchaseTotal({isPurchase:false,type:'entrada',quantity:100,unitCost:500})).toBe(0);
    expect(() => inventoryPurchaseTotal({isPurchase:true,type:'entrada',quantity:10})).toThrow();
  });
  test('rejects expenses for withdrawals, adjustments or invalid amounts', () => {
    for(const type of ['salida','ajuste'] as const) expect(()=>inventoryPurchaseTotal({isPurchase:true,type,quantity:2,unitCost:5})).toThrow();
    for(const unitCost of [0,-1,NaN,Infinity]) expect(()=>inventoryPurchaseTotal({isPurchase:true,type:'entrada',quantity:2,unitCost})).toThrow();
  });
});
