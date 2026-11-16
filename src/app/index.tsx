import { Redirect } from 'expo-router';
import { useApp } from '../features/AppContext';

export default function Index() {
  const { profile } = useApp();
  return <Redirect href={profile ? '/(tabs)' : '/welcome'} />;
}
