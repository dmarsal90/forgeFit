import { KG_PER_LB, platesPerSide, standardPlates, type PlateResult } from '../src/lib/plates';

const sides = (r: PlateResult) => (r.status === 'ok' ? r.perSide.map((p) => `${p.count}×${Math.round(p.kg * 1000) / 1000}`) : []);
const KG = standardPlates('kg');
const LB = standardPlates('lb');
const lb = (x: number) => x * KG_PER_LB;

describe('discos en kg', () => {
  it('monta el peso con los discos justos por lado', () => {
    expect(platesPerSide(62.5, 20, KG)).toMatchObject({ status: 'ok', totalKg: 62.5 });
    expect(sides(platesPerSide(62.5, 20, KG))).toEqual(['1×20', '1×1.25']);
    expect(sides(platesPerSide(60, 20, KG))).toEqual(['1×20']);
  });
  it('prefiere menos discos y, a igualdad, los más grandes (100 kg: 25+15, no 20+20)', () => {
    expect(sides(platesPerSide(100, 20, KG))).toEqual(['1×25', '1×15']);
    expect(sides(platesPerSide(70, 20, KG))).toEqual(['1×25']);
  });
  it('solo la barra, y tolerancia de 5 g sobre el objetivo', () => {
    expect(platesPerSide(20, 20, KG)).toEqual({ status: 'ok', totalKg: 20, perSide: [] });
    expect(platesPerSide(19.998, 20, KG).status).toBe('ok');
    expect(platesPerSide(62.5004, 20, KG).status).toBe('ok');
  });
  it('por debajo de la barra no se puede', () => {
    expect(platesPerSide(15, 20, KG)).toEqual({ status: 'below_bar' });
  });
  it('usa varios pares del mismo tamaño solo si los tiene', () => {
    expect(sides(platesPerSide(120, 20, KG))).toEqual(['2×25']);
    expect(sides(platesPerSide(140, 20, KG))).toEqual(['2×25', '1×10']);
    const oneEach: ReturnType<typeof standardPlates> = standardPlates('kg', 1);
    expect(sides(platesPerSide(140, 20, oneEach))).toEqual(['1×25', '1×20', '1×15']); // sin el segundo par de 25
  });
});

describe('peso imposible', () => {
  it('devuelve los montajes posibles más cercanos por debajo y por encima', () => {
    const r = platesPerSide(21, 20, KG); // 0,5 kg por lado: no hay disco tan pequeño
    expect(r.status).toBe('impossible');
    if (r.status !== 'impossible') return;
    expect(r.below).toEqual({ totalKg: 20, perSide: [] });
    expect(r.above).toMatchObject({ totalKg: 22.5 });
    expect(r.above?.perSide).toEqual([{ kg: 1.25, count: 1 }]);
  });
  it('con poco stock el máximo posible es el techo y no hay montaje por encima', () => {
    const few = [{ kg: 20, pairs: 1 }, { kg: 10, pairs: 1 }];
    const r = platesPerSide(100, 20, few); // 40 por lado y solo hay 30
    expect(r.status).toBe('impossible');
    if (r.status !== 'impossible') return;
    expect(r.above).toBeNull();
    expect(r.below).toMatchObject({ totalKg: 80 });
  });
  it('sin discos solo se puede la barra', () => {
    expect(platesPerSide(20, 20, [])).toEqual({ status: 'ok', totalKg: 20, perSide: [] });
    expect(platesPerSide(30, 20, [])).toMatchObject({ status: 'impossible', above: null });
  });
});

describe('discos en libras (unidad propia, independiente de la del perfil)', () => {
  it('la serie estándar en libras se guarda en kg exactos', () => {
    expect(LB.map((p) => Math.round((p.kg / KG_PER_LB) * 1000) / 1000)).toEqual([45, 35, 25, 10, 5, 2.5]);
  });
  it('135 lb con barra de 45 lb = un disco de 45 por lado; 225 lb = dos; 100 lb = 25 + 2,5', () => {
    expect(sides(platesPerSide(lb(135), lb(45), LB))).toEqual(['1×20.412']);
    expect(sides(platesPerSide(lb(225), lb(45), LB))).toEqual(['2×20.412']);
    expect(sides(platesPerSide(lb(100), lb(45), LB))).toEqual(['1×11.34', '1×1.134']);
  });
  it('un peso en kg con discos en libras: lo que no se puede montar se dice (60 kg con barra de 20 kg)', () => {
    const r = platesPerSide(60, 20, LB); // 20 kg por lado: 20,41 es el disco más cercano
    expect(r.status).toBe('impossible');
  });
});

describe('discos en kg y en lb a la vez (entornos con los dos)', () => {
  const BOTH = [...standardPlates('kg'), ...standardPlates('lb')];

  it('un peso en kg se monta con los discos en kg, y uno en lb con los de lb', () => {
    expect(sides(platesPerSide(100, 20, BOTH))).toEqual(['1×25', '1×15']);
    expect(sides(platesPerSide(lb(135), lb(45), BOTH))).toEqual(['1×20.412']); // 45 lb por lado
    expect(sides(platesPerSide(lb(225), lb(45), BOTH))).toEqual(['2×20.412']);
  });
  it('el total real sale de los discos elegidos: con un disco de 2,5 lb entre discos en kg, se usa el que cuadra', () => {
    const r = platesPerSide(20 + 2 * lb(2.5), 20, BOTH); // 22,268 kg: solo cuadra el disco de 2,5 lb
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.perSide).toEqual([{ kg: standardPlates('lb')[5].kg, count: 1 }]);
      expect(r.totalKg).toBeCloseTo(22.268, 3);
    }
  });
  it('un peso redondo en kg que solo se alcanza mezclando se alcanza, y lo imposible da los vecinos reales', () => {
    expect(platesPerSide(20 + 2 * (25 + lb(2.5)), 20, BOTH).status).toBe('ok'); // 25 kg + 2,5 lb por lado
    const r = platesPerSide(21, 20, BOTH);
    expect(r.status).toBe('impossible');
    if (r.status === 'impossible') expect(r.above?.totalKg).toBeCloseTo(22.268, 3); // el siguiente posible es 2×2,5 lb
  });
  it('muchos tamaños y pares siguen calculándose al instante', () => {
    const many = [...standardPlates('kg', 4), ...standardPlates('lb', 4)];
    const t0 = Date.now();
    for (const target of [60, 137.5, 190, 250, 333.3]) platesPerSide(target, 20, many);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('datos no válidos', () => {
  it('rechaza objetivo o barra no numéricos o negativos y descarta discos mal definidos', () => {
    for (const [t, b] of [[NaN, 20], [60, NaN], [-5, 20], [60, -1], [Infinity, 20]]) expect(platesPerSide(t, b, KG)).toEqual({ status: 'unsupported' });
    const junk = [{ kg: 0, pairs: 2 }, { kg: -5, pairs: 2 }, { kg: 5, pairs: 0 }, { kg: 5, pairs: 1.5 }, { kg: NaN, pairs: 1 }, { kg: 10, pairs: 1 }];
    expect(sides(platesPerSide(40, 20, junk))).toEqual(['1×10']);
  });
});

describe('contraste con fuerza bruta', () => {
  // Enumera todos los montajes posibles y compara: mismo conjunto de pesos alcanzables y mínimo número de discos.
  const brute = (stock: { kg: number; pairs: number }[]) => {
    const out = new Map<number, number>(); // suma por lado (en 0,01 kg) → menos discos
    const rec = (i: number, sum: number, n: number) => {
      if (i === stock.length) { const k = Math.round(sum * 100); if (!out.has(k) || n < (out.get(k) as number)) out.set(k, n); return; }
      for (let c = 0; c <= stock[i].pairs; c++) rec(i + 1, sum + c * stock[i].kg, n + c);
    };
    rec(0, 0, 0);
    return out;
  };
  let seed = 7;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };

  it('50 combinaciones aleatorias: alcanzable ⇔ la tabla lo dice, con el mínimo de discos', () => {
    for (let t = 0; t < 50; t++) {
      const sizes = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5].filter(() => rnd(2) === 1).slice(0, 6);
      const stock = sizes.map((kg) => ({ kg, pairs: 1 + rnd(3) }));
      const reach = brute(stock);
      const bar = [15, 20][rnd(2)];
      for (let k = 0; k < 8; k++) {
        const perSide = rnd(80) * 0.25; // 0 … 19,75 kg por lado
        const r = platesPerSide(bar + 2 * perSide, bar, stock);
        const want = reach.get(Math.round(perSide * 100));
        if (want === undefined) expect(r.status === 'impossible' || (stock.length === 0 && r.status === 'ok')).toBe(true);
        else {
          expect(r.status).toBe('ok');
          if (r.status === 'ok') expect(r.perSide.reduce((n, p) => n + p.count, 0)).toBe(want);
        }
      }
    }
  });
});

describe('contraste con fuerza bruta, mezclando kg y lb', () => {
  const sizes = [25, 20, 15, 10, 5, 2.5, 1.25, lb(45), lb(35), lb(25), lb(10), lb(5), lb(2.5)];
  let seed = 11;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };

  it('si algún montaje real cuadra con el objetivo, lo encuentra con el mínimo de discos; si ninguno se acerca, dice imposible', () => {
    for (let t = 0; t < 40; t++) {
      const stock = sizes.filter(() => rnd(3) > 0).slice(0, 7).map((kg) => ({ kg, pairs: 1 + rnd(2) }));
      const sums: { sum: number; n: number }[] = [];
      const rec = (i: number, sum: number, n: number) => {
        if (i === stock.length) { sums.push({ sum, n }); return; }
        for (let c = 0; c <= stock[i].pairs; c++) rec(i + 1, sum + c * stock[i].kg, n + c);
      };
      rec(0, 0, 0);
      for (let k = 0; k < 6; k++) {
        const target = 20 + 2 * (rnd(120) * 0.25);
        const near = sums.filter((s) => Math.abs(20 + 2 * s.sum - target) <= 0.005);
        const farthest = sums.every((s) => Math.abs(20 + 2 * s.sum - target) > 0.02);
        const r = platesPerSide(target, 20, stock);
        if (near.length) {
          expect(r.status).toBe('ok');
          if (r.status === 'ok') expect(r.perSide.reduce((n, p) => n + p.count, 0)).toBe(Math.min(...near.map((s) => s.n)));
        } else if (farthest) expect(r.status).toBe('impossible'); // los casos intermedios (entre 5 y 20 g) dependen del redondeo y no se afirman
      }
    }
  });
});
