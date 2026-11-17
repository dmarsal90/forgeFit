import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { CATALOG, CatalogItem, FAMILIES, searchCatalog } from '../data/equipment';
import { ENV_LABELS, EnvKind, ensureEnvironment, getInventory, ItemState, markNoEquipment, setItemState } from '../db/inventory';
import { getDrafts } from '../db/onboarding';
import { Button, Card, Field, Screen, Text } from '../ui/components';
import { colors, MIN_TOUCH, radius, space } from '../ui/tokens';
import { useApp } from './AppContext';

type Row = { key: string; group: { id: string; label: string; marked: number; total: number; expanded: boolean } } | { key: string; item: CatalogItem };
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

function IconToggle({ icon, label, active, tint, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; tint: string; onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress}
      style={{
        width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center',
        borderWidth: active ? 1.5 : 1, borderColor: active ? tint : colors.border, backgroundColor: active ? tint : colors.surfaceAlt,
      }}
    >
      <Ionicons name={icon} size={22} color={active ? colors.onAccent : colors.textMuted} />
    </Pressable>
  );
}

// Memoizada: al marcar un equipo solo se repinta su fila, no las ~275 del catálogo.
const ItemRow = memo(function ItemRow({ item, state, onSet }: {
  item: CatalogItem; state: ItemState | undefined; onSet: (id: string, prev: ItemState | null, next: ItemState | null) => void;
}) {
  const prev = state ?? null;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, marginBottom: space.sm }}>
      <View style={{ flex: 1 }}>
        <Text>{item.es}</Text>
        <Text variant="caption" muted numberOfLines={1}>{item.en}</Text>
      </View>
      <IconToggle icon="checkmark" label={`Tengo: ${item.es}`} active={state === 'available'} tint={colors.accent}
        onPress={() => onSet(item.id, prev, prev === 'available' ? null : 'available')} />
      <IconToggle icon="close" label={`No tengo: ${item.es}`} active={state === 'unavailable'} tint={colors.error}
        onPress={() => onSet(item.id, prev, prev === 'unavailable' ? null : 'unavailable')} />
    </Card>
  );
});

const FAMILY_TOTAL = Object.fromEntries(FAMILIES.map((f) => [f.id, CATALOG.filter((i) => i.family === f.id).length]));

const GroupHeader = memo(function GroupHeader({ id, label, marked, total, expanded, onToggle }: {
  id: string; label: string; marked: number; total: number; expanded: boolean; onToggle: (id: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${label}, ${marked} de ${total} indicados`}
      onPress={() => onToggle(id)}
      style={{
        minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm,
        paddingHorizontal: space.lg, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      }}
    >
      <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={20} color={colors.accent} />
      <Text variant="subtitle" style={{ flex: 1 }}>{label}</Text>
      <Text variant="caption" muted>{marked} de {total}</Text>
    </Pressable>
  );
});

export function EquipmentAudit({ profileId, onNext, onExit, onBack, onPickEnvironments }: {
  profileId: string; onNext: () => void; onExit: () => void; onBack: () => void; onPickEnvironments: () => void;
}) {
  const { db } = useApp();
  const [kinds, setKinds] = useState<EnvKind[] | null>(null);
  const [kind, setKind] = useState<EnvKind | null>(null);
  const [envId, setEnvId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<Record<string, ItemState>>({});
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
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

  const set = useCallback(async (itemId: string, prev: ItemState | null, next: ItemState | null) => {
    if (!envId) return;
    const apply = (st: ItemState | null) => setInventory((v) => { const c = { ...v }; if (st) c[itemId] = st; else delete c[itemId]; return c; });
    apply(next);
    try { await setItemState(db, envId, itemId, next); setError(null); } catch {
      apply(prev);
      setError('No se pudo guardar el cambio.');
    }
  }, [db, envId]);

  const toggleGroup = useCallback((id: string) => setOpen((o) => ({ ...o, [id]: !o[id] })), []);

  async function noEquipment() {
    if (!envId) return;
    try { await markNoEquipment(db, envId); setInventory(await getInventory(db, envId)); setError(null); } catch { setError('No se pudo guardar el cambio.'); }
  }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const searching = query.trim() !== '';
    for (const f of FAMILIES) {
      const items = searchCatalog(query, f.id);
      if (!items.length) continue;
      const expanded = searching || !!open[f.id]; // al buscar se despliegan los grupos con resultados
      const marked = CATALOG.reduce((n, i) => n + (i.family === f.id && inventory[i.id] ? 1 : 0), 0);
      out.push({ key: `g_${f.id}`, group: { id: f.id, label: f.label, marked, total: FAMILY_TOTAL[f.id], expanded } });
      if (expanded) for (const item of items) out.push({ key: item.id, item });
    }
    return out;
  }, [query, open, inventory]);

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
      <Text variant="caption" muted>Etapa 6 de 8</Text>
      <Text variant="title">Tu equipamiento</Text>
      <Text muted>Marca qué tienes y qué no en cada entorno. Lo que no indiques queda «sin indicar»; nunca damos nada por supuesto.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {(kinds ?? []).map((k) => <Chip key={k} label={ENV_LABELS[k]} selected={k === kind} onPress={() => setKind(k)} />)}
      </ScrollView>
      <Field label="Buscar equipo" value={query} onChangeText={setQuery} placeholder="Ej.: banco prone, hack squat, polea" autoCorrect={false} />
      <Text variant="caption" muted>✓ Tengo · ✕ No tengo · sin marcar = sin indicar</Text>
      <Text variant="caption" muted accessibilityLiveRegion="polite">
        {counts.yes} disponibles · {counts.no} no disponibles · {CATALOG.length - counts.yes - counts.no} sin indicar
      </Text>
      <Button variant="secondary" label="No tengo equipamiento" onPress={noEquipment} disabled={!envId} />
      {error ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );

  return (
    <Screen scroll={false}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text muted>← Volver</Text>
      </Pressable>
      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={<Text muted>Ningún equipo coincide con tu búsqueda.</Text>}
        extraData={inventory}
        initialNumToRender={14}
        windowSize={7}
        maxToRenderPerBatch={14}
        renderItem={({ item: r }) => 'group' in r ? (
          <GroupHeader {...r.group} onToggle={toggleGroup} />
        ) : (
          <ItemRow item={r.item} state={inventory[r.item.id]} onSet={set} />
        )}
      />
      <View style={{ flexDirection: 'row', gap: space.sm, paddingTop: space.md }}>
        <View style={{ flex: 1 }}><Button variant="secondary" label="Guardar y salir" onPress={onExit} /></View>
        <View style={{ flex: 1 }}><Button label="Continuar" icon="arrow-forward" onPress={onNext} /></View>
      </View>
    </Screen>
  );
}
