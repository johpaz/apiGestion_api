/**
 * A2UI v0.8 — el agente NO escribe JSON de protocolo (los LLM se equivocan en él): llama a `ui_mostrar`
 * con una descripción sencilla y el servidor construye una superficie válida y acotada.
 *
 * Catálogo: componentes estándar (Column, Row, Card, Text, Divider) + dos propios,
 * `Table` y `Chart`, anunciados con `catalogId` en beginRendering.
 */

export const A2UI_CATALOG_ID = 'https://apigestion.app/a2ui/catalog/v1';

export type A2uiMessage = Record<string, unknown>;

export const LIMITS = { blocks: 8, rows: 50, columns: 12, points: 60, series: 4, metrics: 6, text: 200, markdown: 2000 } as const;

const str = (v: unknown, max: number = LIMITS.text) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const lit = (s: string) => ({ literalString: s });

/** JSON → `valueMap` del data model de A2UI (los arreglos usan claves "0", "1", …). */
export function toValueMap(value: unknown): Array<Record<string, unknown>> {
  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
  return entries.map(([key, v]) =>
    typeof v === 'number' ? { key, valueNumber: v }
    : typeof v === 'boolean' ? { key, valueBoolean: v }
    : v !== null && typeof v === 'object' ? { key, valueMap: toValueMap(v) }
    : { key, valueString: v == null ? '' : String(v) });
}

type Component = { id: string; weight?: number; component: Record<string, unknown> };

let counter = 0;

export function buildSurface(spec: unknown): A2uiMessage[] {
  const input = (spec && typeof spec === 'object' ? spec : {}) as Record<string, any>;
  const blocks: any[] = Array.isArray(input.bloques) ? input.bloques.slice(0, LIMITS.blocks) : [];
  if (!blocks.length) throw new Error('ui_mostrar necesita al menos un bloque en "bloques"');

  const surfaceId = `s${Date.now().toString(36)}${(counter++).toString(36)}`;
  const components: Component[] = [];
  const data: Record<string, unknown> = {};
  const rootChildren: string[] = [];
  const add = (c: Component) => components.push(c);
  const text = (id: string, value: string, usageHint = 'body') => add({ id, component: { Text: { text: lit(value), usageHint } } });

  if (input.titulo) { text('title', str(input.titulo), 'h3'); rootChildren.push('title'); }
  if (input.resumen) { text('summary', str(input.resumen, 400), 'caption'); rootChildren.push('summary'); }

  blocks.forEach((b, i) => {
    const id = `b${i}`;
    const tipo = b?.tipo;
    if (tipo === 'metricas' && Array.isArray(b.items)) {
      const items = b.items.slice(0, LIMITS.metrics);
      const ids = items.map((m: any, k: number) => {
        text(`${id}_${k}_l`, str(m.etiqueta, 60), 'caption');
        text(`${id}_${k}_v`, str(m.valor, 40), 'h3');
        const kids = [`${id}_${k}_l`, `${id}_${k}_v`];
        if (m.nota) { text(`${id}_${k}_n`, str(m.nota, 80), 'caption'); kids.push(`${id}_${k}_n`); }
        add({ id: `${id}_${k}_c`, component: { Column: { children: { explicitList: kids } } } });
        add({ id: `${id}_${k}`, weight: 1, component: { Card: { child: `${id}_${k}_c` } } });
        return `${id}_${k}`;
      });
      add({ id, component: { Row: { children: { explicitList: ids }, distribution: 'spaceBetween' } } });
    } else if (tipo === 'tabla' && Array.isArray(b.columnas) && Array.isArray(b.filas)) {
      data[id] = {
        columns: b.columnas.slice(0, LIMITS.columns).map((c: unknown) => str(c, 60)),
        rows: b.filas.slice(0, LIMITS.rows).map((r: unknown) => (Array.isArray(r) ? r : []).slice(0, LIMITS.columns).map((c) => (typeof c === 'number' ? c : str(c, 120)))),
      };
      add({ id, component: { Table: { columns: { path: `/${id}/columns` }, rows: { path: `/${id}/rows` }, caption: b.titulo ? lit(str(b.titulo)) : undefined } } });
    } else if (tipo === 'grafica' && Array.isArray(b.etiquetas) && Array.isArray(b.series)) {
      const labels = b.etiquetas.slice(0, LIMITS.points).map((l: unknown) => str(l, 40));
      data[id] = {
        labels,
        series: b.series.slice(0, LIMITS.series).map((s: any) => ({ name: str(s?.nombre, 60), values: labels.map((_: string, k: number) => num(s?.valores?.[k])) })),
      };
      const variant = ['barras', 'lineas', 'torta'].includes(b.variante) ? b.variante : 'barras';
      add({ id, component: { Chart: { variant: lit(variant), labels: { path: `/${id}/labels` }, series: { path: `/${id}/series` }, caption: b.titulo ? lit(str(b.titulo)) : undefined, unit: b.unidad ? lit(str(b.unidad, 20)) : undefined } } });
    } else if (tipo === 'texto' && b.markdown) {
      add({ id, component: { Text: { text: lit(str(b.markdown, LIMITS.markdown)), usageHint: 'body' } } });
    } else {
      throw new Error(`Bloque ${i} inválido: usa tipo "metricas", "tabla", "grafica" o "texto" con sus campos`);
    }
    rootChildren.push(id);
  });

  add({ id: 'root_col', component: { Column: { children: { explicitList: rootChildren } } } });
  add({ id: 'root', component: { Card: { child: 'root_col' } } });

  const messages: A2uiMessage[] = [{ surfaceUpdate: { surfaceId, components: JSON.parse(JSON.stringify(components)) } }];
  if (Object.keys(data).length) messages.push({ dataModelUpdate: { surfaceId, contents: toValueMap(data) } });
  messages.push({ beginRendering: { surfaceId, root: 'root', catalogId: A2UI_CATALOG_ID, styles: { primaryColor: '#163f32' } } });
  return messages;
}

export const UI_TOOL = {
  name: 'ui_mostrar',
  description:
    'Muestra al usuario una tarjeta visual (A2UI) con métricas, tablas y gráficas bien formateadas. Úsala cuando la respuesta tenga ' +
    'cifras, listas de registros o comparaciones; después resume en una frase. Usa cifras ya formateadas en texto (ej. "$1.250.000", "12,5 kg").',
  parameters: {
    type: 'object' as const,
    properties: {
      titulo: { type: 'string', description: 'Título de la tarjeta' },
      resumen: { type: 'string', description: 'Subtítulo corto (opcional)' },
      bloques: {
        type: 'array',
        description: `Hasta ${LIMITS.blocks} bloques, en orden`,
        items: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: ['metricas', 'tabla', 'grafica', 'texto'] },
            titulo: { type: 'string', description: 'Título del bloque (tabla/gráfica)' },
            items: { type: 'array', description: 'metricas: [{etiqueta, valor, nota?}]', items: { type: 'object', properties: { etiqueta: { type: 'string' }, valor: { type: 'string' }, nota: { type: 'string' } } } },
            columnas: { type: 'array', description: 'tabla: nombres de columnas', items: { type: 'string' } },
            filas: { type: 'array', description: 'tabla: filas; cada fila es un arreglo de celdas', items: { type: 'array', items: { type: 'string' } } },
            variante: { type: 'string', enum: ['barras', 'lineas', 'torta'], description: 'grafica' },
            etiquetas: { type: 'array', description: 'grafica: etiquetas del eje X (o porciones)', items: { type: 'string' } },
            series: { type: 'array', description: 'grafica: [{nombre, valores:number[]}] alineados con etiquetas', items: { type: 'object', properties: { nombre: { type: 'string' }, valores: { type: 'array', items: { type: 'number' } } } } },
            unidad: { type: 'string', description: 'grafica: unidad (kg, $, …)' },
            markdown: { type: 'string', description: 'texto: Markdown breve' },
          },
          required: ['tipo'],
        },
      },
    },
    required: ['bloques'],
  },
};
