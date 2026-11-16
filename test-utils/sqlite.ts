// Adaptador mínimo de node:sqlite a la parte de la API de expo-sqlite que usa la app (solo tests).
import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../src/db';

export function memoryDb(): Db {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  const run = (sql: string, p: unknown[] = []) => raw.prepare(sql).run(...(p as never[]));
  const api = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    runAsync: async (sql: string, p?: unknown[]) => { run(sql, p); },
    getFirstAsync: async (sql: string, p: unknown[] = []) => raw.prepare(sql).get(...(p as never[])) ?? null,
    getAllAsync: async (sql: string, p: unknown[] = []) => raw.prepare(sql).all(...(p as never[])),
    withExclusiveTransactionAsync: async (fn: (tx: unknown) => Promise<void>) => {
      raw.exec('BEGIN');
      try { await fn(api); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
  return api as unknown as Db;
}
