import type { Db } from './index';

// Módulos de interfaz activables (V9-G). Ocultar uno no borra datos; sin fila = activado.
export const FEATURES = [
  { key: 'progression', label: 'Progresión de carga', hint: 'Sugerencia de peso y repeticiones en la sesión, con su explicación.' },
  { key: 'plates', label: 'Calculadora de discos', hint: 'Qué discos poner por lado para el peso escrito.' },
] as const;
export type Feature = (typeof FEATURES)[number]['key'];
export type Features = Record<Feature, boolean>;

export async function getFeatures(db: Db, profileId: string): Promise<Features> {
  const rows = await db.getAllAsync<{ feature: Feature; enabled: number }>('SELECT feature, enabled FROM feature_preferences WHERE profile_id = ?', [profileId]);
  const off = new Set(rows.filter((r) => r.enabled === 0).map((r) => r.feature));
  return Object.fromEntries(FEATURES.map((f) => [f.key, !off.has(f.key)])) as Features;
}

export async function setFeature(db: Db, profileId: string, feature: Feature, enabled: boolean) {
  if (!FEATURES.some((f) => f.key === feature)) throw new Error('Módulo desconocido');
  await db.runAsync('INSERT OR REPLACE INTO feature_preferences (profile_id, feature, enabled) VALUES (?,?,?)', [profileId, feature, enabled ? 1 : 0]);
}
