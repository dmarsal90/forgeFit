import { z } from 'zod';

type Option = { value: string | number; label: string };
export type Field = { key: string; label: string; multi?: boolean; optional?: boolean; options: Option[] };
export type StepDef = { title: string; intro: string; fields: Field[]; schema: z.ZodType };

const goals: Option[] = [
  { value: 'strength', label: 'Ganar fuerza' },
  { value: 'muscle', label: 'Ganar músculo' },
  { value: 'endurance', label: 'Resistencia muscular' },
  { value: 'general', label: 'Estar en forma' },
  { value: 'mobility', label: 'Movilidad y salud articular' },
];
const goalIds = goals.map((g) => g.value) as [string, ...string[]];
const week = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const goalsSchema = z
  .object({ primaryGoal: z.enum(goalIds, 'Elige un objetivo principal'), secondaryGoals: z.array(z.enum(goalIds)).max(2, 'Máximo 2').optional() })
  .refine((d) => !d.secondaryGoals?.includes(d.primaryGoal), { path: ['secondaryGoals'], message: 'Ya es tu objetivo principal' });

const experienceSchema = z.object({
  level: z.enum(['beginner', 'intermediate', 'advanced'], 'Elige tu experiencia'),
  technique: z.enum(['low', 'medium', 'high']).optional(),
});

const availabilitySchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1, 'Elige al menos un día').max(7),
  minutes: z.number().int().min(15, 'Mínimo 15 minutos').max(180, 'Máximo 180 minutos'),
});

// Etapas 2–4. Las etapas 1 (perfil) y 5–8 viven fuera de este mapa.
export const STEPS: Record<number, StepDef> = {
  2: {
    title: 'Tus objetivos', intro: 'Elige uno principal. Los secundarios son opcionales.', schema: goalsSchema,
    fields: [
      { key: 'primaryGoal', label: 'Objetivo principal', options: goals },
      { key: 'secondaryGoals', label: 'Objetivos secundarios (hasta 2)', multi: true, optional: true, options: goals },
    ],
  },
  3: {
    title: 'Tu experiencia', intro: 'Sirve para ajustar la progresión. No hace falta ser preciso.', schema: experienceSchema,
    fields: [
      { key: 'level', label: 'Experiencia entrenando con pesas', options: [
        { value: 'beginner', label: 'Principiante' }, { value: 'intermediate', label: 'Intermedio' }, { value: 'advanced', label: 'Avanzado' },
      ] },
      { key: 'technique', label: 'Familiaridad con la técnica (opcional)', optional: true, options: [
        { value: 'low', label: 'Poca' }, { value: 'medium', label: 'Media' }, { value: 'high', label: 'Mucha' },
      ] },
    ],
  },
  4: {
    title: 'Tu disponibilidad', intro: 'Días y tiempo reales; el plan se adapta a ellos.', schema: availabilitySchema,
    fields: [
      { key: 'days', label: 'Días en que puedes entrenar', multi: true, options: week.map((label, value) => ({ value, label })) },
      { key: 'minutes', label: 'Minutos por sesión', options: [30, 45, 60, 90].map((m) => ({ value: m, label: `${m} min` })) },
    ],
  },
};

export const LAST_STEP = 4; // shortcut: las etapas 5–8 llegan en la fase 2c; subir al añadirlas

export type StepValues = Record<string, string | number | (string | number)[] | undefined>;

/** Devuelve datos validados o errores por campo. */
export function validateStep(step: number, values: StepValues) {
  const r = STEPS[step].schema.safeParse(values);
  if (r.success) return { data: r.data as StepValues, errors: {} as Record<string, string> };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) errors[String(i.path[0])] ??= i.message;
  return { data: null, errors };
}
