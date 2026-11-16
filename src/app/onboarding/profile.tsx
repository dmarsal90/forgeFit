import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { createProfile } from '../../db/profiles';
import { useApp } from '../../features/AppContext';
import { profileInputSchema } from '../../lib/profile';
import { Button, Card, Choice, Field, Screen, Text } from '../../ui/components';
import { space } from '../../ui/tokens';

type Model = 'male' | 'female' | undefined;

export default function CreateProfile() {
  const { db, setProfile } = useApp();
  const [alias, setAlias] = useState('');
  const [model, setModel] = useState<Model>(undefined);
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const parsed = profileInputSchema.safeParse({ alias, anatomicalModel: model, age, heightCm: height });
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
      setErrors(e);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      setProfile(await createProfile(db, parsed.data));
      router.replace('/(tabs)');
    } catch {
      setSaveError('No se pudo guardar el perfil. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={12} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text muted>← Volver</Text>
      </Pressable>
      <Text variant="title">Crea tu perfil</Text>
      <Text muted>Solo el nombre es necesario. Todo lo demás es opcional y puedes cambiarlo después.</Text>

      <Field label="Nombre o alias" value={alias} onChangeText={setAlias} error={errors.alias} autoCapitalize="words" maxLength={40} />

      <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
        <Text variant="subtitle">Modelo de visualización 3D (opcional)</Text>
        <Choice label="Masculino" selected={model === 'male'} onPress={() => setModel('male')} />
        <Choice label="Femenino" selected={model === 'female'} onPress={() => setModel('female')} />
        {model ? <Button variant="ghost" label="Quitar selección" onPress={() => setModel(undefined)} /> : null}
        <Text variant="caption" muted>Es solo la figura que verás en pantalla. No afecta a tu rutina ni a tus capacidades.</Text>
      </View>

      <Field label="Edad (opcional)" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} error={errors.age} />
      <Field label="Estatura en cm (opcional)" value={height} onChangeText={setHeight} keyboardType="number-pad" maxLength={3} error={errors.heightCm} />

      <Card><Text variant="caption" muted>Tus datos se guardan solo en este dispositivo.</Text></Card>
      {saveError ? <Text style={{ color: '#FF8A80' }} accessibilityLiveRegion="polite">{saveError}</Text> : null}
      <Button label="Continuar" icon="arrow-forward" disabled={saving} onPress={submit} />
    </Screen>
  );
}
