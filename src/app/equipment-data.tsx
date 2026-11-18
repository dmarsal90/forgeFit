import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share } from 'react-native';
import { exportEquipment, importEquipment } from '../db/equipmentBackup';
import { useApp } from '../features/AppContext';
import { Button, Card, Field, Screen, Text } from '../ui/components';
import { colors } from '../ui/tokens';

export default function EquipmentData() {
  const { db, profile } = useApp();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!profile) return null;

  async function share() {
    try {
      await Share.share({ message: JSON.stringify(await exportEquipment(db, profile!.id), null, 1) });
      setMsg(null);
    } catch { setMsg({ ok: false, text: 'No se pudo exportar.' }); }
  }

  async function run() {
    const r = await importEquipment(db, profile!.id, text);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setText('');
    setMsg({ ok: true, text: `Importado: ${r.items} marcas de equipo, ${r.attributes} fichas, ${r.favorites} favoritos y ${r.custom} equipos propios nuevos.` });
  }

  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text muted>← Volver</Text>
      </Pressable>
      <Text variant="title">Copia del equipamiento</Text>
      <Card style={{ gap: 12 }}>
        <Text variant="subtitle">Exportar</Text>
        <Text variant="caption" muted>Comparte un texto JSON con tu equipamiento, fichas, favoritos y equipo propio. Guárdalo en tus notas o en tu nube.</Text>
        <Button label="Exportar copia" icon="share-outline" onPress={share} />
      </Card>
      <Card style={{ gap: 12 }}>
        <Text variant="subtitle">Importar</Text>
        <Text variant="caption" muted>Pega aquí una copia exportada. Se fusiona con lo que ya tienes: no se borra nada y importarla dos veces no duplica.</Text>
        <Field label="Texto de la copia" value={text} onChangeText={(t) => { setText(t); setMsg(null); }} multiline autoCorrect={false} autoCapitalize="none" style={{ minHeight: 120, textAlignVertical: 'top' }} />
        {msg ? <Text style={msg.ok ? undefined : { color: colors.error }} accessibilityLiveRegion="polite">{msg.text}</Text> : null}
        <Button label="Importar copia" onPress={run} disabled={text.trim() === ''} />
      </Card>
    </Screen>
  );
}
