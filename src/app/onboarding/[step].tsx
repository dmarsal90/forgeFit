import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { getDrafts, grantConsent, hasConsent, revokeConsent, saveDraft } from '../../db/onboarding';
import { useApp } from '../../features/AppContext';
import { LAST_STEP, STEPS, StepValues, summarize, validateStep } from '../../lib/onboarding';
import { Button, Card, Choice, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

export default function OnboardingStep() {
  const { profile } = useApp();
  const n = Number(useLocalSearchParams<{ step: string }>().step);
  const valid = !!profile && (!!STEPS[n] || n === LAST_STEP);
  useEffect(() => { if (!valid) router.replace('/(tabs)'); }, [valid]);
  // key por etapa: al cambiar de etapa el estado del formulario se reinicia solo
  if (!valid) return null;
  return n === LAST_STEP ? <Review profileId={profile.id} /> : <Step key={n} n={n} profileId={profile.id} />;
}

function Step({ n, profileId }: { n: number; profileId: string }) {
  const { db } = useApp();
  const def = STEPS[n];
  const [values, setValues] = useState<StepValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [consent, setConsent] = useState(false);
  const [hadConsent, setHadConsent] = useState(false);

  useEffect(() => {
    getDrafts(db, profileId).then((d) => setValues((d[n] as StepValues) ?? {})).catch(() => {});
    if (def.consent) hasConsent(db, profileId, def.consent.kind).then((c) => { setConsent(c); setHadConsent(c); }).catch(() => {});
  }, [db, profileId, n, def.consent]);

  const leave = (to: number) => router.replace(to <= LAST_STEP ? `/onboarding/${to}` : '/(tabs)');

  function toggle(key: string, value: string | number, multi?: boolean) {
    setValues((v) => {
      if (!multi) return { ...v, [key]: v[key] === value ? undefined : value };
      const cur = Array.isArray(v[key]) ? (v[key] as (string | number)[]) : [];
      return { ...v, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] };
    });
  }

  async function save(next: number | 'exit') {
    const { data, errors: e } = validateStep(n, values);
    setErrors(e);
    if (!data) return;
    setSaving(true);
    try {
      await saveDraft(db, profileId, n, data);
      if (def.consent && consent !== hadConsent) {
        if (consent) await grantConsent(db, profileId, def.consent.kind, def.consent.version);
        else await revokeConsent(db, profileId, def.consent.kind);
        setHadConsent(consent);
      }
      if (next === 'exit') router.replace('/(tabs)'); else leave(next);
    } catch {
      setSaveError('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (n > 2 ? leave(n - 1) : router.replace('/(tabs)'))} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text muted>← Volver</Text>
      </Pressable>
      <Text variant="caption" muted>Etapa {n} de 8</Text>
      <Text variant="title">{def.title}</Text>
      <Text muted>{def.intro}</Text>

      {def.fields.map((f) => {
        const cur = values[f.key];
        return (
          <View key={f.key} style={{ gap: space.sm }} accessibilityRole={f.multi ? undefined : 'radiogroup'}>
            <Text variant="subtitle">{f.label}</Text>
            {f.options.map((o) => (
              <Choice
                key={o.value} label={o.label} multi={f.multi}
                selected={Array.isArray(cur) ? cur.includes(o.value) : cur === o.value}
                onPress={() => toggle(f.key, o.value, f.multi)}
              />
            ))}
            {errors[f.key] ? <Text variant="caption" style={{ color: colors.error }} accessibilityLiveRegion="polite">{errors[f.key]}</Text> : null}
          </View>
        );
      })}

      {def.consent ? (
        <Choice multi label={def.consent.label} hint={def.consent.hint} selected={consent} onPress={() => setConsent((c) => !c)} />
      ) : null}
      {saveError ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{saveError}</Text> : null}
      <Button label="Continuar" icon="arrow-forward" disabled={saving} onPress={() => save(n + 1)} />
      <Button variant="secondary" label="Guardar y salir" disabled={saving} onPress={() => save('exit')} />
      {def.fields.every((f) => f.optional) ? <Button variant="ghost" label="Omitir" onPress={() => leave(n + 1)} /> : null}
    </Screen>
  );
}

function Review({ profileId }: { profileId: string }) {
  const { db } = useApp();
  const [drafts, setDrafts] = useState<Record<number, unknown> | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => { getDrafts(db, profileId).then(setDrafts).catch(() => setLoadError(true)); }, [db, profileId]);

  const missing = [2, 4].filter((n) => drafts && !drafts[n]);
  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.replace('/onboarding/7')} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text muted>← Volver</Text>
      </Pressable>
      <Text variant="caption" muted>Etapa 8 de 8</Text>
      <Text variant="title">Revisión</Text>
      {loadError ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">No se pudo cargar tu progreso.</Text> : null}
      {drafts ? Object.keys(STEPS).map(Number).map((n) => {
        const lines = drafts[n] ? summarize(n, drafts[n] as StepValues) : [];
        return (
          <Card key={n} style={{ gap: space.xs }}>
            <Text variant="subtitle">{STEPS[n].title}</Text>
            {lines.length ? lines.map((l) => <Text key={l} muted>{l}</Text>) : <Text muted>{drafts[n] ? 'Sin datos indicados' : 'Pendiente'}</Text>}
            <Button variant="ghost" label={drafts[n] ? 'Editar' : 'Completar'} onPress={() => router.replace(`/onboarding/${n}`)} />
          </Card>
        );
      }) : null}
      {missing.length ? <Text accessibilityLiveRegion="polite">Para crear un plan faltan tus objetivos y tu disponibilidad.</Text> : null}
      <Text variant="caption" muted>Tu plan se generará cuando esa función esté disponible. Mientras, tus respuestas quedan guardadas en este dispositivo.</Text>
      <Button label="Guardar y salir" onPress={() => router.replace('/(tabs)')} />
    </Screen>
  );
}
