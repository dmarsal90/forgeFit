import { inputFromDrafts } from '../lib/planEngine';
import type { PlanContext } from '../lib/planValidator';
import type { Db } from './index';
import { getInventory } from './inventory';
import { getDrafts } from './onboarding';

/** Contexto de validación del perfil (equipo del entorno del plan, limitaciones, días…); null si el onboarding está incompleto. */
export async function loadContext(db: Db, profileId: string, environmentId: string | null): Promise<PlanContext | null> {
  const drafts = await getDrafts(db, profileId);
  const inv = environmentId ? await getInventory(db, environmentId) : {};
  const have = new Set(Object.entries(inv).filter(([, s]) => s === 'available').map(([id]) => id));
  const r = inputFromDrafts(drafts, have);
  if (!('input' in r)) return null;
  const { limitations, days, minutesPerSession, level } = r.input;
  return { have, limitations, days, minutesPerSession, level };
}
