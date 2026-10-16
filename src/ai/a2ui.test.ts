import { describe, expect, test } from 'bun:test';
import { A2UI_CATALOG_ID, LIMITS, buildSurface, toValueMap } from './a2ui';

const spec = {
  titulo: 'Producción',
  bloques: [
    { tipo: 'metricas', items: [{ etiqueta: 'Miel', valor: '120 kg' }, { etiqueta: 'Cera', valor: '8 kg', nota: '+2' }] },
    { tipo: 'tabla', columnas: ['Mes', 'kg'], filas: [['Ene', 10], ['Feb', '12']] },
    { tipo: 'grafica', variante: 'barras', etiquetas: ['Ene', 'Feb'], series: [{ nombre: 'Miel', valores: [10, 12] }] },
    { tipo: 'texto', markdown: '**ok**' },
  ],
};

describe('buildSurface', () => {
  const [update, model, begin] = buildSurface(spec) as any[];

  test('emite surfaceUpdate, dataModelUpdate y beginRendering sobre la misma superficie', () => {
    const id = update.surfaceUpdate.surfaceId;
    expect(model.dataModelUpdate.surfaceId).toBe(id);
    expect(begin.beginRendering).toMatchObject({ surfaceId: id, root: 'root', catalogId: A2UI_CATALOG_ID });
  });

  test('todos los ids referenciados existen y son únicos', () => {
    const comps: any[] = update.surfaceUpdate.components;
    const ids = comps.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of comps) {
      const body = Object.values(c.component)[0] as any;
      for (const ref of [...(body.children?.explicitList ?? []), ...(body.child ? [body.child] : [])]) expect(ids).toContain(ref);
    }
  });

  test('el data model codifica arreglos con claves numéricas', () => {
    expect(toValueMap(['a', 2])).toEqual([{ key: '0', valueString: 'a' }, { key: '1', valueNumber: 2 }]);
  });

  test('acota filas y rechaza bloques inválidos', () => {
    const big = buildSurface({ bloques: [{ tipo: 'tabla', columnas: ['a'], filas: Array.from({ length: 500 }, () => ['x']) }] }) as any[];
    const rows = big[1].dataModelUpdate.contents[0].valueMap.find((e: any) => e.key === 'rows').valueMap;
    expect(rows.length).toBe(LIMITS.rows);
    expect(() => buildSurface({ bloques: [{ tipo: 'script' }] })).toThrow();
    expect(() => buildSurface({})).toThrow();
  });
});
