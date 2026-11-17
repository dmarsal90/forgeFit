export type HeroModel = 'male' | 'female' | undefined;

/** Estado destino de cada capa de la ilustración: sin elegir se ven los dos; al elegir uno, ese se enfatiza y el otro se desvanece. */
export function heroTargets(model: HeroModel) {
  if (model === 'male') return { both: 0, male: 1, woman: 0, womanScale: 1, womanShift: 0 };
  if (model === 'female') return { both: 0, male: 0, woman: 1, womanScale: 1.2, womanShift: -0.32 }; // sube y se centra
  return { both: 1, male: 0, woman: 0, womanScale: 1, womanShift: 0 };
}
