import { sql } from '../src/db';

// Public projection of the seeded fictional account only. Never export user records.
const userId = 'demo-visual-apicolmena-v1';
try {
  const [account] = await sql`SELECT id FROM usuarios WHERE id = ${userId}`;
  if (!account) throw new Error('Primero crea la cuenta con db:seed:demo.');
  const apiarios = await sql`SELECT a.nombre, a.ciudad, count(c.id)::int AS colmenas FROM apiarios a LEFT JOIN colmenas c ON c."apiarioId" = a.id AND c."usuarioId" = ${userId} WHERE a."usuarioId" = ${userId} GROUP BY a.id ORDER BY a.nombre`;
  const colmenas = await sql`SELECT c.nombre, c.estado, c.cuadros, c.reyna, a.nombre AS apiario FROM colmenas c JOIN apiarios a ON a.id = c."apiarioId" WHERE c."usuarioId" = ${userId} ORDER BY c.nombre`;
  const inventario = await sql`SELECT nombre, "cantidadActual" AS stock, "cantidadMinima" AS minimo, unidad FROM insumos_apicola WHERE "usuarioId" = ${userId} ORDER BY nombre`;
  const sanidad = await sql`SELECT codigo, titulo, estado, gravedad FROM casos_sanitarios WHERE "usuarioId" = ${userId} AND "anuladoAt" IS NULL ORDER BY codigo`;
  const finanzas = await sql`SELECT to_char(fecha, 'YYYY-MM') AS mes, sum(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END)::float AS ingresos, sum(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END)::float AS egresos FROM transacciones WHERE "usuarioId" = ${userId} AND "anuladoAt" IS NULL GROUP BY 1 ORDER BY 1`;
  const produccion = await sql`SELECT "tipoProducto" AS producto, unidad, sum(cantidad)::float AS cantidad FROM producciones WHERE "usuarioId" = ${userId} GROUP BY 1,2 ORDER BY 1`;
  const [inspecciones] = await sql`SELECT count(*)::int AS total FROM inspecciones WHERE "usuarioId" = ${userId}`;
  const snapshot = { fechaCorte: new Date().toISOString(), apiarios, colmenas, inventario, sanidad, finanzas, produccion, inspecciones: inspecciones.total };
  await Bun.write(new URL('../../front/src/data/demo-snapshot.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
  console.log('Snapshot demo exportado: solo datos operativos de la cuenta ficticia.');
} finally {
  await sql.close();
}
