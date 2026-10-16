import { SQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Migrador SQL nativo de Bun. Es compatible con la tabla _prisma_migrations,
// por lo que las bases ya migradas con Prisma no re-ejecutan nada.

const MIGRATIONS_DIR = join(__dirname, '../../db/migrations');
const LOCK_ID = 727274; // advisory lock para evitar migraciones concurrentes

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('❌ DATABASE_URL no está definida');
  process.exit(1);
}

// Prisma admite parámetros propios (?schema=...) que Postgres no entiende.
const cleanUrl = (() => {
  const u = new URL(url);
  u.searchParams.delete('schema');
  return u.toString();
})();

const sql = new SQL(cleanUrl, { max: 1 });

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

// Postgres puede reiniciarse al terminar su inicialización: reintenta antes de rendirse
async function waitForDatabase(attempts = 30) {
  for (let i = 1; ; i++) {
    try {
      await sql.unsafe('SELECT 1');
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      console.log(`⏳ Esperando la base de datos (${i}/${attempts})...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function main() {
  await waitForDatabase();
  await sql.unsafe(`SELECT pg_advisory_lock(${LOCK_ID})`);
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )`;

    const rows: { migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }[] =
      await sql`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    const applied = new Map(rows.filter(r => r.finished_at && !r.rolled_back_at).map(r => [r.migration_name, r]));
    const failed = rows.filter(r => !r.finished_at && !r.rolled_back_at);
    if (failed.length) {
      throw new Error(`Migración(es) fallida(s) sin resolver: ${failed.map(r => r.migration_name).join(', ')}`);
    }

    const names = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && existsSync(join(MIGRATIONS_DIR, d.name, 'migration.sql')))
      .map(d => d.name)
      .sort();

    let count = 0;
    for (const name of names) {
      const content = readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
      const checksum = sha256(content);
      const prev = applied.get(name);
      if (prev) {
        if (prev.checksum !== checksum) console.warn(`⚠️  ${name}: el archivo cambió después de aplicarse`);
        continue;
      }

      console.log(`➡️  Aplicando ${name}`);
      // Cada migración va en su propia transacción: ALTER TYPE ... ADD VALUE
      // exige commit antes de usar el valor nuevo en la migración siguiente.
      await sql.begin(async tx => {
        await tx.unsafe(content);
        await tx`
          INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
          VALUES (${randomUUID()}, ${checksum}, ${name}, now(), 1)`;
      });
      count++;
    }

    const orphans = [...applied.keys()].filter(n => !names.includes(n));
    if (orphans.length) console.warn(`⚠️  Aplicadas en la BD pero sin carpeta local: ${orphans.join(', ')}`);

    console.log(count ? `✅ ${count} migración(es) aplicada(s)` : '✅ Base de datos al día');
  } finally {
    await sql.unsafe(`SELECT pg_advisory_unlock(${LOCK_ID})`);
    await sql.close();
  }
}

main().catch(err => {
  console.error('❌ Error en migraciones:', err.message ?? err);
  process.exit(1);
});
