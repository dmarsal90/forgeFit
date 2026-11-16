import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../ui/tokens';

type Icon = keyof typeof Ionicons.glyphMap;
const tabs: { name: string; title: string; icon: Icon }[] = [
  { name: 'index', title: 'Inicio', icon: 'home' },
  { name: 'routines', title: 'Rutinas', icon: 'calendar-outline' },
  { name: 'exercises', title: 'Ejercicios', icon: 'barbell-outline' },
  { name: 'progress', title: 'Progreso', icon: 'stats-chart-outline' },
  { name: 'more', title: 'Más', icon: 'ellipsis-horizontal' },
];

export default function TabsLayout() {
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border, height: 60 + bottom, paddingBottom: bottom + 6, paddingTop: 6 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.title, tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} size={size} color={color as string} /> }} />
      ))}
    </Tabs>
  );
}
