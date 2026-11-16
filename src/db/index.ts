import * as SQLite from 'expo-sqlite';
import { migrations } from './migrations';

export type Db = SQLite.SQLiteDatabase;

export async function migrate(db: Db, list: string[] = migrations) {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let v = row?.user_version ?? 0; v < list.length; v++) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(list[v]);
      await tx.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export async function openDb(): Promise<Db> {
  const db = await SQLite.openDatabaseAsync('forgefit.db');
  await migrate(db);
  return db;
}
