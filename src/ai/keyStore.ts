import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { sql } from '../db';

/**
 * Almacén de API keys de IA por usuario, en Postgres (tabla `ai_api_keys`), cifradas con AES-256-GCM.
 *
 * Por qué no en HiveDB: allí dependen de un volumen y de la clave maestra del SDK; si se pierde cualquiera de los
 * dos, todos los usuarios tendrían que volver a pegar su clave. Postgres ya es lo que se respalda y persiste.
 *
 * La clave de cifrado se deriva (HKDF) de AI_KEY_SECRET, o si no existe de HIVE_MASTER_KEY, o de JWT_SECRET.
 * Lo mejor es definir AI_KEY_SECRET y no cambiarlo nunca: cambiarlo vuelve ilegibles las claves guardadas.
 */

export type StoredKey = { apiKey: string } | { unreadable: true } | null;

function secret(): string {
  const value = process.env.AI_KEY_SECRET || process.env.HIVE_MASTER_KEY || process.env.JWT_SECRET;
  if (!value || value === 'fallback-secret') throw new Error('Falta AI_KEY_SECRET (o JWT_SECRET) para cifrar las API keys');
  return value;
}

const keyFor = (provider: string) =>
  Buffer.from(hkdfSync('sha256', secret(), 'apigestion-ai-keys', `provider:${provider}`, 32));

export function encryptKey(provider: string, plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(provider), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

export function decryptKey(provider: string, row: { ciphertext: string; iv: string; tag: string }): string | null {
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFor(provider), Buffer.from(row.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null; // etiqueta inválida: otra clave de cifrado o dato alterado
  }
}

export async function saveStoredKey(userId: string, provider: string, apiKey: string): Promise<void> {
  const { ciphertext, iv, tag } = encryptKey(provider, apiKey);
  await sql`
    INSERT INTO ai_api_keys ("usuarioId", proveedor, ciphertext, iv, tag, ultimos4)
    VALUES (${userId}, ${provider}, ${ciphertext}, ${iv}, ${tag}, ${apiKey.slice(-4)})
    ON CONFLICT ("usuarioId", proveedor) DO UPDATE
      SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, tag = EXCLUDED.tag,
          ultimos4 = EXCLUDED.ultimos4, "fechaActualizacion" = now()`;
}

export async function loadStoredKey(userId: string, provider: string): Promise<StoredKey> {
  const [row] = await sql`SELECT ciphertext, iv, tag FROM ai_api_keys WHERE "usuarioId" = ${userId} AND proveedor = ${provider}`;
  if (!row) return null;
  const apiKey = decryptKey(provider, row as { ciphertext: string; iv: string; tag: string });
  return apiKey ? { apiKey } : { unreadable: true };
}

export async function deleteStoredKey(userId: string, provider: string): Promise<void> {
  await sql`DELETE FROM ai_api_keys WHERE "usuarioId" = ${userId} AND proveedor = ${provider}`;
}
