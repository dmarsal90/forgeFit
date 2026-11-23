import { router } from 'expo-router';
import { useState } from 'react';
import { exportSessionsCsv } from '../../db/stats';
import { useApp } from '../../features/AppContext';
import { toDateKey } from '../../lib/schedule';
import { shareTextFile } from '../../lib/shareFile';
import { Button, Screen, Text } from '../../ui/components';
import { colors } from '../../ui/tokens';

export default function MoreScreen() {
  const { db, profile } = useApp();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function exportSessions() {
    if (!profile) return;
    try {
      const csv = await exportSessionsCsv(db, profile.id);
      if (csv.split('\n').length <= 2) { setMsg({ ok: false, text: 'Aún no hay sesiones terminadas que exportar.' }); return; }
      const shared = await shareTextFile(`forgefit-sesiones-${toDateKey()}.csv`, csv, 'text/csv', 'Sesiones de ForgeFit');
      setMsg(shared ? null : { ok: false, text: 'Este dispositivo no puede compartir archivos.' });
    } catch { setMsg({ ok: false, text: 'No se pudieron exportar las sesiones.' }); }
  }

  return (
    <Screen tab>
      <Text variant="title">Más</Text>
      <Button label="Perfiles" icon="people-outline" variant="secondary" onPress={() => router.push('/profiles')} />
      <Button label="Historial del plan" icon="time-outline" variant="secondary" onPress={() => router.push('/plan/history')} />
      <Button label="Importar sesiones (CSV)" icon="push-outline" variant="secondary" onPress={() => router.push('/more/data')} />
      <Button label="Exportar sesiones (CSV)" icon="download-outline" variant="secondary" onPress={exportSessions} />
      {msg ? <Text style={msg.ok ? undefined : { color: colors.error }} accessibilityLiveRegion="polite">{msg.text}</Text> : null}
      <Text variant="caption" muted>Entornos, reloj y datos llegarán en fases posteriores.</Text>
    </Screen>
  );
}
