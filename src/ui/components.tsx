import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  Pressable, ScrollView, StyleProp, StyleSheet, Text as RNText, TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, MIN_TOUCH, radius, space, type } from './tokens';

export function Text({ variant = 'body', muted, style, ...props }: React.ComponentProps<typeof RNText> & {
  variant?: keyof typeof type; muted?: boolean;
}) {
  return <RNText {...props} style={[type[variant], { color: muted ? colors.textMuted : colors.text, fontVariant: ['tabular-nums'] }, style]} />;
}

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.lg };
  if (!scroll) return <View style={[s.screen, pad, style]}>{children}</View>;
  return (
    <ScrollView style={s.screen} contentContainerStyle={[pad, { flexGrow: 1, gap: space.lg }, style]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Button({ label, onPress, variant = 'primary', disabled, icon }: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const fg = disabled ? colors.onDisabled : variant === 'primary' ? colors.onAccent : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        variant === 'primary' && { backgroundColor: pressed ? colors.accentPressed : colors.accent },
        variant === 'secondary' && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
        disabled && { backgroundColor: colors.disabled, borderWidth: 0 },
      ]}
    >
      <Text variant="subtitle" style={{ color: fg }}>{label}</Text>
      {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

/** Selección con acento + check; el estado nunca se comunica solo con color. */
export function Choice({ label, hint, selected, onPress, multi }: { label: string; hint?: string; selected: boolean; onPress: () => void; multi?: boolean }) {
  return (
    <Pressable
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? { checked: selected } : { selected }}
      onPress={onPress}
      style={[s.card, s.choice, selected && { borderColor: colors.accent, borderWidth: 1.5 }]}
    >
      <View style={{ flex: 1 }}>
        <Text variant="subtitle">{label}</Text>
        {hint ? <Text variant="caption" muted>{hint}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={24} color={colors.accent} /> : null}
    </Pressable>
  );
}

export function Field({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="caption" muted>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        {...props}
        style={[s.input, error ? { borderColor: colors.error } : null]}
      />
      {error ? <Text variant="caption" style={{ color: colors.error }} accessibilityLiveRegion="polite">{error}</Text>
        : hint ? <Text variant="caption" muted>{hint}</Text> : null}
    </View>
  );
}

export function EmptyState({ icon, title, body, children }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; body: string; children?: ReactNode;
}) {
  return (
    <Card style={{ alignItems: 'center', gap: space.md, padding: space.xl }}>
      <Ionicons name={icon} size={36} color={colors.accent} accessibilityElementsHidden />
      <Text variant="title" style={{ textAlign: 'center' }}>{title}</Text>
      <Text muted style={{ textAlign: 'center' }}>{body}</Text>
      {children}
    </Card>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  button: {
    minHeight: MIN_TOUCH + 4, borderRadius: radius.button, paddingHorizontal: space.xl,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  choice: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH, gap: space.md },
  input: {
    minHeight: MIN_TOUCH, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.button, paddingHorizontal: space.lg, color: colors.text, ...type.body,
  },
});
