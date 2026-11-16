import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { getDrafts, saveDraft } from '../../db/onboarding';
import { useApp } from '../../features/AppContext';
import { LAST_STEP, STEPS, StepValues, validateStep } from '../../lib/onboarding';
import { Button, Choice, Screen, Text } from '../../ui/components';
import { colors, space } from '../../ui/tokens';

export default function OnboardingStep() {
  const { profile } = useApp();
  const n = Number(useLocalSearchParams<{ step: string }>().step);
  const valid = !!profile && !!STEPS[n];
  useEffect(() => { if (!valid) router.replace('/(tabs)'); }, [valid]);
  // key por etapa: al cambiar de etapa el estado del formulario se reinicia solo
  return valid ? <Step key={n} n={n} profileId={profile.id} /> : null;
}

function Step({ n, profileId }: { n: number; profileId: string }) {
  const { db } = useApp();
  const def = STEPS[n];
  const [values, setValues] = useState<StepValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDrafts(db, profileId).then((d) => setValues((d[n] as StepValues) ?? {})).catch(() => {});
  }, [db, profileId, n]);

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

      {saveError ? <Text style={{ color: colors.error }} accessibilityLiveRegion="polite">{saveError}</Text> : null}
      <Button label="Continuar" icon="arrow-forward" disabled={saving} onPress={() => save(n + 1)} />
      <Button variant="secondary" label="Guardar y salir" disabled={saving} onPress={() => save('exit')} />
    </Screen>
  );
}
