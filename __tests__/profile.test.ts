import { profileInputSchema } from '../src/lib/profile';

describe('profileInputSchema', () => {
  it('solo exige alias; el resto queda indefinido (sin valores por defecto)', () => {
    const r = profileInputSchema.parse({ alias: ' Ana ', age: '', heightCm: '' });
    expect(r).toEqual({ alias: 'Ana' });
  });
  it('rechaza alias vacío', () => {
    expect(profileInputSchema.safeParse({ alias: '  ' }).success).toBe(false);
  });
  it('convierte edad/estatura de texto y valida rangos', () => {
    expect(profileInputSchema.parse({ alias: 'A', age: '30', heightCm: '175' })).toMatchObject({ age: 30, heightCm: 175 });
    expect(profileInputSchema.safeParse({ alias: 'A', age: '3' }).success).toBe(false);
    expect(profileInputSchema.safeParse({ alias: 'A', heightCm: 'abc' }).success).toBe(false);
  });
  it('rechaza un modelo fuera de la lista', () => {
    expect(profileInputSchema.safeParse({ alias: 'A', anatomicalModel: 'x' }).success).toBe(false);
  });
});
