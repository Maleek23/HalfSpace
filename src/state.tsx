import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, type AsyncState } from './api';
import type { Bootstrap, League } from './types';

interface AppContextValue {
  bootstrap: Bootstrap | null;
  loading: boolean;
  error: string | null;
  league: string;
  season: number;
  leagueInfo: League | null;
  setLeague: (slug: string) => void;
  setSeason: (year: number) => void;
  refreshBootstrap: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);
const STORAGE_LEAGUE = 'halfspace.league';
const STORAGE_SEASON = 'halfspace.season';

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const value = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [league, setLeagueState] = useState(() => localStorage.getItem(STORAGE_LEAGUE) ?? 'premier-league');
  const [season, setSeasonState] = useState(() => Number(localStorage.getItem(STORAGE_SEASON)) || 2026);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiGet<Bootstrap>('/api/bootstrap')
      .then((data) => {
        if (!active) return;
        setBootstrap(data);
        setError(null);
        setLeagueState((current) =>
          data.leagues.some((item) => item.slug === current) ? current : (data.leagues[0]?.slug ?? 'premier-league'),
        );
        setSeasonState((current) => (data.seasons.includes(current) ? current : data.defaultSeason));
        setLoading(false);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tick]);

  const leagueInfo = useMemo(
    () => bootstrap?.leagues.find((item) => item.slug === league) ?? null,
    [bootstrap, league],
  );

  useEffect(() => {
    if (!leagueInfo) return;
    document.documentElement.style.setProperty('--accent', leagueInfo.accent);
    document.documentElement.style.setProperty('--accent-rgb', hexToRgb(leagueInfo.accent));
    document.documentElement.dataset.league = leagueInfo.slug;
  }, [leagueInfo]);

  const setLeague = useCallback((slug: string) => {
    setLeagueState(slug);
    localStorage.setItem(STORAGE_LEAGUE, slug);
  }, []);

  const setSeason = useCallback((year: number) => {
    setSeasonState(year);
    localStorage.setItem(STORAGE_SEASON, String(year));
  }, []);

  const refreshBootstrap = useCallback(() => setTick((value) => value + 1), []);

  const value: AppContextValue = {
    bootstrap,
    loading,
    error,
    league,
    season,
    leagueInfo,
    setLeague,
    setSeason,
    refreshBootstrap,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}

export function useLeaguePath(): string {
  const { league, season } = useApp();
  return `/api/leagues/${league}`;
}
