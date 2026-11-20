import type { Req } from '../data/exercises';

export const isBar = (id: string) => id.startsWith('barbell_');
export const isPlates = (id: string) => id.startsWith('plates_');

// Pesos habituales cuando la persona no ha indicado el de su barra. El resto de barras (EZ, hexagonal, corta, de seguridad…) varían
// de un fabricante a otro: no se supone ninguno y hay que indicarlo en su ficha.
export const TYPICAL_BAR_KG: Record<string, number> = { barbell_olympic_20: 20, barbell_olympic_15: 15, barbell_powerlifting: 20 };

export const equipmentIds = (r: Req): string[] => (typeof r === 'string' ? [r] : 'all' in r ? r.all.flatMap(equipmentIds) : r.any.flatMap(equipmentIds));

export type OwnedItem = { id: string; stepKg: number | null; barKg: number | null };

/**
 * Cómo se carga un ejercicio con el equipo que la persona tiene (y puede usar en él):
 * - discos: se cargan por pares, así que el escalón es el doble del disco más pequeño (`stepKg` de la ficha de discos = disco más pequeño);
 * - barra: su peso (el de la ficha o el habitual de la olímpica de 20 kg, la femenina de 15 kg y la de powerlifting); si hay varias
 *   barras posibles con pesos distintos o alguna sin peso conocido, no se supone ninguna;
 * - mancuernas, máquinas, poleas…: el menor `stepKg` de las fichas.
 */
export function loadModel(items: readonly OwnedItem[]): { stepKg?: number; barKg?: number } {
  const plates = items.filter((i) => isPlates(i.id) && i.stepKg !== null).map((i) => i.stepKg as number);
  const others = items.filter((i) => !isPlates(i.id) && !isBar(i.id) && i.stepKg !== null).map((i) => i.stepKg as number);
  const stepKg = plates.length ? 2 * Math.min(...plates) : others.length ? Math.min(...others) : undefined;

  const bars = items.filter((i) => isBar(i.id)).map((i) => i.barKg ?? TYPICAL_BAR_KG[i.id]);
  const known = new Set(bars.filter((w): w is number => w !== undefined));
  const barKg = bars.length && bars.every((w) => w !== undefined) && known.size === 1 ? [...known][0] : undefined;
  return { stepKg, barKg };
}
