export type WeightUnit = 'kg' | 'lb';

const LB_PER_KG = 2.2046226218;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Los pesos se guardan siempre en kg; esto solo convierte lo que se muestra y lo que se escribe. */
export const kgToUnit = (kg: number, u: WeightUnit) => round1(u === 'lb' ? kg * LB_PER_KG : kg);
export const unitToKg = (v: number, u: WeightUnit) => (u === 'lb' ? v / LB_PER_KG : v);
export const fmtWeight = (kg: number, u: WeightUnit) => `${kgToUnit(kg, u)} ${u}`;
