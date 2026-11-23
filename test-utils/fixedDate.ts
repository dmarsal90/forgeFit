// Los tests fijan fechas de noviembre de 2026 (semana del 16 al 22): sin reloj fijo se rompen al cambiar la semana real.
// Se desplaza Date (sigue avanzando con el tiempo real) sin falsear temporizadores, que testing-library trataría distinto.
const RealDate = Date;
const offset = new RealDate(2026, 10, 18, 10, 0).getTime() - RealDate.now();
class ShiftedDate extends RealDate {
  constructor(...args: [] | [number | string | Date] | [number, number, number?, number?, number?, number?, number?]) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...(args as ConstructorParameters<typeof Date>));
  }
  static now() { return RealDate.now() + offset; }
}
globalThis.Date = ShiftedDate as DateConstructor;
