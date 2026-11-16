import { Redirect } from 'expo-router';
import { useApp } from '../features/AppContext';

export default function Index() {
  const { profile, profileCount } = useApp();
  if (profile) return <Redirect href="/(tabs)" />;
  return <Redirect href={profileCount > 0 ? '/profiles' : '/welcome'} />;
}
