import type { Req, Variant } from '../data/exercises';

export type Modality = 'free' | 'machines' | 'calisthenics';

const ids = (r: Req): string[] => (typeof r === 'string' ? [r] : 'all' in r ? r.all.flatMap(ids) : r.any.flatMap(ids));
const MACHINE_SUFFIX = new Set(['machine', 'cable', 'two_cables', 'station', 'smith', 'press', 'assisted', 'ghd', 'supported', 'captain']);
const LOADED = /^(barbell|dumbbells|kettlebell|plates|farmer|sled|landmine|preacher_bench)/;

// shortcut: modalidad deducida del sufijo de la variante y del equipo que exige, no etiquetada una a una;
// revisar si una preferencia de modalidad produce planes que no la reflejan.
export function variantModality(v: Variant): Modality {
  const need = ids(v.requires);
  if (MACHINE_SUFFIX.has(v.id.split('.')[1]) || need.some((i) => i.startsWith('cable_') || i.startsWith('smith_'))) return 'machines';
  return need.some((i) => LOADED.test(i)) ? 'free' : 'calisthenics';
}
