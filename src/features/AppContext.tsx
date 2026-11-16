import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Db, openDb } from '../db';
import { countProfiles, getActiveProfile, Profile } from '../db/profiles';

type Ctx = { db: Db; profile: Profile | null; profileCount: number; refresh: () => Promise<void> };
type State = { profile: Profile | null; profileCount: number };
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  const [state, setState] = useState<State>({ profile: null, profileCount: 0 });
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async (d: Db) => {
    setState({ profile: await getActiveProfile(d), profileCount: await countProfiles(d) });
  }, []);

  useEffect(() => {
    openDb().then(async (d) => { await load(d); setDb(d); }).catch(setError);
  }, [load]);

  const value = useMemo(
    () => (db ? { db, ...state, refresh: () => load(db) } : null),
    [db, state, load],
  );
  if (error) throw error; // lo captura el ErrorBoundary de expo-router
  if (!value) return <>{fallback}</>;
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp fuera de AppProvider');
  return c;
}
