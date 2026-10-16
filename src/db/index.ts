import { SQL } from 'bun';
import { randomUUID } from 'node:crypto';

export const sql = new SQL(process.env.DATABASE_URL!.replace(/([?&])schema=[^&]*&?/, '$1').replace(/[?&]$/, ''), {
  max: Number(process.env.DB_POOL_MAX || 10),
});

export type Row = Record<string, any>;
export type Executor = typeof sql;

/** Identificador único (reemplaza @default(cuid()) de Prisma). */
export const newId = () => randomUUID().replace(/-/g, '');

/**
 * Columnas que antes llenaba Prisma desde la app:
 *  - now: @default(now())  - updated: @updatedAt
 */
const TABLES: Record<string, { now?: string[]; updated?: string[] }> = {
  usuarios: { now: ['fechaRegistro'] },
  configuracion_sistema: { updated: ['updatedAt'] },
  apiarios: { now: ['fechaCreacion'], updated: ['fechaActualizacion'] },
  colmenas: { now: ['fechaInstalacion', 'fechaCreacion'], updated: ['fechaActualizacion'] },
  nucleos: { now: ['fechaInstalacion', 'fechaFormacion', 'fechaCreacion'], updated: ['fechaActualizacion'] },
  nucleos_donantes: { now: ['fecha'] },
  eventos_nucleo: { now: ['fecha'] },
  ventas_nucleo: { now: ['fechaCreacion'] },
  conversiones_nucleo: { now: ['fechaCreacion'] },
  enjambres: { now: ['fechaCreacion'], updated: ['fechaActualizacion'] },
  inspecciones: { now: ['fecha', 'fechaCreacion'], updated: ['fechaActualizacion'] },
  productos: { now: ['fechaCreacion'], updated: ['fechaActualizacion'] },
  transacciones: { now: ['fecha', 'fechaCreacion'], updated: ['fechaActualizacion'] },
  casos_sanitarios: { now: ['fechaApertura', 'fechaCreacion'], updated: ['fechaActualizacion'] },
  acciones_sanitarias: { now: ['fecha', 'fechaCreacion'] },
  alertas: { now: ['fechaCreacion'], updated: ['fechaActualizacion'] },
  exchange_rates: { now: ['lastUpdated', 'createdAt'], updated: ['updatedAt'] },
  insumos_apicola: { now: ['fechaCreacion'], updated: ['fechaActualizacion'] },
  movimientos_inventario: { now: ['fecha'] },
  producciones: { now: ['fechaCreacion'], updated: ['fechaActualizacion'] },
  actividades: { now: ['fechaCreacion'] },
};

/** Quita las claves undefined (Prisma las ignoraba) y convierte arrays JS a arrays de Postgres. */
const clean = (data: Row, db: Executor) => {
  const out: Row = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? db.array(v, 'TEXT') : v;
  }
  return out;
};

/** INSERT ... RETURNING *  (rellena id y fechas por defecto como lo hacía Prisma). */
export async function insert(table: string, data: Row, db: Executor = sql): Promise<Row> {
  const meta = TABLES[table] || {};
  const now = new Date();
  const row: Row = { ...data };
  if (row.id === undefined && table !== 'configuracion_sistema') row.id = newId();
  for (const c of meta.now || []) if (row[c] === undefined) row[c] = now;
  for (const c of meta.updated || []) if (row[c] === undefined) row[c] = now;
  const [created] = await db`INSERT INTO ${db(table)} ${db(clean(row, db))} RETURNING *`;
  return created;
}

/** UPDATE ... WHERE id = $id RETURNING * (actualiza @updatedAt automáticamente). */
export async function updateById(table: string, id: string, data: Row, db: Executor = sql): Promise<Row | null> {
  const meta = TABLES[table] || {};
  const row: Row = { ...data };
  for (const c of meta.updated || []) if (row[c] === undefined) row[c] = new Date();
  const values = clean(row, db);
  if (!Object.keys(values).length) {
    const [same] = await db`SELECT * FROM ${db(table)} WHERE id = ${id}`;
    return same ?? null;
  }
  const [updated] = await db`UPDATE ${db(table)} SET ${db(values)} WHERE id = ${id} RETURNING *`;
  return updated ?? null;
}

/** INSERT ... ON CONFLICT (cols) DO UPDATE (equivalente a upsert de Prisma). */
export async function upsert(
  table: string,
  conflict: string[],
  create: Row,
  update: Row,
  db: Executor = sql,
): Promise<Row> {
  const meta = TABLES[table] || {};
  const now = new Date();
  const row: Row = { ...create };
  if (row.id === undefined && table !== 'configuracion_sistema') row.id = newId();
  for (const c of [...(meta.now || []), ...(meta.updated || [])]) if (row[c] === undefined) row[c] = now;
  const upd: Row = { ...update };
  for (const c of meta.updated || []) if (upd[c] === undefined) upd[c] = now;
  const values = clean(upd, db);
  const cols = conflict.map(c => `"${c}"`).join(', ');
  const [res] = await db`
    INSERT INTO ${db(table)} ${db(clean(row, db))}
    ON CONFLICT (${db.unsafe(cols)}) DO UPDATE SET ${db(values)}
    RETURNING *`;
  return res;
}

export const ready = async () => {
  await sql`SELECT 1`;
};

/** UPDATE ... WHERE <cond> RETURNING * (equivalente a updateMany; devuelve las filas afectadas). */
export async function updateWhere(table: string, data: Row, where: any, db: Executor = sql): Promise<Row[]> {
  const meta = TABLES[table] || {};
  const row: Row = { ...data };
  for (const c of meta.updated || []) if (row[c] === undefined) row[c] = new Date();
  const values = clean(row, db);
  return db`UPDATE ${db(table)} SET ${db(values)} WHERE ${where} RETURNING *`;
}

/** Adjunta a cada fila padre sus filas hijas (equivalente a `include` de una relación 1:N). */
export function attachMany<P extends Row>(parents: P[], children: Row[], fk: string, key: string): (P & Row)[] {
  const byParent = new Map<string, Row[]>();
  for (const child of children) {
    const list = byParent.get(child[fk]);
    if (list) list.push(child);
    else byParent.set(child[fk], [child]);
  }
  return parents.map(p => ({ ...p, [key]: byParent.get(p.id) ?? [] }));
}

export const idList = (rows: Row[], key = 'id'): string[] => rows.map(r => r[key]);
