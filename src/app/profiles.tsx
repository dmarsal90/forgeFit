import { router } from 'expo-router';
import { Alert, View } from 'react-native';
import { exportProfileJson } from '../db/profileBackup';
import { archiveProfile, deleteProfile, listProfiles, Profile, setActiveProfile, setWeightUnit } from '../db/profiles';
import { useApp } from '../features/AppContext';
import { toDateKey } from '../lib/schedule';
import { shareTextFile } from '../lib/shareFile';
import { Button, Card, Choice, Screen, Text } from '../ui/components';
import { space } from '../ui/tokens';
import { useEffect, useState } from 'react';

export default function Profiles() {
  const { db, profile, refresh } = useApp();
  const [items, setItems] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => setItems(await listProfiles(db));
  useEffect(() => { listProfiles(db).then(setItems); }, [db, profile]);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    try {
      await action();
      await refresh();
      await reload();
      setError(null);
      after?.();
    } catch {
      setError('No se pudo completar la acción. Inténtalo de nuevo.');
    }
  }

  const select = (p: Profile) => run(() => setActiveProfile(db, p.id), () => router.replace('/(tabs)'));
  const archive = (p: Profile) =>
    Alert.alert(`Archivar a ${p.alias}`, 'Sus datos se conservan, pero dejará de aparecer en la lista.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Archivar', onPress: () => run(() => archiveProfile(db, p.id), () => router.replace('/')) },
    ]);
  const remove = (p: Profile) =>
    Alert.alert(`Eliminar a ${p.alias}`, 'Se borrarán para siempre todos sus datos. No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => run(() => deleteProfile(db, p.id), () => router.replace('/')) },
    ]);

  const exportFull = (p: Profile) =>
    Alert.alert(`Copia completa de ${p.alias}`, 'El archivo contiene sus datos personales, plan, entrenos y equipamiento, sin cifrar. Guárdalo en un lugar privado.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Exportar',
        onPress: async () => {
          try {
            const shared = await shareTextFile(`forgefit-perfil-${toDateKey()}.json`, await exportProfileJson(db, p.id), 'application/json', `Copia completa de ${p.alias}`);
            setError(shared ? null : 'Este dispositivo no puede compartir archivos.');
          } catch { setError('No se pudo exportar la copia.'); }
        },
      },
    ]);

  return (
    <Screen>
      <Text variant="title">¿Quién entrena?</Text>
      <Text muted>Cada perfil tiene sus propios datos, separados de los demás.</Text>
      <View style={{ gap: space.md }} accessibilityRole="radiogroup">
        {items.map((p) => (
          <View key={p.id} style={{ gap: space.xs }}>
            <Choice label={p.alias} selected={profile?.id === p.id} onPress={() => select(p)} />
            <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
              {(['kg', 'lb'] as const).map((u) => (
                <View key={u} style={{ flex: 1 }}>
                  <Choice label={`Peso en ${u}`} selected={p.weightUnit === u} onPress={() => run(() => setWeightUnit(db, p.id, u))} />
                </View>
              ))}
            </View>
            <Button variant="secondary" label="Exportar copia completa" icon="download-outline" onPress={() => exportFull(p)} />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}><Button variant="ghost" label="Archivar" onPress={() => archive(p)} /></View>
              <View style={{ flex: 1 }}><Button variant="ghost" label="Eliminar" onPress={() => remove(p)} /></View>
            </View>
          </View>
        ))}
      </View>
      {error ? <Card><Text style={{ color: '#FF8A80' }} accessibilityLiveRegion="polite">{error}</Text></Card> : null}
      <Button label="Añadir perfil" icon="add" variant="secondary" onPress={() => router.push('/onboarding/profile')} />
    </Screen>
  );
}
