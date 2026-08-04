import { describe, expect, test } from 'bun:test';
import { validateHealthAction, validateNucleusFinalization } from './traceabilityPolicy';

describe('sanitary traceability policy', () => {
  test('requires evidence and disposition for destruction', () => {
    expect(validateHealthAction({ tipo: 'sacrificio_destruccion', objetivoIds: ['target-1'], evidencias: [] }, ['target-1']))
      .toContain('al menos una foto');
  });

  test('accepts a complete destruction record for every case target', () => {
    expect(validateHealthAction({
      tipo: 'sacrificio_destruccion', objetivoIds: ['target-1'], evidencias: ['https://storage.example/evidence.jpg'],
      responsable: 'Responsable de campo', metodo: 'Protocolo documentado', disposicionFinal: 'Disposición conforme al protocolo',
    }, ['target-1'])).toBeNull();
  });

  test('never accepts an authorized control without its ICA registration', () => {
    expect(validateHealthAction({ tipo: 'control_autorizado_ica', productoNombre: 'Producto', objetivoIds: [], evidencias: [] }, []))
      .toContain('registro ICA');
  });

  test('blocks selling or converting a nucleus with an open case', () => {
    expect(validateNucleusFinalization('listo', true)).toContain('caso sanitario abierto');
    expect(validateNucleusFinalization('listo', false)).toBeNull();
  });
});
