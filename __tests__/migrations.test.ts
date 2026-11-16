import { migrations } from '../src/db/migrations';

it('la migración 001 no define valores por defecto de datos personales', () => {
  const sql = migrations[0];
  expect(sql).toMatch(/CREATE TABLE profiles/);
  const profiles = sql.split('CREATE TABLE app_state')[0];
  expect(profiles).not.toMatch(/DEFAULT/i);
});
