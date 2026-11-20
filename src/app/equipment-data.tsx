import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Pressable, Share } from 'react-native';
import { exportEquipment, importEquipment, MAX_BACKUP_CHARS } from '../db/equipmentBackup';
import { useApp } from '../features/AppContext';
import { toDateKey } from '../lib/schedule';
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

  async function shareFile() {
    try {
      if (!(await Sharing.isAvailableAsync())) { setMsg({ ok: false, text: 'Este dispositivo no puede compartir archivos. Usa «Exportar copia» (texto).' }); return; }
      const file = new File(Paths.cache, `forgefit-equipo-${toDateKey()}.json`);
      file.create({ overwrite: true });
      file.write(JSON.stringify(await exportEquipment(db, profile!.id), null, 1));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Copia del equipamiento de ForgeFit' });
      setMsg(null);
    } catch { setMsg({ ok: false, text: 'No se pudo exportar el archivo.' }); }
  }

  async function importFile() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      // El tamaño se mira antes de leer para no cargar en memoria un archivo enorme; el recuento exacto de caracteres lo hace importEquipment.
      if ((asset.size ?? 0) > MAX_BACKUP_CHARS * 4) { setMsg({ ok: false, text: 'El archivo es demasiado grande.' }); return; }
      await run(await new File(asset.uri).text());
    } catch { setMsg({ ok: false, text: 'No se pudo leer el archivo.' }); }
  }

  async function run(content = text) {
    const r = await importEquipment(db, profile!.id, content);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setText('');
    setMsg({ ok: true, text: `Importado. Marcas de equipo: ${r.items} · Fichas: ${r.attributes} · Favoritos: ${r.favorites} · Equipos propios nuevos: ${r.custom}.` });
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
        <Button label="Exportar archivo .json" icon="document-outline" onPress={shareFile} />
        <Button variant="secondary" label="Exportar copia" icon="share-outline" onPress={share} />
      </Card>
      <Card style={{ gap: 12 }}>
        <Text variant="subtitle">Importar</Text>
        <Button label="Importar archivo .json" icon="folder-open-outline" onPress={importFile} />
        <Text variant="caption" muted>O pega aquí una copia exportada. Se fusiona con lo que ya tienes: no se borra nada y importarla dos veces no duplica.</Text>
        <Field label="Texto de la copia" value={text} onChangeText={(t) => { setText(t); setMsg(null); }} multiline autoCorrect={false} autoCapitalize="none" style={{ minHeight: 120, textAlignVertical: 'top' }} />
        {msg ? <Text style={msg.ok ? undefined : { color: colors.error }} accessibilityLiveRegion="polite">{msg.text}</Text> : null}
        <Button variant="secondary" label="Importar copia" onPress={() => run()} disabled={text.trim() === ''} />
      </Card>
    </Screen>
  );
}
