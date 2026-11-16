import { z } from 'zod';

const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : Number(v.replace(',', '.'))) : v),
    z.number().int().min(min).max(max).optional(),
  );

export const profileInputSchema = z.object({
  alias: z.string().trim().min(1, 'Escribe un nombre o alias').max(40, 'Máximo 40 caracteres'),
  anatomicalModel: z.enum(['male', 'female']).optional(),
  age: optionalInt(10, 100),
  heightCm: optionalInt(100, 250),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
