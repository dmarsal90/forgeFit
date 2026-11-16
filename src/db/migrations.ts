// Cada migración corre en una transacción; el índice + 1 es el valor de PRAGMA user_version.
export const migrations: string[] = [
  `CREATE TABLE profiles (
     id TEXT PRIMARY KEY NOT NULL,
     alias TEXT NOT NULL,
     anatomical_model TEXT CHECK (anatomical_model IN ('male','female')),
     birth_year INTEGER,
     height_cm REAL,
     archived_at TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE app_state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
];
