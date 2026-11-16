import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { CATALOG, CatalogItem, FAMILIES, searchCatalog } from '../data/equipment';
import { ENV_LABELS, EnvKind, ensureEnvironment, getInventory, ItemState, markNoEquipment, setItemState } from '../db/inventory';
import { getDrafts } from '../db/onboarding';
import { Button, Card, Field, Screen, Text } from '../ui/components';
import { colors, MIN_TOUCH, radius, space } from '../ui/tokens';
import { useApp } from './AppContext';

type Row = { key: string; header: string } | { key: string; item: CatalogItem };
const KINDS = Object.keys(ENV_LABELS) as EnvKind[];

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={{
        minHeight: MIN_TOUCH, paddingHorizontal: space.lg, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs,
        backgroundColor: colors.surface, borderWidth: selected ? 1.5 : 1, borderColor: selected ? colors.accent : colors.border,
      }}
    >
      {selected ? <Ionicons name="checkmark" size={16} color={colors.accent} /> : null}
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}

function StateButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
      style={{
        flex: 1, minHeight: MIN_TOUCH, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.xs,
        borderWidth: active ? 1.5 : 1, borderColor: active ? colors.accent : colors.border, backgroundColor: colors.surfaceAlt,
      }}
    >
      {active ? <Ionicons name="checkmark-circle" size={18} color={colors.accent} /> : null}
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}

export function EquipmentAudit({ profileId, onNext, onExit, onBack, onPickEnvironments }: {
  profileId: string; onNext: () => void; onExit: () => void; onBack: () => void; onPickEnvironments: () => void;
}) {
  const { db } = useApp();
  const [kinds, setKinds] = useState<EnvKind[] | null>(null);
  const [kind, setKind] = useState<EnvKind | null>(null);
  const [envId, setEnvId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<Record<string, ItemState>>({});
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDrafts(db, profileId).then((d) => {
      const raw = (d[5] as { environments?: unknown } | undefined)?.environments;
      const chosen = KINDS.filter((k) => Array.isArray(raw) && raw.includes(k));
      setKinds(chosen);
      setKind(chosen[0] ?? null);
    }).catch(() => setError('No se pudo cargar tu progreso.'));
  }, [db, profileId]);

  useEffect(() => {
    if (!kind) return;
    let live = true;
    ensureEnvironment(db, profileId, kind)
      .then(async (id) => { const inv = await getInventory(db, id); if (live) { setEnvId(id); setInventory(inv); } })
      .catch(() => live && setError('No se pudo abrir el entorno.'));
    return () => { live = false; setEnvId(null); };
  }, [db, profileId, kind]);

  const set = useCallback(async (itemId: string, state: ItemState) => {
    if (!envId) return;
    const prev = inventory[itemId] ?? null;
    const next = prev === state ? null : state; // volver a pulsar = «sin indicar»
    setInventory((v) => { const c = { ...v }; if (next) c[itemId] = next; else delete c[itemId]; return c; });
    try { await setItemState(db, envId, itemId, next); setError(null); } catch {
      setInventory((v) => { const c = { ...v }; if (prev) c[itemId] = prev; else delete c[itemId]; return c; });
      setError('No se pudo guardar el cambio.');
    }
  }, [db, envId, inventory]);

  async function noEquipment() {
    if (!envId) return;
    try { await markNoEquipment(db, envId); setInventory(await getInventory(db, envId)); setError(null); } catch { setError('No se pudo guardar el cambio.'); }
  }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let last = '';
    for (const item of searchCatalog(query, family)) {
      if (item.family !== last) { last = item.family; out.push({ key: `h_${last}`, header: FAMILIES.find((f) => f.id === last)?.label ?? last }); }
      out.push({ key: item.id, item });
    }
    return out;
  }, [query, family]);

  const counts = useMemo(() => {
    const v = Object.values(inventory);
    return { yes: v.filter((s) => s === 'available').length, no: v.filter((s) => s === 'unavailable').length };
  }, [inventory]);

  if (kinds && kinds.length === 0) {
    return (
      <Screen>
        <Text variant="title">Tu equipamiento</Text>
        <Text muted>Primero elige al menos un entorno de entrenamiento.</Text>
        <Button label="Elegir entornos" onPress={onPickEnvironments} />
        <Button variant="ghost" label="Volver" onPress={onBack} />
      </Screen>
    );
  }

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.md }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text muted>← Volver</Text>
      </Pressable>
      <Text variant="caption" muted>Etapa 6 de 8</Text>
      <Text variant="title">Tu equipamiento</Text>
      <Text muted>Marca qué tienes y qué no en cada entorno. Lo que no indiques queda «sin indicar»; nunca damos nada por supuesto.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {(kinds ?? []).map((k) => <Chip key={k} label={ENV_LABELS[k]} selected={k === kind} onPress={() => setKind(k)} />)}
      </ScrollView>
      <Field label="Buscar equipo" value={query} onChangeText={setQuery} placeholder="Ej.: banco prone, hack squat, polea" autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        <Chip label="Todos" selected={family === null} onPress={() => setFamily(null)} />
        {FAMILIES.map((f) => <Chip key={f.id} label={f.label} selected={family === f.id} onPress={() => setFamily(family === f.id ? null : f.id)} />)}
      </ScrollView>
      <Text variant="caption" muted accessibilityLiveRegion="polite">
        {counts.yes} disponibles · {counts.no} no disponibles · {CATALOG.length - counts.yes - counts.no} sin indicar
      </Text>
      <Button variant="secondary" label="No tengo equipamiento" onPress={noEquipment} disabled={!envId} />
      {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );

  return (
    <Screen scroll={false}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={<Text muted>Ningún equipo coincide con tu búsqueda.</Text>}
        ListFooterComponent={
          <View style={{ gap: space.md, paddingTop: space.lg }}>
            <Button label="Continuar" icon="arrow-forward" onPress={onNext} />
            <Button variant="secondary" label="Guardar y salir" onPress={onExit} />
          </View>
        }
        renderItem={({ item: r }) => 'header' in r ? (
          <Text variant="subtitle" style={{ paddingTop: space.lg, paddingBottom: space.sm }} accessibilityRole="header">{r.header}</Text>
        ) : (
          <Card style={{ gap: space.sm, marginBottom: space.sm }}>
            <View>
              <Text variant="subtitle">{r.item.es}</Text>
              <Text variant="caption" muted>{r.item.en}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <StateButton label="Tengo" active={inventory[r.item.id] === 'available'} onPress={() => set(r.item.id, 'available')} />
              <StateButton label="No tengo" active={inventory[r.item.id] === 'unavailable'} onPress={() => set(r.item.id, 'unavailable')} />
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}
