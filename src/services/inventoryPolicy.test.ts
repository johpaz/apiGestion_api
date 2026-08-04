import { describe, expect, test } from 'bun:test';
import { validateInventorySource } from './inventoryPolicy';

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
