import type { Plan, PlanSession } from './plan';
import { diffSessions } from './sessionOps';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Resumen legible de lo que cambia entre dos versiones del plan (comparar y confirmar restauraciones). */
export function diffPlans(before: Plan, after: Plan): string[] {
  const lines: string[] = [];
  const left = [...before.sessions];
  const right: PlanSession[] = [];
  // 1) Mismo nombre: la sesión es la misma aunque haya cambiado de día (movida o intercambiada).
  for (const a of after.sessions) {
    const i = left.findIndex((b) => b.name === a.name);
    if (i === -1) { right.push(a); continue; }
    const b = left.splice(i, 1)[0];
    if (b.day !== a.day) lines.push(`${a.name}: ${DAYS[b.day]} → ${DAYS[a.day]}`);
    for (const l of diffSessions(b, a)) lines.push(`${a.name}: ${l}`);
  }
  // 2) Mismo día con otro nombre: es la misma sesión renombrada o rehecha.
  for (const a of [...right]) {
    const i = left.findIndex((b) => b.day === a.day);
    if (i === -1) continue;
    right.splice(right.indexOf(a), 1);
    for (const l of diffSessions(left.splice(i, 1)[0], a)) lines.push(`${DAYS[a.day]} (${a.name}): ${l}`);
  }
  for (const b of left) lines.push(`Sesión quitada: ${b.name} (${DAYS[b.day]})`);
  for (const a of right) lines.push(`Sesión añadida: ${a.name} (${DAYS[a.day]})`);
  if (before.mode !== after.mode) lines.push(`Origen del plan: ${before.mode} → ${after.mode}`);
  return lines;
}
