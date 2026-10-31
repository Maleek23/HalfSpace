export interface League {
  slug: string;
  name: string;
  country: string;
  accent: string;
}

export interface Season {
  id: string;
  year: number;
  label: string;
}

export interface Bootstrap {
  leagues: League[];
  seasons: number[];
  defaultSeason: number;
  modelVersion: string;
  formations: Array<{ name: string; label: string }>;
  coverage: Array<{
    league: string;
    name: string;
    year: number | null;
    label: string | null;
    matches: number;
    played: number;
    teams: number;
    players: number;
  }>;
  lastSync: string | null;
}

export interface TeamRef {
  id: string;
  name: string;
  shortName: string;
}

export interface Scoreline {
  home: number;
  away: number;
  probability: number;
}

export interface Prediction {
  homeWin: number;
  draw: number;
  awayWin: number;
  homeXg: number;
  awayXg: number;
  btts: number;
  over15: number;
  over25: number;
  over35: number;
  under25: number;
  homeCleanSheet: number;
  awayCleanSheet: number;
  topScorelines: Scoreline[];
  matrix?: number[][];
  confidence: number;
  confidenceLabel: 'High' | 'Medium' | 'Low';
  eloHome: number;
  eloAway: number;
  eloHomeWin: number;
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

export interface TeamStats {
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

export interface TeamRating {
  elo: number;
  attack: number;
  defence: number;
  power: number;
  xgDiff90: number;
  form: number;
  matches: number;
}

export interface Match {
  id: string;
  round: number;
  kickoff: string;
  status: 'played' | 'upcoming';
  home: TeamRef;
  away: TeamRef;
  score: { home: number; away: number } | null;
  xg: { home: number; away: number } | null;
  prediction: Prediction;
  result: { outcome: 'H' | 'D' | 'A'; correct: boolean; logLoss: number; brier: number } | null;
  forecast: { home: number; draw: number; away: number } | null;
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

export interface TeamSummary {
  id: string;
  name: string;
  shortName: string;
  rank: number;
  rating: TeamRating;
  stats: TeamStats;
  form: FormMatch[];
}

export interface Team extends TeamSummary {
  results: Match[];
  upcoming: Match[];
  squadCount: number;
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

export interface Player {
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

export interface Simulation {
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

export interface Backtest {
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

export interface Coverage {
  teams: number;
  players: number;
  matches: number;
  played: number;
  remaining: number;
}

export interface LeagueAverages {
  homeXg: number;
  awayXg: number;
  homeGoals: number;
  awayGoals: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  goalsPerMatch: number;
}

export interface Overview {
  league: League;
  season: Season;
  updatedAt: string | null;
  completed: boolean;
  averages: LeagueAverages;
  table: TableRow[];
  teams: TeamSummary[];
  upcoming: Match[];
  results: Match[];
  simulations: Simulation;
  backtest: Backtest | null;
  insights: Insight[];
  coverage: Coverage;
  topPlayers: Player[];
}

export interface MatchesResponse {
  league: League;
  season: Season;
  matches: Match[];
  counts: { all: number; upcoming: number; results: number };
}

export interface MatchDetail {
  league: League;
  season: Season;
  match: Match;
  lineups: { home: Lineup; away: Lineup };
  teams: { home: Team; away: Team };
  h2h: Array<{
    id: string;
    kickoff: string;
    season: string;
    home: TeamRef;
    away: TeamRef;
    homeGoals: number;
    awayGoals: number;
  }>;
  insights: Insight[];
  formations: Array<{ name: string; label: string }>;
}

export interface LineupPlayer {
  slot: string;
  label: string;
  x: number;
  y: number;
  group: 'GK' | 'DEF' | 'MID' | 'FWD';
  roleFit: number;
  fit: 'natural' | 'adapted' | 'out';
  player: Player;
}

export interface Lineup {
  team: TeamRef;
  formation: string;
  formationLabel: string;
  recommendedFormation: string;
  formationScores: Array<{
    name: string;
    label: string;
    fit: number;
    score: number;
    recommended: boolean;
  }>;
  xi: LineupPlayer[];
  bench: Player[];
  available: number;
  complete: boolean;
  missing: number;
  notes: string;
}

export interface LineupResponse extends Lineup {
  league: League;
  season: Season;
  formations: Array<{ name: string; label: string }>;
}

export type TacticAxisKey = 'press' | 'territory' | 'buildup' | 'chanceQuality' | 'control' | 'finishing';

export interface TacticsTeam {
  team: TeamRef;
  rank: number;
  played: number;
  points: number;
  xg: number;
  xga: number;
  xgd: number;
  ppda: number | null;
  deepPerGame: number;
  deepAllowedPerGame: number;
  shots: number;
  xgPerShot: number;
  buildupShare: number;
  finishingSignal: number;
  controlPerGame: number;
  style: Record<TacticAxisKey, number>;
  archetype: {
    key: string;
    label: string;
    description: string;
  };
}

export interface TacticsResponse {
  league: League;
  season: Season;
  updatedAt: string | null;
  axes: Array<{ key: TacticAxisKey; label: string; note: string }>;
  teams: TacticsTeam[];
}

export interface TeamDetail {
  league: League;
  season: Season;
  team: Team;
  squad: Player[];
  lineup: Lineup;
  insights: Insight[];
  formations: Array<{ name: string; label: string }>;
}

export interface RatingsResponse {
  league: League;
  season: Season;
  updatedAt: string | null;
  table: TableRow[];
  simulations: Simulation;
  backtest: Backtest | null;
  averages: LeagueAverages;
  coverage: Coverage;
}

export interface PlayersResponse {
  league: League;
  season: Season;
  players: Player[];
  total: number;
  sort: string;
}

export interface PlayerDetail {
  league: League;
  season: Season;
  player: Player;
  peers: Player[];
  team: Team | null;
}

export interface InsightsResponse {
  league: League;
  season: Season;
  insights: Insight[];
  counts: Record<string, number>;
}

export interface ModelResponse {
  league: League;
  season: Season;
  modelVersion: string;
  backtest: Backtest | null;
  averages: LeagueAverages;
  coverage: Coverage;
  completed: boolean;
  simulations: Simulation;
  updatedAt: string | null;
}

export interface DataStatus {
  modelVersion: string;
  lastSync: string | null;
  coverage: Array<{
    league: string;
    leagueName: string;
    year: number;
    label: string;
    matches: number;
    played: number;
    teams: number;
    players: number;
    syncedAt: string | null;
  }>;
  sources: Array<{
    name: string;
    role: string;
    provides: string;
    url: string;
    license: string;
    freshness: string;
  }>;
}
