import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { CATALOG, FAMILIES, type CatalogItem } from '../../data/equipment';
import { listCustomItems } from '../../db/customEquipment';
import { attributesSchema, getAttributes, setAttributes } from '../../db/equipmentAttributes';
import { listPlates, plateLabel, setPlates, type PlateRow } from '../../db/equipmentPlates';
import { listFavorites, setFavorite } from '../../db/favorites';
import { getInventory, ItemState, setItemState } from '../../db/inventory';
import { useApp } from '../../features/AppContext';
import { isBar, isPlates, TYPICAL_BAR_KG } from '../../lib/loadModel';
import { standardSizes } from '../../lib/plates';
import { fmtWeight, kgToUnit, unitToKg, type WeightUnit } from '../../lib/units';
import { Button, Card, Choice, Field, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

const FIELDS = [
  { key: 'minKg', label: 'Peso mínimo' },
  { key: 'maxKg', label: 'Peso máximo' },
  { key: 'stepKg', label: 'Incremento' },
  { key: 'barKg', label: 'Peso de la barra o soporte' },
] as const;
type Key = (typeof FIELDS)[number]['key'];

type Shown = { key: Key; label: string; hint?: string }[];
/** Los datos que tienen sentido según el equipo: una barra solo tiene peso; los discos, el más pequeño; el resto, los cuatro. */
function fieldsFor(id: string, unit: 'kg' | 'lb'): { intro: string; fields: Shown } {
  if (isBar(id)) {
    const typical = TYPICAL_BAR_KG[id];
    return {
      intro: 'Opcional. Con el peso de tu barra, las cargas que te sugerimos son posibles (barra + discos).',
      fields: [{ key: 'barKg', label: 'Peso de la barra', hint: typical !== undefined ? `Lo habitual en esta barra: ${fmtWeight(typical, unit)}. Cámbialo si la tuya pesa distinto.` : 'Varía según el fabricante: pésala o mira el grabado. Sin este dato no se ajustan las cargas a la barra.' }],
    };
  }
  return { intro: 'Opcionales. Sirven para no sugerirte cargas imposibles.', fields: [...FIELDS] };
}

// Acepta coma decimal; vacío = sin dato; texto no numérico queda como NaN y falla la validación.
const parse = (t: string) => (t.trim() === '' ? null : Number(t.trim().replace(',', '.')));

export default function EquipmentSheet() {
  const { db, profile } = useApp();
  const profileUnit = profile?.weightUnit ?? 'kg';
  const [unit, setUnit] = useState<WeightUnit>(profileUnit); // unidad en la que se ve y se escribe este equipo
  const [plates, setPlatesState] = useState<PlateRow[]>([]);
  const [other, setOther] = useState({ value: '', unit: profileUnit as WeightUnit });
  const { id, env } = useLocalSearchParams<{ id: string; env: string }>();
  const [item, setItem] = useState<CatalogItem | null | undefined>(undefined);
  const [state, setState] = useState<ItemState | undefined>();
  const [fav, setFav] = useState(false);
  const [text, setText] = useState<Record<Key, string>>({ minKg: '', maxKg: '', stepKg: '', barKg: '' });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile || !id || !env) return;
    (async () => {
      // El entorno viene de la URL: solo vale si es del perfil activo.
      const own = await db.getFirstAsync('SELECT 1 FROM training_environments WHERE id = ? AND profile_id = ?', [env, profile.id]);
      const found = own ? CATALOG.find((i) => i.id === id) ?? (await listCustomItems(db, profile.id)).find((i) => i.id === id) : undefined;
      if (!found) { setItem(null); return; }
      const [inv, a, favs] = await Promise.all([getInventory(db, env), getAttributes(db, env, id), listFavorites(db, profile.id)]);
      const u = a.unit ?? profileUnit;
      setState(inv[id]);
      setFav(favs.has(id));
      setUnit(u);
      if (isPlates(id)) setPlatesState(await listPlates(db, env, id));
      setText(Object.fromEntries(FIELDS.map((f) => [f.key, a[f.key] === null ? '' : String(kgToUnit(a[f.key] as number, u))])) as Record<Key, string>);
      setItem(found);
    })().catch(() => setItem(null));
  }, [db, profile, id, env, profileUnit]);

  async function toggle(next: ItemState) {
    const value = state === next ? null : next;
    try { await setItemState(db, env, id, value); setState(value ?? undefined); setError(null); } catch { setError('No se pudo guardar el estado.'); }
  }

  function changeUnit(next: WeightUnit) {
    if (next === unit) return;
    // Lo ya escrito se convierte a la unidad nueva (el peso es el mismo; solo cambia cómo se muestra).
    setText((t) => Object.fromEntries(FIELDS.map((f) => { const v = parse(t[f.key]); return [f.key, v === null || !Number.isFinite(v) ? t[f.key] : String(kgToUnit(unitToKg(v, unit), next))]; })) as Record<Key, string>);
    setUnit(next);
    setSaved(false);
  }

  async function savePlates(rows: PlateRow[]) {
    try { await setPlates(db, env, id, rows); setPlatesState(await listPlates(db, env, id)); setError(null); }
    catch { setError('No se pudieron guardar los discos. Revisa los valores.'); }
  }
  const addSeries = (u: WeightUnit) => {
    const have = new Set(plates.map((p) => `${p.unit}:${p.value}`));
    return savePlates([...plates, ...standardSizes(u).filter((v) => !have.has(`${u}:${v}`)).map((value) => ({ unit: u, value, pairs: 2 }))]);
  };
  const addOne = () => {
    const value = parse(other.value);
    if (value === null || !Number.isFinite(value) || value <= 0) { setError('Escribe cuánto pesa el disco.'); return; }
    if (plates.some((p) => p.unit === other.unit && p.value === value)) { setError('Ese disco ya está en la lista.'); return; }
    setOther((o) => ({ ...o, value: '' }));
    return savePlates([...plates, { unit: other.unit, value, pairs: 2 }]);
  };
  const setPairs = (r: PlateRow, pairs: number) => savePlates(plates.flatMap((p) => (p === r ? (pairs < 1 ? [] : [{ ...p, pairs: Math.min(20, pairs) }]) : [p])));

  async function toggleFav() {
    if (!profile) return;
    try { await setFavorite(db, profile.id, id, !fav); setFav(!fav); setError(null); } catch { setError('No se pudo guardar el favorito.'); }
  }

  async function save() {
    const parsed = attributesSchema.safeParse({ ...Object.fromEntries(FIELDS.map((f) => { const v = parse(text[f.key]); return [f.key, v === null ? null : unitToKg(v, unit)]; })), unit: unit === profileUnit ? null : unit });
    if (!parsed.success) { setError(parsed.error.issues[0].path[0] === 'minKg' && parsed.error.issues[0].message.startsWith('El mínimo') ? parsed.error.issues[0].message : `Revisa los valores: números entre 0 y ${kgToUnit(1000, unit)} ${unit} (el incremento, mayor que 0).`); setSaved(false); return; }
    try { await setAttributes(db, env, id, parsed.data); setError(null); setSaved(true); } catch { setError('No se pudo guardar.'); setSaved(false); }
  }

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text muted>← Volver</Text>
    </Pressable>
  );
  if (item === undefined) return <Screen>{back}</Screen>;
  if (item === null) return <Screen>{back}<Text muted>No se encontró este equipo.</Text></Screen>;

  return (
    <Screen>
      {back}
      <Text variant="title">{item.es}</Text>
      {item.en ? <Text muted>{item.en}</Text> : null}
      <Text variant="caption" muted>{FAMILIES.find((f) => f.id === item.family)?.label}{item.aliases.length ? ` · También: ${item.aliases.join(', ')}` : ''}</Text>

      <Button variant="secondary" icon={fav ? 'star' : 'star-outline'} label={fav ? 'Quitar de favoritos' : 'Añadir a favoritos'} onPress={toggleFav} />

      <Card style={{ gap: space.md }}>
        <Text variant="subtitle">En este entorno</Text>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}><Button variant={state === 'available' ? 'primary' : 'secondary'} label="Lo tengo" onPress={() => toggle('available')} /></View>
          <View style={{ flex: 1 }}><Button variant={state === 'unavailable' ? 'primary' : 'secondary'} label="No lo tengo" onPress={() => toggle('unavailable')} /></View>
        </View>
      </Card>

      {isPlates(item.id) ? (
        <Card style={{ gap: space.md }}>
          <Text variant="subtitle">Mis discos</Text>
          <Text variant="caption" muted>Indica qué discos tienes y cuántos pares de cada uno. Cada disco va en su unidad: puedes tener unos en kg y otros en lb. Con esto te decimos qué discos poner en cada lado de la barra.</Text>
          {plates.length === 0 ? <Text muted>Aún no has indicado ningún disco.</Text> : null}
          {plates.map((r) => (
            <View key={`${r.unit}:${r.value}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 }}>
              <Text style={{ flex: 1 }}>{plateLabel(r)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={r.pairs === 1 ? `Quitar el disco de ${plateLabel(r)}` : `Un par menos de ${plateLabel(r)}`} onPress={() => setPairs(r, r.pairs - 1)}
                style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border }}><Text variant="subtitle">−</Text></Pressable>
              <Text accessibilityLabel={`${r.pairs} ${r.pairs === 1 ? 'par' : 'pares'} de ${plateLabel(r)}`}>{r.pairs} {r.pairs === 1 ? 'par' : 'pares'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Un par más de ${plateLabel(r)}`} onPress={() => setPairs(r, r.pairs + 1)}
                style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border }}><Text variant="subtitle">+</Text></Pressable>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}><Button variant="secondary" label="Serie en kg" onPress={() => addSeries('kg')} /></View>
            <View style={{ flex: 1 }}><Button variant="secondary" label="Serie en lb" onPress={() => addSeries('lb')} /></View>
          </View>
          <Field label={`Otro disco (${other.unit})`} value={other.value} keyboardType="decimal-pad" maxLength={6} onChangeText={(v) => setOther((o) => ({ ...o, value: v }))} />
          <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
            {(['kg', 'lb'] as const).map((u) => <View key={u} style={{ flex: 1 }}><Choice label={u} selected={other.unit === u} onPress={() => setOther((o) => ({ ...o, unit: u }))} /></View>)}
          </View>
          <Button label="Añadir disco" onPress={addOne} />
          {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
        </Card>
      ) : (
      <Card style={{ gap: space.md }}>
        <Text variant="subtitle">{isBar(item.id) ? 'Datos de la barra' : 'Datos de la máquina'}</Text>
        <Text variant="caption" muted>{fieldsFor(item.id, unit).intro}</Text>
        <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Unidad de este equipo">
          {(['kg', 'lb'] as const).map((u) => <View key={u} style={{ flex: 1 }}><Choice label={`En ${u}`} selected={unit === u} onPress={() => changeUnit(u)} /></View>)}
        </View>
        {fieldsFor(item.id, unit).fields.map((f) => (
          <Field key={f.key} label={`${f.label} (${unit})`} hint={f.hint} value={text[f.key]} keyboardType="decimal-pad" maxLength={7}
            onChangeText={(v) => { setText((t) => ({ ...t, [f.key]: v })); setSaved(false); }} />
        ))}
        {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
        {saved ? <Text accessibilityLiveRegion="polite">Guardado.</Text> : null}
        <Button label="Guardar datos" onPress={save} />
      </Card>
      )}
    </Screen>
  );
}
