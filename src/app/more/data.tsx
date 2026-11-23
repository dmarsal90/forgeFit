import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { importSessionsCsv, previewSessionsCsv, type ImportPreview } from '../../db/importSessions';
import { useApp } from '../../features/AppContext';
import { MAX_IMPORT_CHARS } from '../../lib/csvImport';
import { Button, Card, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function DataScreen() {
  const { db, profile } = useApp();
  const [file, setFile] = useState<{ name: string; text: string; preview: ImportPreview } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function pick() {
    if (!profile) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain'], copyToCacheDirectory: true });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      // El tamaño se mira antes de leer para no cargar en memoria un archivo enorme; el recuento exacto lo hace la importación.
      if ((asset.size ?? 0) > MAX_IMPORT_CHARS * 4) { setFile(null); setMsg({ ok: false, text: 'El archivo es demasiado grande.' }); return; }
      const text = await new File(asset.uri).text();
      const r = await previewSessionsCsv(db, profile.id, text);
      if (!r.ok) { setFile(null); setMsg({ ok: false, text: r.error }); return; }
      setMsg(null);
      setFile({ name: asset.name, text, preview: r.preview });
    } catch { setFile(null); setMsg({ ok: false, text: 'No se pudo leer el archivo.' }); }
  }

  async function confirm() {
    if (!profile || !file) return;
    const r = await importSessionsCsv(db, profile.id, file.text);
    setFile(null);
    setMsg(r.ok ? { ok: true, text: `Importadas ${plural(r.preview.sessions, 'sesión', 'sesiones')} (${plural(r.preview.sets, 'serie', 'series')}).` } : { ok: false, text: r.error });
  }

  const p = file?.preview;
  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text muted>← Volver</Text>
      </Pressable>
      <Text variant="title">Datos</Text>
      <Text muted>Importa un historial desde un CSV exportado por ForgeFit. Se añade a este perfil como sesiones terminadas; no cambia tu plan ni tu calendario.</Text>
      <Button label="Elegir archivo CSV" icon="folder-open-outline" variant="secondary" disabled={!profile} onPress={pick} />
      {p && file ? (
        <Card style={{ gap: space.xs }}>
          <Text variant="subtitle">{file.name}</Text>
          <Text>{plural(p.sessions, 'sesión nueva', 'sesiones nuevas')} con {plural(p.sets, 'serie', 'series')}.</Text>
          {p.duplicates ? <Text muted>{plural(p.duplicates, 'sesión ya existe y se omite', 'sesiones ya existen y se omiten')}.</Text> : null}
          {p.ignoredRows ? <Text muted>{plural(p.ignoredRows, 'fila se ignora', 'filas se ignoran')}.</Text> : null}
          {p.unknown.length ? <Text muted>Ejercicios no reconocidos: {p.unknown.slice(0, 5).join('; ')}{p.unknown.length > 5 ? `… (+${p.unknown.length - 5})` : ''}.</Text> : null}
          {p.issues.map((i) => <Text key={i} variant="caption" muted>{i}</Text>)}
          <Button label={p.sessions ? `Importar ${plural(p.sessions, 'sesión', 'sesiones')}` : 'No hay nada nuevo que importar'} disabled={!p.sessions} onPress={confirm} />
          <Button label="Cancelar" variant="secondary" onPress={() => setFile(null)} />
        </Card>
      ) : null}
      {msg ? <Text style={msg.ok ? undefined : { color: colors.error }} accessibilityLiveRegion="polite">{msg.text}</Text> : null}
    </Screen>
  );
}
