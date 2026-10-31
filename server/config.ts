export interface LeagueConfig {
  id: string;
  slug: string;
  name: string;
  country: string;
  understat: string;
  accent: string;
}

export const LEAGUES: LeagueConfig[] = [
  {
    id: 'premier-league',
    slug: 'premier-league',
    name: 'Premier League',
    country: 'England',
    understat: 'EPL',
    accent: '#c9f75a',
  },
  {
    id: 'la-liga',
    slug: 'la-liga',
    name: 'La Liga',
    country: 'Spain',
    understat: 'La_liga',
    accent: '#ff8a5b',
  },
  {
    id: 'serie-a',
    slug: 'serie-a',
    name: 'Serie A',
    country: 'Italy',
    understat: 'Serie_A',
    accent: '#73b7ff',
  },
  {
    id: 'bundesliga',
    slug: 'bundesliga',
    name: 'Bundesliga',
    country: 'Germany',
    understat: 'Bundesliga',
    accent: '#ff6b81',
  },
  {
    id: 'ligue-1',
    slug: 'ligue-1',
    name: 'Ligue 1',
    country: 'France',
    understat: 'Ligue_1',
    accent: '#b79cff',
  },
];

export const SEASON_YEARS = [
  2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
];
export const DEFAULT_SEASON = 2026;
export const MODEL_VERSION = 'dc-xg-1.0';

export function getLeague(slug: string): LeagueConfig | undefined {
  return LEAGUES.find((l) => l.slug === slug || l.id === slug);
}

export function seasonLabel(year: number): string {
  return `${year}/${String(year + 1).slice(-2)}`;
}

export function seasonId(leagueSlug: string, year: number): string {
  return `${leagueSlug}-${year}`;
}
