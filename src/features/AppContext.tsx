import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Db, openDb } from '../db';
import { getActiveProfile, Profile } from '../db/profiles';

type Ctx = { db: Db; profile: Profile | null; setProfile: (p: Profile | null) => void };
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    openDb()
      .then(async (d) => { setProfile(await getActiveProfile(d)); setDb(d); })
      .catch(setError);
  }, []);

  const set = useCallback((p: Profile | null) => setProfile(p), []);
  const value = useMemo(() => (db ? { db, profile, setProfile: set } : null), [db, profile, set]);
  if (error) throw error; // lo captura el ErrorBoundary de expo-router
  if (!value) return <>{fallback}</>;
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp fuera de AppProvider');
  return c;
}
