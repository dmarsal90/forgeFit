export type HeroModel = 'male' | 'female' | undefined;

/** Opacidad destino de cada capa. Sin elegir se ven los dos; al elegir uno, ese se enfatiza y el otro queda como un fantasma tenue (boceto aprobado). */
export const GHOST = 0.22;
export function heroTargets(model: HeroModel) {
  if (model === 'male') return { both: 0, male: 1, ghostWoman: GHOST, female: 0 }; // la mujer queda difuminada detrás
  if (model === 'female') return { both: 0, male: 0, ghostWoman: 0, female: 1 }; // esta capa ya trae al hombre difuminado
  return { both: 1, male: 0, ghostWoman: 0, female: 0 };
}
