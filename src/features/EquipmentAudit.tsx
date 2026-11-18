import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { CATALOG, CatalogItem, FAMILIES, searchCatalog } from '../data/equipment';
import { addCustomItem, CUSTOM_PREFIX, deleteCustomItem, listCustomItems } from '../db/customEquipment';
import { ENV_LABELS, EnvKind, ensureEnvironment, getInventory, ItemState, markNoEquipment, setItemState } from '../db/inventory';
import { listFavorites } from '../db/favorites';
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
const ItemRow = memo(function ItemRow({ item, state, onSet, onDelete, onOpen }: {
  item: CatalogItem; state: ItemState | undefined; onSet: (id: string, prev: ItemState | null, next: ItemState | null) => void;
  onDelete?: (id: string) => void; onOpen: (id: string) => void;
}) {
  const prev = state ?? null;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, marginBottom: space.sm }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ficha: ${item.es}`} onPress={() => onOpen(item.id)} style={{ flex: 1, minHeight: MIN_TOUCH, justifyContent: 'center' }}>
        <Text>{item.es}</Text>
        {item.en ? <Text variant="caption" muted numberOfLines={1}>{item.en}</Text> : null}
      </Pressable>
      {onDelete ? <IconToggle icon="trash-outline" label={`Eliminar equipo propio: ${item.es}`} active={false} tint={colors.error} onPress={() => onDelete(item.id)} /> : null}
      <IconToggle icon="checkmark" label={`Tengo: ${item.es}`} active={state === 'available'} tint={colors.accent}
        onPress={() => onSet(item.id, prev, prev === 'available' ? null : 'available')} />
      <IconToggle icon="close" label={`No tengo: ${item.es}`} active={state === 'unavailable'} tint={colors.error}
        onPress={() => onSet(item.id, prev, prev === 'unavailable' ? null : 'unavailable')} />
    </Card>
  );
});

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
  const [custom, setCustom] = useState<CatalogItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFamily, setNewFamily] = useState(FAMILIES[0].id);
  const items = useMemo(() => [...CATALOG, ...custom], [custom]);

  // Se recarga al volver de la ficha o de la copia, que cambian estados, favoritos y equipo propio.
  useFocusEffect(useCallback(() => {
    listFavorites(db, profileId).then(setFavs).catch(() => setError('No se pudieron cargar tus favoritos.'));
    listCustomItems(db, profileId).then(setCustom).catch(() => setError('No se pudo cargar tu equipo propio.'));
    if (envId) getInventory(db, envId).then(setInventory).catch(() => setError('No se pudo recargar tu equipamiento.'));
  }, [db, profileId, envId]));

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

  const openSheet = useCallback((id: string) => { if (envId) router.push(`/equipment/${id}?env=${envId}` as never); }, [envId]);

  const toggleGroup = useCallback((id: string) => setOpen((o) => ({ ...o, [id]: !o[id] })), []);

  async function addOwn() {
    try {
      const item = await addCustomItem(db, profileId, { name: newName, family: newFamily });
      setCustom((c) => [...c, item]);
      setNewName(''); setAdding(false); setOpen((o) => ({ ...o, [item.family]: true })); setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith('Ya tienes') ? e.message : 'Revisa el nombre (1 a 60 caracteres).');
    }
  }

  const removeOwn = useCallback(async (id: string) => {
    try {
      await deleteCustomItem(db, profileId, id);
      setCustom((c) => c.filter((i) => i.id !== id));
      setInventory((v) => { const c = { ...v }; delete c[id]; return c; });
      setError(null);
    } catch { setError('No se pudo eliminar el equipo.'); }
  }, [db, profileId]);

  async function noEquipment() {
    if (!envId) return;
    try { await markNoEquipment(db, envId); setInventory(await getInventory(db, envId)); setError(null); } catch { setError('No se pudo guardar el cambio.'); }
  }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const searching = query.trim() !== '';
    for (const f of FAMILIES) {
      const found = searchCatalog(query, f.id, onlyFavs ? items.filter((i) => favs.has(i.id)) : items);
      if (!found.length) continue;
      const expanded = searching || onlyFavs || !!open[f.id]; // al buscar o filtrar se despliegan los grupos con resultados
      const all = items.filter((i) => i.family === f.id);
      const marked = all.reduce((n, i) => n + (inventory[i.id] ? 1 : 0), 0);
      out.push({ key: `g_${f.id}`, group: { id: f.id, label: f.label, marked, total: all.length, expanded } });
      if (expanded) for (const item of found) out.push({ key: item.id, item });
    }
    return out;
  }, [query, open, inventory, items, onlyFavs, favs]);

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
      <View style={{ flexDirection: 'row' }}><Chip label="Solo favoritos" selected={onlyFavs} onPress={() => setOnlyFavs((v) => !v)} /></View>
      <Text variant="caption" muted>✓ Tengo · ✕ No tengo · sin marcar = sin indicar</Text>
      <Text variant="caption" muted accessibilityLiveRegion="polite">
        {counts.yes} disponibles · {counts.no} no disponibles · {items.length - counts.yes - counts.no} sin indicar
      </Text>
      <Button variant="secondary" label="No tengo equipamiento" onPress={noEquipment} disabled={!envId} />
      <Button variant="ghost" label="Exportar o importar copia" onPress={() => router.push('/equipment-data' as never)} />
      <Button variant="secondary" label={adding ? 'Cancelar' : 'Añadir equipo propio'} onPress={() => setAdding((a) => !a)} />
      {adding ? (
        <Card style={{ gap: space.md }}>
          <Field label="Nombre del equipo" value={newName} onChangeText={setNewName} maxLength={60} placeholder="Ej.: Anillas de madera" />
          <Text variant="caption" muted>Grupo</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {FAMILIES.map((f) => <Chip key={f.id} label={f.label} selected={f.id === newFamily} onPress={() => setNewFamily(f.id)} />)}
          </ScrollView>
          <Button label="Guardar equipo" onPress={addOwn} disabled={newName.trim() === ''} />
        </Card>
      ) : null}
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
          <ItemRow item={r.item} state={inventory[r.item.id]} onSet={set} onDelete={r.item.id.startsWith(CUSTOM_PREFIX) ? removeOwn : undefined} onOpen={openSheet} />
        )}
      />
      <View style={{ flexDirection: 'row', gap: space.sm, paddingTop: space.md }}>
        <View style={{ flex: 1 }}><Button variant="secondary" label="Guardar y salir" onPress={onExit} /></View>
        <View style={{ flex: 1 }}><Button label="Continuar" icon="arrow-forward" onPress={onNext} /></View>
      </View>
    </Screen>
  );
}
