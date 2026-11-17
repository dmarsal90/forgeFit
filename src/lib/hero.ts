export type HeroModel = 'male' | 'female' | undefined;

/** Opacidad destino de cada capa: sin elegir se ven los dos; al elegir uno, su ilustración (con el otro difuminado de fondo) reemplaza a la doble. */
export function heroTargets(model: HeroModel) {
  if (model === 'male') return { both: 0, male: 1, female: 0 };
  if (model === 'female') return { both: 0, male: 0, female: 1 };
  return { both: 1, male: 0, female: 0 };
}
