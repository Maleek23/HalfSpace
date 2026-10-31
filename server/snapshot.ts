import type { LeagueAverages, Prediction } from './model.js';

export interface TeamRef {
  id: string;
  name: string;
  shortName: string;
}

export interface FormMatch {
  matchId: string;
  kickoff: string;
  opponent: TeamRef;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  xgFor: number;
  xgAgainst: number;
  outcome: 'W' | 'D' | 'L';
}

export interface TeamStatsView {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  xg: number;
  xga: number;
  xgd: number;
  xpts: number;
  ppda: number | null;
  oppda: number | null;
  deep: number;
  deepAllowed: number;
  goalsPerGame: number;
  xgPerGame: number;
  xgaPerGame: number;
}

export interface TeamRatingView {
  elo: number;
  attack: number;
  defence: number;
  power: number;
  xgDiff90: number;
  form: number;
  matches: number;
}

export interface MatchView {
  id: string;
  round: number;
  kickoff: string;
  status: 'played' | 'upcoming';
  home: TeamRef;
  away: TeamRef;
  score: { home: number; away: number } | null;
  xg: { home: number; away: number } | null;
  prediction: Prediction;
  result: {
    outcome: 'H' | 'D' | 'A';
    correct: boolean;
    logLoss: number;
    brier: number;
  } | null;
  forecast: { home: number; draw: number; away: number } | null;
}

export interface TeamView {
  id: string;
  name: string;
  shortName: string;
  rank: number;
  rating: TeamRatingView;
  stats: TeamStatsView;
  form: FormMatch[];
  results: MatchView[];
  upcoming: MatchView[];
  squadCount: number;
}

export interface TableRow {
  position: number;
  teamId: string;
  name: string;
  shortName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  xg: number;
  xga: number;
  xgDifference: number;
  xpts: number;
  ppda: number | null;
  power: number;
  elo: number;
  form: FormMatch[];
}

export interface PlayerPer90 {
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  xgxa: number;
  npxg: number;
  shots: number;
  keyPasses: number;
  xgChain: number;
  xgBuildup: number;
}

export interface PlayerPercentiles {
  attack: number;
  creation: number;
  progression: number;
  defence: number;
  finishing: number;
  minutes: number;
}

export interface PlayerView {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string;
  position: string;
  role: 'GK' | 'DEF' | 'MID' | 'FWD';
  games: number;
  minutes: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  npg: number;
  npxg: number;
  shots: number;
  keyPasses: number;
  xgChain: number;
  xgBuildup: number;
  yellow: number;
  red: number;
  per90: PlayerPer90;
  rating: number;
  confidence: number;
  percentiles: PlayerPercentiles;
  rank: number;
  goalOverperformance: number;
}

export interface InsightEvidence {
  label: string;
  value: string;
  note?: string;
}

export interface Insight {
  id: string;
  type: 'team' | 'player' | 'match' | 'league' | 'model';
  category: string;
  headline: string;
  body: string;
  evidence: InsightEvidence[];
  confidence: 'High' | 'Medium' | 'Low';
  teamIds: string[];
  playerId?: string;
  matchId?: string;
  score: number;
}

export interface SimulationOutcome {
  teamId: string;
  name: string;
  shortName: string;
  title: number;
  top4: number;
  relegation: number;
  avgPoints: number;
  positionCounts: number[];
}

export interface SimulationResult {
  completed: boolean;
  sims: number;
  outcomes: SimulationOutcome[];
}

export interface CalibrationBin {
  bin: number;
  predicted: number;
  observed: number;
  count: number;
}

export interface BacktestResult {
  matches: number;
  logLoss: number;
  brier: number;
  accuracy: number;
  baselineLogLoss: number;
  understatLogLoss: number | null;
  understatMatches: number;
  ece: number;
  calibration: CalibrationBin[];
  confusion: { home: number; draw: number; away: number };
  correct: number;
}

export interface LeagueView {
  id: string;
  slug: string;
  name: string;
  country: string;
  accent: string;
}

export interface SeasonView {
  id: string;
  year: number;
  label: string;
}

export interface Snapshot {
  league: LeagueView;
  season: SeasonView;
  updatedAt: string | null;
  averages: LeagueAverages;
  completed: boolean;
  table: TableRow[];
  teams: TeamView[];
  matches: MatchView[];
  players: PlayerView[];
  simulations: SimulationResult;
  backtest: BacktestResult | null;
  insights: Insight[];
  coverage: {
    teams: number;
    players: number;
    matches: number;
    played: number;
    remaining: number;
  };
}
