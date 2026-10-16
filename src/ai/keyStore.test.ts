import { describe, expect, test } from 'bun:test';

process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test';
process.env.AI_KEY_SECRET = 'secreto-de-prueba-con-mas-de-32-caracteres';
const { decryptKey, encryptKey } = await import('./keyStore');

describe('cifrado de API keys', () => {
  test('ida y vuelta, con IV distinto en cada cifrado y sin texto plano', () => {
    const a = encryptKey('gemini', 'AIzaSyEJEMPLO-1234');
    const b = encryptKey('gemini', 'AIzaSyEJEMPLO-1234');
    expect(decryptKey('gemini', a)).toBe('AIzaSyEJEMPLO-1234');
    expect(a.iv).not.toBe(b.iv);
    expect(JSON.stringify(a)).not.toContain('EJEMPLO');
  });

  test('un dato alterado o cifrado con otra clave se reporta como ilegible', () => {
    const a = encryptKey('gemini', 'AIzaSyEJEMPLO-1234');
    expect(decryptKey('gemini', { ...a, ciphertext: Buffer.from('x').toString('base64') })).toBeNull();
    expect(decryptKey('otro-proveedor', a)).toBeNull();
    process.env.AI_KEY_SECRET = 'otro-secreto-distinto-de-32-caracteres-o-mas';
    expect(decryptKey('gemini', a)).toBeNull();
    process.env.AI_KEY_SECRET = 'secreto-de-prueba-con-mas-de-32-caracteres';
  });
});
