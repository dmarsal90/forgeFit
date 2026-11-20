import { barSystem, loadModel, plateSystem, TYPICAL_BAR_KG } from '../src/lib/loadModel';

const it_ = (id: string, stepKg: number | null = null, barKg: number | null = null) => ({ id, stepKg, barKg });

describe('loadModel', () => {
  it('discos: el escalón es el doble del disco más pequeño (se cargan por pares), el menor de los que tiene', () => {
    expect(loadModel([it_('plates_olympic_iron', 1.25)])).toEqual({ stepKg: 2.5, barKg: undefined });
    expect(loadModel([it_('plates_olympic_iron', 1.25), it_('plates_fractional', 0.25)]).stepKg).toBe(0.5);
  });
  it('barra: usa el peso de su ficha, o el habitual de la olímpica (20 kg), la femenina (15 kg) y la de powerlifting', () => {
    expect(loadModel([it_('barbell_olympic_20')]).barKg).toBe(20);
    expect(loadModel([it_('barbell_olympic_15')]).barKg).toBe(15);
    expect(loadModel([it_('barbell_powerlifting')]).barKg).toBe(TYPICAL_BAR_KG.barbell_powerlifting);
    expect(loadModel([it_('barbell_olympic_20', null, 22)]).barKg).toBe(22); // lo aclarado en la ficha manda sobre el habitual
  });
  it('otras barras (EZ, hexagonal, corta…) no se suponen: hay que indicar su peso', () => {
    for (const id of ['barbell_ez_olympic', 'barbell_trap_hex', 'barbell_short', 'barbell_standard_25mm', 'barbell_safety_squat']) expect(loadModel([it_(id)]).barKg).toBeUndefined();
    expect(loadModel([it_('barbell_trap_hex', null, 25)]).barKg).toBe(25);
  });
  it('varias barras con pesos distintos, o alguna sin peso conocido, es ambiguo: no se supone ninguna', () => {
    expect(loadModel([it_('barbell_olympic_20'), it_('barbell_olympic_15')]).barKg).toBeUndefined();
    expect(loadModel([it_('barbell_olympic_20'), it_('barbell_ez_olympic')]).barKg).toBeUndefined();
    expect(loadModel([it_('barbell_olympic_20'), it_('barbell_powerlifting')]).barKg).toBe(20); // mismo peso: no hay ambigüedad
  });
  it('mancuernas, máquinas y poleas: el menor incremento; las barras no aportan escalón; sin datos no hay nada', () => {
    expect(loadModel([it_('dumbbells_fixed_hex', 2), it_('dumbbells_adjustable_dial', 1)]).stepKg).toBe(1);
    expect(loadModel([it_('barbell_olympic_20', 5)]).stepKg).toBeUndefined();
    expect(loadModel([])).toEqual({ stepKg: undefined, barKg: undefined });
  });
  it('los discos mandan sobre otros incrementos cuando el ejercicio se carga con barra', () => {
    expect(loadModel([it_('plates_olympic_iron', 1.25), it_('bench_flat_rack', 5)]).stepKg).toBe(2.5);
  });
});

describe('sistemas de carga', () => {
  it('la manga de 25 mm y la olímpica no admiten los mismos discos', () => {
    for (const id of ['barbell_standard_25mm', 'barbell_ez_standard', 'barbell_short']) expect(barSystem(id)).toBe('standard');
    for (const id of ['barbell_olympic_20', 'barbell_olympic_15', 'barbell_powerlifting', 'barbell_ez_olympic', 'barbell_trap_hex', 'barbell_safety_squat']) expect(barSystem(id)).toBe('olympic');
    expect(plateSystem('plates_standard_25mm')).toBe('standard');
    for (const id of ['plates_olympic_iron', 'plates_olympic_bumper', 'plates_olympic_competition', 'plates_fractional']) expect(plateSystem(id)).toBe('olympic');
  });
});
