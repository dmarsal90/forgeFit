import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { CATALOG, FAMILIES, type CatalogItem } from '../../data/equipment';
import { listCustomItems } from '../../db/customEquipment';
import { attributesSchema, getAttributes, setAttributes } from '../../db/equipmentAttributes';
import { listFavorites, setFavorite } from '../../db/favorites';
import { getInventory, ItemState, setItemState } from '../../db/inventory';
import { useApp } from '../../features/AppContext';
import { Button, Card, Field, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

const FIELDS = [
  { key: 'minKg', label: 'Peso mínimo (kg)' },
  { key: 'maxKg', label: 'Peso máximo (kg)' },
  { key: 'stepKg', label: 'Incremento (kg)' },
  { key: 'barKg', label: 'Peso de la barra o soporte (kg)' },
] as const;
type Key = (typeof FIELDS)[number]['key'];

// Acepta coma decimal; vacío = sin dato; texto no numérico queda como NaN y falla la validación.
const parse = (t: string) => (t.trim() === '' ? null : Number(t.trim().replace(',', '.')));

export default function EquipmentSheet() {
  const { db, profile } = useApp();
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
      setState(inv[id]);
      setFav(favs.has(id));
      setText(Object.fromEntries(FIELDS.map((f) => [f.key, a[f.key] === null ? '' : String(a[f.key])])) as Record<Key, string>);
      setItem(found);
    })().catch(() => setItem(null));
  }, [db, profile, id, env]);

  async function toggle(next: ItemState) {
    const value = state === next ? null : next;
    try { await setItemState(db, env, id, value); setState(value ?? undefined); setError(null); } catch { setError('No se pudo guardar el estado.'); }
  }

  async function toggleFav() {
    if (!profile) return;
    try { await setFavorite(db, profile.id, id, !fav); setFav(!fav); setError(null); } catch { setError('No se pudo guardar el favorito.'); }
  }

  async function save() {
    const parsed = attributesSchema.safeParse(Object.fromEntries(FIELDS.map((f) => [f.key, parse(text[f.key])])));
    if (!parsed.success) { setError(parsed.error.issues[0].path[0] === 'minKg' && parsed.error.issues[0].message.startsWith('El mínimo') ? parsed.error.issues[0].message : 'Revisa los valores: números entre 0 y 1000 (el incremento, mayor que 0).'); setSaved(false); return; }
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

      <Card style={{ gap: space.md }}>
        <Text variant="subtitle">Datos de la máquina</Text>
        <Text variant="caption" muted>Opcionales. Sirven para no sugerirte cargas imposibles.</Text>
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} value={text[f.key]} keyboardType="decimal-pad" maxLength={7}
            onChangeText={(v) => { setText((t) => ({ ...t, [f.key]: v })); setSaved(false); }} />
        ))}
        {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
        {saved ? <Text accessibilityLiveRegion="polite">Guardado.</Text> : null}
        <Button label="Guardar datos" onPress={save} />
      </Card>
    </Screen>
  );
}
