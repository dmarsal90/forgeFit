import type { Db } from './index';

/** Id aleatorio de 128 bits generado por SQLite (Hermes no expone globalThis.crypto). */
export async function newId(db: Pick<Db, 'getFirstAsync'>): Promise<string> {
  const r = await db.getFirstAsync<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
  if (!r) throw new Error('No se pudo generar el id');
  return r.id;
}
