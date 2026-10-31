import { all, get, run, setMeta } from './db.js';
import { MODEL_VERSION, getLeague, seasonId, seasonLabel, type LeagueConfig } from './config.js';
import {
  computeLeagueAverages,
  computeRatings,
  predictMatch,
  expectedGoals,
  type LeagueAverages,
  type MatchInput,
  type Prediction,
  type TeamRating,
} from './model.js';
import type {
  BacktestResult,
  FormMatch,
  Insight,
  MatchView,
  PlayerPercentiles,
  PlayerView,
  SimulationOutcome,
  SimulationResult,
  Snapshot,
  TableRow,
  TeamRef,
  TeamStatsView,
  TeamView,
} from './snapshot.js';
import { buildInsights } from './insights.js';

interface TeamRow {
  id: string;
  name: string;
  short_name: string;
}

interface TeamSeasonRow {
  team_id: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  xg: number;
  xga: number;
  npxg: number;
  npxga: number;
  xpts: number;
  ppda: number | null;
  oppda: number | null;
  deep: number;
  deep_allowed: number;
}

interface PlayerRow {
  player_id: string;
  name: string;
  team_id: string | null;
  position: string;
  games: number;
  minutes: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  npg: number;
  npxg: number;
  shots: number;
  key_passes: number;
  xg_chain: number;
  xg_buildup: number;
  yellow: number;
  red: number;
}

interface MatchRow {
  id: string;
  season_id: string;
  round: number;
  kickoff: string;
  home_id: string;
  away_id: string;
  home_goals: number | null;
  away_goals: number | null;
  home_xg: number | null;
  away_xg: number | null;
  is_result: number;
  forecast_h: number | null;
  forecast_d: number | null;
  forecast_a: number | null;
}

const snapshotCache = new Map<string, Snapshot>();
const ratingCache = new Map<string, Map<string, TeamRating>>();
const averageCache = new Map<string, LeagueAverages>();

export function invalidateSnapshots(): void {
  snapshotCache.clear();
  ratingCache.clear();
  averageCache.clear();
}

export function getSnapshot(slug: string, year: number): Snapshot {
  const key = `${slug}:${year}`;
  const cached = snapshotCache.get(key);
  if (cached) return cached;
  const snapshot = buildSnapshot(slug, year);
  if (snapshotCache.size > 8) {
    const oldest = snapshotCache.keys().next().value;
    if (oldest) snapshotCache.delete(oldest);
  }
  snapshotCache.set(key, snapshot);
  return snapshot;
}

function loadMatches(sid: string): MatchInput[] {
  return all<MatchRow>('SELECT * FROM matches WHERE season_id = ? ORDER BY kickoff, id', [sid]).map((row) => ({
    id: row.id,
    seasonId: row.season_id,
    round: row.round,
    kickoff: row.kickoff,
    homeId: row.home_id,
    awayId: row.away_id,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    homeXg: row.home_xg,
    awayXg: row.away_xg,
    isResult: row.is_result === 1,
    forecastH: row.forecast_h,
    forecastD: row.forecast_d,
    forecastA: row.forecast_a,
  }));
}

function seasonExists(slug: string, year: number): boolean {
  return Boolean(get('SELECT 1 AS ok FROM seasons WHERE id = ?', [seasonId(slug, year)]));
}

function ratingsForSeason(league: LeagueConfig, year: number): Map<string, TeamRating> {
  const key = `${league.slug}:${year}`;
  const cached = ratingCache.get(key);
  if (cached) return cached;
  if (!seasonExists(league.slug, year)) {
    const empty = new Map<string, TeamRating>();
    ratingCache.set(key, empty);
    return empty;
  }
  const prior = year > 2024 ? ratingsForSeason(league, year - 1) : undefined;
  const matches = loadMatches(seasonId(league.slug, year));
  const ratings = computeRatings(matches, prior);
  ratingCache.set(key, ratings);
  return ratings;
}

function averagesForSeason(league: LeagueConfig, year: number): LeagueAverages {
  const key = `${league.slug}:${year}`;
  const cached = averageCache.get(key);
  if (cached) return cached;
  if (!seasonExists(league.slug, year)) {
    const fallback = computeLeagueAverages([]);
    averageCache.set(key, fallback);
    return fallback;
  }
  const averages = computeLeagueAverages(loadMatches(seasonId(league.slug, year)));
  averageCache.set(key, averages);
  return averages;
}

function defaultRating(teamId: string, prior?: Map<string, TeamRating>): TeamRating {
  const existing = prior?.get(teamId);
  if (existing) return { ...existing, matches: 0, pointsPerGame: 0, form: 0 };
  return {
    teamId,
    elo: 1500,
    attack: 1,
    defence: 1,
    power: 50,
    xgDiff90: 0,
    form: 0,
    matches: 0,
    pointsPerGame: 0,
    priorElo: 1500,
  };
}

function outcomeOf(home: number, away: number): 'H' | 'D' | 'A' {
  return home > away ? 'H' : home === away ? 'D' : 'A';
}

function evaluate(prediction: Prediction, home: number, away: number) {
  const outcome = outcomeOf(home, away);
  const index = outcome === 'H' ? 0 : outcome === 'D' ? 1 : 2;
  const probs = [prediction.homeWin, prediction.draw, prediction.awayWin];
  const p = Math.max(1e-9, probs[index]);
  return {
    outcome,
    correct: probs.indexOf(Math.max(...probs)) === index,
    logLoss: -Math.log(p),
    brier: probs.reduce((sum, prob, i) => sum + (prob - (i === index ? 1 : 0)) ** 2, 0),
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samplePoisson(lambda: number, random: () => number): number {
  const limit = Math.exp(-Math.max(0.02, lambda));
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= random();
  } while (p > limit && k < 15);
  return k - 1;
}

function simulateSeason(
  teams: Array<{ id: string; name: string; shortName: string }>,
  table: TableRow[],
  ratings: Map<string, TeamRating>,
  averages: LeagueAverages,
  remaining: MatchInput[],
  completed: boolean,
): SimulationResult {
  if (completed || remaining.length === 0) {
    return { completed: true, sims: 0, outcomes: [] };
  }
  const sims = 3000;
  const random = mulberry32(20262027);
  const base = new Map(
    table.map((row) => [row.teamId, { points: row.points, gf: row.goalsFor, ga: row.goalsAgainst }]),
  );
  const outcomeMap = new Map<string, SimulationOutcome>();
  for (const team of teams) {
    outcomeMap.set(team.id, {
      teamId: team.id,
      name: team.name,
      shortName: team.shortName,
      title: 0,
      top4: 0,
      relegation: 0,
      avgPoints: 0,
      positionCounts: new Array(teams.length).fill(0),
    });
  }

  const points = new Map<string, number>();
  const gf = new Map<string, number>();
  const ga = new Map<string, number>();
  const positions = new Map<string, number>();

  for (let sim = 0; sim < sims; sim += 1) {
    for (const team of teams) {
      const current = base.get(team.id) ?? { points: 0, gf: 0, ga: 0 };
      points.set(team.id, current.points);
      gf.set(team.id, current.gf);
      ga.set(team.id, current.ga);
    }
    for (const match of remaining) {
      const home = ratings.get(match.homeId) ?? defaultRating(match.homeId);
      const away = ratings.get(match.awayId) ?? defaultRating(match.awayId);
      const { lambda, mu } = expectedGoals(home, away, averages);
      const hg = samplePoisson(lambda, random);
      const ag = samplePoisson(mu, random);
      gf.set(match.homeId, (gf.get(match.homeId) ?? 0) + hg);
      ga.set(match.homeId, (ga.get(match.homeId) ?? 0) + ag);
      gf.set(match.awayId, (gf.get(match.awayId) ?? 0) + ag);
      ga.set(match.awayId, (ga.get(match.awayId) ?? 0) + hg);
      if (hg > ag) points.set(match.homeId, (points.get(match.homeId) ?? 0) + 3);
      else if (hg === ag) {
        points.set(match.homeId, (points.get(match.homeId) ?? 0) + 1);
        points.set(match.awayId, (points.get(match.awayId) ?? 0) + 1);
      } else points.set(match.awayId, (points.get(match.awayId) ?? 0) + 3);
    }
    const ranked = [...teams].sort((a, b) => {
      const pa = points.get(a.id) ?? 0;
      const pb = points.get(b.id) ?? 0;
      if (pb !== pa) return pb - pa;
      const gda = (gf.get(a.id) ?? 0) - (ga.get(a.id) ?? 0);
      const gdb = (gf.get(b.id) ?? 0) - (ga.get(b.id) ?? 0);
      if (gdb !== gda) return gdb - gda;
      if ((gf.get(b.id) ?? 0) !== (gf.get(a.id) ?? 0)) return (gf.get(b.id) ?? 0) - (gf.get(a.id) ?? 0);
      return a.name.localeCompare(b.name);
    });
    ranked.forEach((team, index) => {
      positions.set(team.id, index + 1);
      const record = outcomeMap.get(team.id)!;
      record.positionCounts[index] += 1;
      record.avgPoints += points.get(team.id) ?? 0;
    });
    const champion = ranked[0];
    const top4 = ranked.slice(0, 4);
    const bottom3 = ranked.slice(-3);
    if (champion) outcomeMap.get(champion.id)!.title += 1;
    for (const team of top4) outcomeMap.get(team.id)!.top4 += 1;
    for (const team of bottom3) outcomeMap.get(team.id)!.relegation += 1;
  }

  const outcomes = [...outcomeMap.values()]
    .map((record) => ({
      ...record,
      title: record.title / sims,
      top4: record.top4 / sims,
      relegation: record.relegation / sims,
      avgPoints: record.avgPoints / sims,
    }))
    .sort((a, b) => b.title - a.title || b.top4 - a.top4);

  return { completed: false, sims, outcomes };
}

function calibrationFor(
  entries: Array<{ prediction: Prediction; outcome: 'H' | 'D' | 'A' }>,
): { calibration: BacktestResult['calibration']; ece: number } {
  const bins = Array.from({ length: 10 }, () => ({ predSum: 0, observed: 0, count: 0 }));
  for (const entry of entries) {
    const probs = [entry.prediction.homeWin, entry.prediction.draw, entry.prediction.awayWin];
    probs.forEach((p, index) => {
      const actual = (entry.outcome === 'H' ? 0 : entry.outcome === 'D' ? 1 : 2) === index ? 1 : 0;
      const bin = Math.min(9, Math.max(0, Math.floor(p * 10)));
      bins[bin].predSum += p;
      bins[bin].observed += actual;
      bins[bin].count += 1;
    });
  }
  const calibration = bins
    .map((bin, index) => ({
      bin: index,
      predicted: bin.count ? bin.predSum / bin.count : 0,
      observed: bin.count ? bin.observed / bin.count : 0,
      count: bin.count,
    }))
    .filter((bin) => bin.count > 0);
  const total = calibration.reduce((sum, bin) => sum + bin.count, 0) || 1;
  const ece = calibration.reduce(
    (sum, bin) => sum + (bin.count / total) * Math.abs(bin.observed - bin.predicted),
    0,
  );
  return { calibration, ece };
}

function backtestFrom(matches: MatchView[]): BacktestResult | null {
  const played = matches.filter((m) => m.status === 'played' && m.result && m.score);
  if (played.length < 20) return null;
  const entries = played.map((m) => ({ prediction: m.prediction, outcome: m.result!.outcome }));

  let logLoss = 0;
  let brier = 0;
  let correct = 0;
  for (const entry of entries) {
    const actual = entry.outcome;
    const probs = [entry.prediction.homeWin, entry.prediction.draw, entry.prediction.awayWin];
    const index = actual === 'H' ? 0 : actual === 'D' ? 1 : 2;
    logLoss += -Math.log(Math.max(1e-9, probs[index]));
    brier += probs.reduce((sum, p, i) => sum + (p - (i === index ? 1 : 0)) ** 2, 0);
    if (probs.indexOf(Math.max(...probs)) === index) correct += 1;
  }
  const n = entries.length;
  const homeWins = entries.filter((entry) => entry.outcome === 'H').length / n;
  const draws = entries.filter((entry) => entry.outcome === 'D').length / n;
  const awayWins = entries.filter((entry) => entry.outcome === 'A').length / n;
  const baseRates = [homeWins, draws, awayWins];
  const baselineLogLoss =
    -entries.reduce((sum, entry) => {
      const index = entry.outcome === 'H' ? 0 : entry.outcome === 'D' ? 1 : 2;
      return sum + Math.log(Math.max(1e-9, baseRates[index]));
    }, 0) / n;

  const withForecast = played.filter((m) => m.forecast);
  let understatLogLoss: number | null = null;
  if (withForecast.length >= 10) {
    understatLogLoss =
      withForecast.reduce((sum, m) => {
        const index = m.result!.outcome === 'H' ? 0 : m.result!.outcome === 'D' ? 1 : 2;
        const probs = [m.forecast!.home, m.forecast!.draw, m.forecast!.away];
        return sum - Math.log(Math.max(1e-9, probs[index]));
      }, 0) / withForecast.length;
  }

  const { calibration, ece } = calibrationFor(entries);
  return {
    matches: n,
    logLoss: logLoss / n,
    brier: brier / n,
    accuracy: correct / n,
    baselineLogLoss,
    understatLogLoss,
    understatMatches: withForecast.length,
    ece,
    calibration,
    confusion: {
      home: entries.filter((entry) => entry.outcome === 'H').length,
      draw: entries.filter((entry) => entry.outcome === 'D').length,
      away: entries.filter((entry) => entry.outcome === 'A').length,
    },
    correct,
  };
}

function roleOf(position: string): PlayerView['role'] {
  const p = position.trim().toUpperCase();
  if (p.startsWith('GK')) return 'GK';
  if (p.startsWith('F')) return 'FWD';
  if (p.startsWith('M')) return 'MID';
  if (p.startsWith('D')) return p.includes('M') || p.includes('F') ? 'MID' : 'DEF';
  if (p === 'S' || p.startsWith('S')) return 'FWD';
  return 'MID';
}

function percentile(values: number[], value: number): number {
  if (values.length === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return ((below + equal * 0.5) / values.length) * 100;
}

function playerViews(rows: PlayerRow[], teamById: Map<string, TeamRef>, teamStats: Map<string, TeamStatsView>): PlayerView[] {
  const base = rows.map((row) => {
    const minutes = Math.max(1, row.minutes);
    const per90 = {
      goals: (row.goals / minutes) * 90,
      assists: (row.assists / minutes) * 90,
      xg: (row.xg / minutes) * 90,
      xa: (row.xa / minutes) * 90,
      xgxa: ((row.xg + row.xa) / minutes) * 90,
      npxg: (row.npxg / minutes) * 90,
      shots: (row.shots / minutes) * 90,
      keyPasses: (row.key_passes / minutes) * 90,
      xgChain: (row.xg_chain / minutes) * 90,
      xgBuildup: (row.xg_buildup / minutes) * 90,
    };
    const role = roleOf(row.position);
    const team = row.team_id ? teamById.get(row.team_id) : undefined;
    const teamStat = row.team_id ? teamStats.get(row.team_id) : undefined;
    const teamXga90 = teamStat && teamStat.played > 0 ? teamStat.xga / teamStat.played : 1.4;
    return {
      row,
      minutes,
      per90,
      role,
      teamName: team?.name ?? 'Unattached',
      teamXga90,
      confidence: Math.min(1, minutes / 1500),
      attackMetric:
        role === 'DEF'
          ? per90.xg + per90.xa * 0.5
          : role === 'GK'
            ? 0
            : per90.xg + per90.xa,
      finishingMetric: row.shots >= 8 ? (row.goals - row.xg) / Math.max(8, row.shots) : 0,
    };
  });

  const cohorts = new Map<PlayerView['role'], typeof base>();
  for (const player of base) {
    if (player.minutes < 180) continue;
    const list = cohorts.get(player.role) ?? [];
    list.push(player);
    cohorts.set(player.role, list);
  }

  const percentileByMetric = new Map<string, number[]>();
  for (const role of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    const cohort = cohorts.get(role) ?? [];
    percentileByMetric.set(`${role}:attackMetric`, cohort.map((player) => player.attackMetric));
    percentileByMetric.set(`${role}:finishingMetric`, cohort.map((player) => player.finishingMetric));
    percentileByMetric.set(`${role}:teamXga90`, cohort.map((player) => -player.teamXga90));
    percentileByMetric.set(`${role}:creation`, cohort.map((player) => player.per90.xa));
    percentileByMetric.set(`${role}:progression`, cohort.map((player) => player.per90.xgChain + player.per90.xgBuildup));
    percentileByMetric.set(`${role}:minutes`, cohort.map((player) => player.minutes));
    percentileByMetric.set(`${role}:xg90`, cohort.map((player) => player.per90.xg));
    percentileByMetric.set(`${role}:xa90`, cohort.map((player) => player.per90.xa));
    percentileByMetric.set(`${role}:xgxa90`, cohort.map((player) => player.per90.xgxa));
  }

  const views = base.map((player) => {
    const values = (metric: string) => percentileByMetric.get(`${player.role}:${metric}`) ?? [];
    const attack = percentile(values('attackMetric'), player.attackMetric);
    const creation = percentile(values('creation'), player.per90.xa);
    const progression = percentile(values('progression'), player.per90.xgChain + player.per90.xgBuildup);
    const defence = percentile(values('teamXga90'), -player.teamXga90);
    const finishing = percentile(values('finishingMetric'), player.finishingMetric);
    const minutesPct = percentile(values('minutes'), player.minutes);

    const percentiles: PlayerPercentiles = {
      attack: Math.round(attack),
      creation: Math.round(creation),
      progression: Math.round(progression),
      defence: Math.round(defence),
      finishing: Math.round(finishing),
      minutes: Math.round(minutesPct),
    };

    let rating: number;
    if (player.role === 'GK') rating = defence * 0.65 + minutesPct * 0.35;
    else if (player.role === 'DEF') rating = defence * 0.45 + progression * 0.2 + attack * 0.15 + minutesPct * 0.2;
    else if (player.role === 'MID') rating = attack * 0.35 + creation * 0.22 + progression * 0.2 + defence * 0.08 + minutesPct * 0.15;
    else rating = attack * 0.45 + finishing * 0.18 + creation * 0.17 + minutesPct * 0.2;

    const shrink = 0.55 + 0.45 * player.confidence;
    const shrunk = 50 + (rating - 50) * shrink;

    return {
      id: player.row.player_id,
      name: player.row.name,
      teamId: player.row.team_id,
      teamName: player.teamName,
      position: player.row.position,
      role: player.role,
      games: player.row.games,
      minutes: player.row.minutes,
      goals: player.row.goals,
      assists: player.row.assists,
      xg: player.row.xg,
      xa: player.row.xa,
      npg: player.row.npg,
      npxg: player.row.npxg,
      shots: player.row.shots,
      keyPasses: player.row.key_passes,
      xgChain: player.row.xg_chain,
      xgBuildup: player.row.xg_buildup,
      yellow: player.row.yellow,
      red: player.row.red,
      per90: player.per90,
      rating: Math.round(Math.min(99, Math.max(1, shrunk)) * 10) / 10,
      confidence: player.confidence,
      percentiles,
      rank: 0,
      goalOverperformance: player.row.goals - player.row.xg,
    } satisfies PlayerView;
  });

  const sorted = [...views].sort((a, b) => b.rating - a.rating);
  const rankById = new Map(sorted.map((player, index) => [player.id, index + 1]));
  return views
    .map((player) => ({ ...player, rank: rankById.get(player.id) ?? 0 }))
    .sort((a, b) => a.rank - b.rank);
}

interface FormationSlot {
  key: string;
  label: string;
  group: PlayerView['role'];
  x: number;
  y: number;
}

interface Formation {
  name: string;
  label: string;
  slots: FormationSlot[];
}

const FORMATIONS: Record<string, Formation> = {
  '4-3-3': {
    name: '4-3-3',
    label: '4-3-3 · high wingers',
    slots: [
      { key: 'gk', label: 'GK', group: 'GK', x: 50, y: 92 },
      { key: 'lb', label: 'LB', group: 'DEF', x: 13, y: 74 },
      { key: 'cb1', label: 'CB', group: 'DEF', x: 37, y: 78 },
      { key: 'cb2', label: 'CB', group: 'DEF', x: 63, y: 78 },
      { key: 'rb', label: 'RB', group: 'DEF', x: 87, y: 74 },
      { key: 'dm', label: 'DM', group: 'MID', x: 50, y: 57 },
      { key: 'cm1', label: 'CM', group: 'MID', x: 29, y: 49 },
      { key: 'cm2', label: 'CM', group: 'MID', x: 71, y: 49 },
      { key: 'lw', label: 'LW', group: 'FWD', x: 16, y: 25 },
      { key: 'st', label: 'ST', group: 'FWD', x: 50, y: 15 },
      { key: 'rw', label: 'RW', group: 'FWD', x: 84, y: 25 },
    ],
  },
  '4-2-3-1': {
    name: '4-2-3-1',
    label: '4-2-3-1 · double pivot',
    slots: [
      { key: 'gk', label: 'GK', group: 'GK', x: 50, y: 92 },
      { key: 'lb', label: 'LB', group: 'DEF', x: 13, y: 74 },
      { key: 'cb1', label: 'CB', group: 'DEF', x: 37, y: 78 },
      { key: 'cb2', label: 'CB', group: 'DEF', x: 63, y: 78 },
      { key: 'rb', label: 'RB', group: 'DEF', x: 87, y: 74 },
      { key: 'dm1', label: 'DM', group: 'MID', x: 34, y: 58 },
      { key: 'dm2', label: 'DM', group: 'MID', x: 66, y: 58 },
      { key: 'lw', label: 'LW', group: 'FWD', x: 15, y: 34 },
      { key: 'am', label: 'AM', group: 'MID', x: 50, y: 37 },
      { key: 'rw', label: 'RW', group: 'FWD', x: 85, y: 34 },
      { key: 'st', label: 'ST', group: 'FWD', x: 50, y: 14 },
    ],
  },
  '3-4-2-1': {
    name: '3-4-2-1',
    label: '3-4-2-1 · back three',
    slots: [
      { key: 'gk', label: 'GK', group: 'GK', x: 50, y: 92 },
      { key: 'cb1', label: 'CB', group: 'DEF', x: 25, y: 78 },
      { key: 'cb2', label: 'CB', group: 'DEF', x: 50, y: 80 },
      { key: 'cb3', label: 'CB', group: 'DEF', x: 75, y: 78 },
      { key: 'lwb', label: 'LWB', group: 'DEF', x: 9, y: 56 },
      { key: 'cm1', label: 'CM', group: 'MID', x: 37, y: 57 },
      { key: 'cm2', label: 'CM', group: 'MID', x: 63, y: 57 },
      { key: 'rwb', label: 'RWB', group: 'DEF', x: 91, y: 56 },
      { key: 'am1', label: 'AM', group: 'MID', x: 35, y: 33 },
      { key: 'am2', label: 'AM', group: 'MID', x: 65, y: 33 },
      { key: 'st', label: 'ST', group: 'FWD', x: 50, y: 14 },
    ],
  },
  '4-4-2': {
    name: '4-4-2',
    label: '4-4-2 · classic',
    slots: [
      { key: 'gk', label: 'GK', group: 'GK', x: 50, y: 92 },
      { key: 'lb', label: 'LB', group: 'DEF', x: 13, y: 74 },
      { key: 'cb1', label: 'CB', group: 'DEF', x: 37, y: 78 },
      { key: 'cb2', label: 'CB', group: 'DEF', x: 63, y: 78 },
      { key: 'rb', label: 'RB', group: 'DEF', x: 87, y: 74 },
      { key: 'lm', label: 'LM', group: 'MID', x: 12, y: 49 },
      { key: 'cm1', label: 'CM', group: 'MID', x: 38, y: 53 },
      { key: 'cm2', label: 'CM', group: 'MID', x: 62, y: 53 },
      { key: 'rm', label: 'RM', group: 'MID', x: 88, y: 49 },
      { key: 'st1', label: 'ST', group: 'FWD', x: 37, y: 17 },
      { key: 'st2', label: 'ST', group: 'FWD', x: 63, y: 17 },
    ],
  },
};

type SlotFamily = 'GK' | 'CB' | 'FB' | 'DM' | 'CM' | 'AM' | 'W' | 'ST';
type FitLabel = 'natural' | 'adapted' | 'out';

function slotFamily(slot: FormationSlot): SlotFamily {
  switch (slot.label) {
    case 'GK':
      return 'GK';
    case 'CB':
      return 'CB';
    case 'LB':
    case 'RB':
    case 'LWB':
    case 'RWB':
      return 'FB';
    case 'DM':
      return 'DM';
    case 'CM':
      return 'CM';
    case 'AM':
      return 'AM';
    case 'LW':
    case 'RW':
    case 'LM':
    case 'RM':
      return 'W';
    case 'ST':
      return 'ST';
    default:
      return slot.group === 'DEF' ? 'CB' : slot.group === 'MID' ? 'CM' : 'ST';
  }
}

function isStriker(player: PlayerView): boolean {
  return player.position.toUpperCase().split(/\s+/).includes('S');
}

function fitFor(player: PlayerView, slot: FormationSlot): FitLabel {
  const family = slotFamily(slot);
  if (family === 'GK') return player.role === 'GK' ? 'natural' : 'out';
  if (family === 'CB' || family === 'FB') {
    if (player.role === 'DEF') return 'natural';
    if (player.role === 'MID') return 'adapted';
    return 'out';
  }
  if (family === 'ST') {
    if (player.role === 'FWD') return 'natural';
    if (player.role === 'MID') return 'adapted';
    return 'out';
  }
  if (family === 'W') {
    if (player.role === slot.group) return 'natural';
    if (player.role === 'FWD' || player.role === 'MID') return 'adapted';
    return 'out';
  }
  if (family === 'AM') {
    if (player.role === 'MID') return 'natural';
    if (player.role === 'FWD') return 'adapted';
    return 'out';
  }
  if (family === 'DM') {
    if (player.role === 'MID') return 'natural';
    if (player.role === 'DEF') return 'adapted';
    return 'out';
  }
  if (player.role === 'MID') return 'natural';
  if (player.role === 'DEF' || player.role === 'FWD') return 'adapted';
  return 'out';
}

function fitBase(fit: FitLabel): number {
  return fit === 'natural' ? 84 : fit === 'adapted' ? 58 : 30;
}

function partnerScore(player: PlayerView, slot: FormationSlot): number {
  const fit = fitFor(player, slot);
  const family = slotFamily(slot);
  const p90 = player.per90;
  let bonus = fit === 'natural' ? 34 : fit === 'adapted' ? -12 : -55;

  if (family === 'ST') {
    bonus += (isStriker(player) ? 9 : -4) + p90.npxg * 10;
  } else if (family === 'W') {
    bonus += (isStriker(player) ? -4 : 4) + p90.xa * 9 + p90.xg * 3;
  } else if (family === 'AM') {
    bonus += p90.xgxa * 12 + p90.keyPasses * 2;
  } else if (family === 'DM') {
    bonus += p90.xgBuildup * 12 + p90.xgChain * 4 - p90.xgxa * 3;
  } else if (family === 'CM') {
    bonus += p90.xgxa * 6 + p90.xgBuildup * 6;
  } else if (family === 'FB') {
    bonus += p90.xa * 10 + p90.keyPasses * 2;
  } else if (family === 'CB') {
    bonus += p90.xgBuildup * 2;
  }

  return player.rating + bonus;
}

const SLOT_PRIORITY: Record<SlotFamily, number> = {
  GK: 0,
  ST: 10,
  W: 20,
  AM: 30,
  DM: 40,
  CM: 50,
  CB: 60,
  FB: 70,
};

interface Selection {
  xi: Array<{
    slot: string;
    label: string;
    x: number;
    y: number;
    group: PlayerView['role'];
    roleFit: number;
    fit: FitLabel;
    player: PlayerView;
  }>;
  bench: PlayerView[];
  available: number;
  avgRating: number;
  avgFit: number;
  natural: number;
  adapted: number;
  out: number;
  score: number;
}

function selectLineup(snapshot: Snapshot, teamId: string, formation: Formation): Selection | null {
  const squad = snapshot.players.filter((p) => p.teamId === teamId && p.minutes > 0);
  if (squad.length === 0) return null;

  const maxMinutes = Math.max(...squad.map((player) => player.minutes));
  const threshold = Math.max(60, Math.min(300, maxMinutes * 0.12));
  const established = squad.filter((player) => player.minutes >= threshold);
  let pool = established.length >= 11 ? established : squad;
  // A low-minute goalkeeper must still be eligible for the GK slot; the
  // established-minutes filter is about outfield reliability, not squad validity.
  if (!pool.some((player) => player.role === 'GK')) {
    pool = [...pool, ...squad.filter((player) => player.role === 'GK')];
  }
  const used = new Set<string>();
  const chosen: Array<{ slot: FormationSlot; player: PlayerView; fit: FitLabel }> = [];

  const orderedSlots = [...formation.slots].sort((a, b) => {
    const pa = SLOT_PRIORITY[slotFamily(a)];
    const pb = SLOT_PRIORITY[slotFamily(b)];
    return pa - pb || a.x - b.x;
  });

  const assignSlots = (naturalOnly: boolean) => {
    for (const slot of orderedSlots) {
      if (chosen.some((entry) => entry.slot.key === slot.key)) continue;
      const family = slotFamily(slot);
      const available = pool.filter((player) => {
        if (used.has(player.id)) return false;
        // Never put a goalkeeper in an outfield slot, or an outfield player in goal.
        return family === 'GK' ? player.role === 'GK' : player.role !== 'GK';
      });
      if (available.length === 0) continue;

      const natural = available.filter((player) => fitFor(player, slot) === 'natural');
      let candidates = natural;
      if (!naturalOnly && candidates.length === 0) {
        const nonOut = available.filter((player) => fitFor(player, slot) !== 'out');
        candidates = nonOut.length > 0 ? nonOut : available;
      }
      if (candidates.length === 0) continue;

      const best = candidates.reduce((winner, candidate) =>
        partnerScore(candidate, slot) > partnerScore(winner, slot) ? candidate : winner,
      );
      used.add(best.id);
      chosen.push({ slot, player: best, fit: fitFor(best, slot) });
    }
  };

  // Pass one locks in players who naturally own a slot. Pass two fills the
  // remaining slots with adapted (then out-of-role) players, so a short squad
  // is never forced to put defenders in midfield while leaving a full-back slot empty.
  assignSlots(true);
  assignSlots(false);

  const xi = chosen
    .map((entry) => ({
      slot: entry.slot.key,
      label: entry.slot.label,
      x: entry.slot.x,
      y: entry.slot.y,
      group: entry.slot.group,
      roleFit: Math.round(Math.min(100, fitBase(entry.fit) + entry.player.confidence * 10)),
      fit: entry.fit,
      player: entry.player,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const benchPool = squad.filter((player) => !used.has(player.id) && player.minutes >= threshold / 2);
  const bench = (benchPool.length >= 5 ? benchPool : squad.filter((player) => !used.has(player.id)))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 7);
  const avgRating = xi.reduce((sum, entry) => sum + entry.player.rating, 0) / Math.max(1, xi.length);
  const avgFit = xi.reduce((sum, entry) => sum + entry.roleFit, 0) / Math.max(1, xi.length);
  const natural = xi.filter((entry) => entry.fit === 'natural').length;
  const adapted = xi.filter((entry) => entry.fit === 'adapted').length;
  const out = xi.filter((entry) => entry.fit === 'out').length;
  const score = avgRating + natural * 2.4 + adapted * 0.25 - out * 6 - (11 - xi.length) * 4;

  return { xi, bench, available: squad.length, avgRating, avgFit, natural, adapted, out, score };
}

export function buildLineup(snapshot: Snapshot, teamId: string, formationName?: string) {
  const team = snapshot.teams.find((t) => t.id === teamId);
  if (!team) throw new Error('Team not found');

  const evaluations = Object.values(FORMATIONS)
    .map((formation) => ({ formation, selection: selectLineup(snapshot, teamId, formation) }))
    .filter((item): item is { formation: Formation; selection: Selection } => item.selection !== null);

  if (evaluations.length === 0) {
    return {
      team: { id: team.id, name: team.name, shortName: team.shortName },
      formation: '4-3-3',
      formationLabel: '4-3-3 · high wingers',
      recommendedFormation: '4-3-3',
      formationScores: [] as Array<{ name: string; label: string; fit: number; score: number; recommended: boolean }>,
      xi: [],
      bench: [],
      available: 0,
      complete: false,
      missing: 11,
      notes: 'No players with minutes were found for this team in the selected season. The XI is left empty rather than padded with invented players.',
    };
  }

  const recommended = evaluations.reduce((best, candidate) =>
    candidate.selection.score > best.selection.score ? candidate : best,
  );
  const requested = formationName ? evaluations.find((item) => item.formation.name === formationName) : null;
  const target = requested ?? recommended;
  const formation = target.formation;
  const selection = target.selection;
  const complete = selection.xi.length === 11;
  const missing = Math.max(0, 11 - selection.xi.length);
  const hasGoalkeeper = selection.xi.some((entry) => entry.group === 'GK');
  const coverageNote = complete
    ? ''
    : ` Only ${selection.xi.length} of 11 slots are filled because Understat lists ${selection.available} player${
        selection.available === 1 ? '' : 's'
      } with minutes for this team-season. Unfilled slots are intentional; HalfSpace does not pad them with invented players.${
        hasGoalkeeper ? '' : ' No goalkeeper appears in the data, so the GK slot is left empty.'
      }`;

  return {
    team: { id: team.id, name: team.name, shortName: team.shortName },
    formation: formation.name,
    formationLabel: formation.label,
    recommendedFormation: recommended.formation.name,
    formationScores: evaluations.map((item) => ({
      name: item.formation.name,
      label: item.formation.label,
      fit: Math.round(item.selection.avgFit * 10) / 10,
      score: Math.round(item.selection.score * 10) / 10,
      recommended: item.formation.name === recommended.formation.name,
    })),
    xi: selection.xi,
    bench: selection.bench,
    available: selection.available,
    complete,
    missing,
    notes:
      `${selection.natural} natural, ${selection.adapted} adapted and ${selection.out} out-of-role assignment${selection.out === 1 ? '' : 's'}. ` +
      `Selected by season minutes, impact rating and broad provider position codes. ` +
      `${recommended.formation.name} currently scores best across the available shapes; change the shape to re-optimise.${coverageNote}`,
  };
}

export function listFormations() {
  return Object.values(FORMATIONS).map((formation) => ({ name: formation.name, label: formation.label }));
}

export const TACTIC_AXES = [
  { key: 'press', label: 'Press', note: 'PPDA, inverted' },
  { key: 'territory', label: 'Territory', note: 'Deep completions / match' },
  { key: 'buildup', label: 'Build-up', note: 'xG build-up share' },
  { key: 'chanceQuality', label: 'Chance quality', note: 'xG / shot' },
  { key: 'control', label: 'Control', note: 'xG difference / match' },
  { key: 'finishing', label: 'Finishing', note: 'Goals − xG' },
] as const;

type TacticAxisKey = (typeof TACTIC_AXES)[number]['key'];

function percentileOf(values: number[], value: number): number {
  if (values.length <= 1) return 50;
  const below = values.filter((item) => item < value).length;
  const equal = values.filter((item) => item === value).length;
  return Math.round(((below + equal * 0.5) / values.length) * 100);
}

function classifyStyle(style: Record<TacticAxisKey, number>) {
  if (style.press >= 70 && style.control >= 55) {
    return {
      key: 'front-foot',
      label: 'Front-foot press',
      description: 'Aggressive ball recovery with sustained territory and a positive xG balance.',
    };
  }
  if (style.press >= 65) {
    return {
      key: 'high-press',
      label: 'High press',
      description: 'The team spends a lot of its defensive energy pressing high; control may still vary by game state.',
    };
  }
  if (style.buildup >= 62 && style.territory >= 58) {
    return {
      key: 'possession',
      label: 'Possession control',
      description: 'Build-up involvement and final-third entries suggest a patient, territory-oriented model.',
    };
  }
  if (style.press <= 38 && style.territory <= 45) {
    return {
      key: 'low-block',
      label: 'Low block / counter',
      description: 'Lower pressing volume and deeper territory; chance quality can matter more than shot volume.',
    };
  }
  if (style.chanceQuality >= 62 && style.buildup < 50) {
    return {
      key: 'direct',
      label: 'Direct / transition',
      description: 'A lower build-up share with strong chance quality points to faster, more vertical attacks.',
    };
  }
  if (style.control >= 60) {
    return {
      key: 'controlled',
      label: 'Controlled',
      description: 'A positive xG balance without an extreme pressing or build-up signature.',
    };
  }
  return {
    key: 'balanced',
    label: 'Balanced',
    description: 'No single style axis dominates. The profile is a blend rather than a clean archetype.',
  };
}

export function buildTacticsBoard(snapshot: Snapshot) {
  const rows = snapshot.teams.map((team) => {
    const squad = snapshot.players.filter((player) => player.teamId === team.id);
    const shots = squad.reduce((sum, player) => sum + player.shots, 0);
    const goals = squad.reduce((sum, player) => sum + player.goals, 0);
    const xg = team.stats.xg;
    const xgChain = squad.reduce((sum, player) => sum + player.xgChain, 0);
    const xgBuildup = squad.reduce((sum, player) => sum + player.xgBuildup, 0);
    const played = Math.max(1, team.stats.played);
    return {
      team: { id: team.id, name: team.name, shortName: team.shortName },
      rank: team.rank,
      played: team.stats.played,
      points: team.stats.points,
      xg,
      xga: team.stats.xga,
      xgd: team.stats.xgd,
      ppda: team.stats.ppda,
      deepPerGame: team.stats.deep / played,
      deepAllowedPerGame: team.stats.deepAllowed / played,
      shots,
      xgPerShot: shots > 0 ? xg / shots : 0,
      buildupShare: xgChain > 0 ? xgBuildup / xgChain : 0,
      finishingSignal: goals - xg,
      controlPerGame: team.stats.xgd / played,
    };
  });

  const ppdas = rows.map((row) => row.ppda).filter((value): value is number => value !== null);
  const territory = rows.map((row) => row.deepPerGame);
  const buildup = rows.map((row) => row.buildupShare);
  const quality = rows.map((row) => row.xgPerShot);
  const control = rows.map((row) => row.controlPerGame);
  const finishing = rows.map((row) => row.finishingSignal);

  const teams = rows
    .map((row) => {
      const style = {
        press: row.ppda === null ? 50 : 100 - percentileOf(ppdas, row.ppda),
        territory: percentileOf(territory, row.deepPerGame),
        buildup: percentileOf(buildup, row.buildupShare),
        chanceQuality: percentileOf(quality, row.xgPerShot),
        control: percentileOf(control, row.controlPerGame),
        finishing: percentileOf(finishing, row.finishingSignal),
      } satisfies Record<TacticAxisKey, number>;
      return {
        ...row,
        style,
        archetype: classifyStyle(style),
      };
    })
    .sort((a, b) => a.rank - b.rank);

  return {
    league: snapshot.league,
    season: snapshot.season,
    updatedAt: snapshot.updatedAt,
    axes: TACTIC_AXES,
    teams,
  };
}

function buildSnapshot(slug: string, year: number): Snapshot {
  const league = getLeague(slug);
  if (!league) throw new Error('Unknown league');
  const sid = seasonId(league.slug, year);
  const season = get<{ id: string; year: number; label: string }>('SELECT * FROM seasons WHERE id = ?', [sid]);
  if (!season) throw new Error('Season not synced yet');

  const teamRows = all<TeamRow>(
    `SELECT t.id, t.name, t.short_name
       FROM teams t
       JOIN team_seasons ts ON ts.team_id = t.id
      WHERE ts.season_id = ? AND ts.played >= 0
      ORDER BY t.name`,
    [sid],
  );
  const teamSeasonRows = all<TeamSeasonRow>('SELECT * FROM team_seasons WHERE season_id = ?', [sid]);
  const teamSeasonMap = new Map(teamSeasonRows.map((row) => [row.team_id, row]));
  const teamById = new Map<string, TeamRef>(
    teamRows.map((row) => [row.id, { id: row.id, name: row.name, shortName: row.short_name }]),
  );

  const matches = loadMatches(sid);
  const played = matches.filter((m) => m.isResult);
  const remaining = matches.filter((m) => !m.isResult);
  const priorRatings = year > 2024 ? ratingsForSeason(league, year - 1) : undefined;
  const priorAverages = year > 2024 ? averagesForSeason(league, year - 1) : undefined;
  const finalRatings = ratingsForSeason(league, year);
  const finalAverages = averagesForSeason(league, year);
  const completed = remaining.length === 0;

  const preMatch = new Map<string, Prediction>();
  for (let i = 0; i < played.length; i += 1) {
    const match = played[i];
    const history = played.slice(0, i);
    const ratings = computeRatings(history, priorRatings);
    const averages = history.length >= 8 ? computeLeagueAverages(history) : priorAverages ?? computeLeagueAverages(history);
    const home = ratings.get(match.homeId) ?? defaultRating(match.homeId, priorRatings);
    const away = ratings.get(match.awayId) ?? defaultRating(match.awayId, priorRatings);
    preMatch.set(
      match.id,
      predictMatch(home, away, averages, ratings.get(match.homeId)?.matches ?? 0, ratings.get(match.awayId)?.matches ?? 0),
    );
  }

  const matchViews: MatchView[] = matches.map((match) => {
    const home = teamById.get(match.homeId) ?? { id: match.homeId, name: match.homeId, shortName: match.homeId };
    const away = teamById.get(match.awayId) ?? { id: match.awayId, name: match.awayId, shortName: match.awayId };
    const homeRating = finalRatings.get(match.homeId) ?? defaultRating(match.homeId, priorRatings);
    const awayRating = finalRatings.get(match.awayId) ?? defaultRating(match.awayId, priorRatings);
    const prediction = match.isResult
      ? preMatch.get(match.id) ?? predictMatch(homeRating, awayRating, finalAverages, homeRating.matches, awayRating.matches)
      : predictMatch(homeRating, awayRating, finalAverages, homeRating.matches, awayRating.matches);
    const score =
      match.homeGoals !== null && match.awayGoals !== null
        ? { home: match.homeGoals, away: match.awayGoals }
        : null;
    return {
      id: match.id,
      round: match.round,
      kickoff: match.kickoff,
      status: match.isResult ? 'played' : 'upcoming',
      home,
      away,
      score,
      xg:
        match.homeXg !== null && match.awayXg !== null
          ? { home: match.homeXg, away: match.awayXg }
          : null,
      prediction,
      result: score ? evaluate(prediction, score.home, score.away) : null,
      forecast:
        match.forecastH !== null && match.forecastD !== null && match.forecastA !== null
          ? { home: match.forecastH, draw: match.forecastD, away: match.forecastA }
          : null,
    };
  });

  const table: TableRow[] = teamRows
    .map((team) => {
      const stats = teamSeasonMap.get(team.id);
      const rating = finalRatings.get(team.id) ?? defaultRating(team.id, priorRatings);
      return {
        position: 0,
        teamId: team.id,
        name: team.name,
        shortName: team.short_name,
        played: stats?.played ?? 0,
        won: stats?.wins ?? 0,
        drawn: stats?.draws ?? 0,
        lost: stats?.losses ?? 0,
        goalsFor: stats?.goals_for ?? 0,
        goalsAgainst: stats?.goals_against ?? 0,
        goalDifference: (stats?.goals_for ?? 0) - (stats?.goals_against ?? 0),
        points: (stats?.wins ?? 0) * 3 + (stats?.draws ?? 0),
        xg: stats?.xg ?? 0,
        xga: stats?.xga ?? 0,
        xgDifference: (stats?.xg ?? 0) - (stats?.xga ?? 0),
        xpts: stats?.xpts ?? 0,
        ppda: stats?.ppda ?? null,
        power: rating.power,
        elo: rating.elo,
        form: [],
      };
    })
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor)
    .map((row, index) => ({ ...row, position: index + 1 }));

  const tableByTeam = new Map(table.map((row) => [row.teamId, row]));

  const teamStats = new Map<string, TeamStatsView>();
  for (const team of teamRows) {
    const stats = teamSeasonMap.get(team.id);
    const n = Math.max(1, stats?.played ?? 0);
    teamStats.set(team.id, {
      played: stats?.played ?? 0,
      wins: stats?.wins ?? 0,
      draws: stats?.draws ?? 0,
      losses: stats?.losses ?? 0,
      goalsFor: stats?.goals_for ?? 0,
      goalsAgainst: stats?.goals_against ?? 0,
      points: (stats?.wins ?? 0) * 3 + (stats?.draws ?? 0),
      xg: stats?.xg ?? 0,
      xga: stats?.xga ?? 0,
      xgd: (stats?.xg ?? 0) - (stats?.xga ?? 0),
      xpts: stats?.xpts ?? 0,
      ppda: stats?.ppda ?? null,
      oppda: stats?.oppda ?? null,
      deep: stats?.deep ?? 0,
      deepAllowed: stats?.deep_allowed ?? 0,
      goalsPerGame: (stats?.goals_for ?? 0) / n,
      xgPerGame: (stats?.xg ?? 0) / n,
      xgaPerGame: (stats?.xga ?? 0) / n,
    });
  }

  const formFor = (teamId: string): FormMatch[] => {
    return matchViews
      .filter((m) => m.status === 'played' && (m.home.id === teamId || m.away.id === teamId))
      .slice(-5)
      .map((m) => {
        const isHome = m.home.id === teamId;
        const goalsFor = isHome ? m.score!.home : m.score!.away;
        const goalsAgainst = isHome ? m.score!.away : m.score!.home;
        return {
          matchId: m.id,
          kickoff: m.kickoff,
          opponent: isHome ? m.away : m.home,
          home: isHome,
          goalsFor,
          goalsAgainst,
          xgFor: isHome ? m.xg?.home ?? 0 : m.xg?.away ?? 0,
          xgAgainst: isHome ? m.xg?.away ?? 0 : m.xg?.home ?? 0,
          outcome: goalsFor > goalsAgainst ? 'W' : goalsFor === goalsAgainst ? 'D' : 'L',
        };
      });
  };

  const teams: TeamView[] = teamRows.map((team) => {
    const row = tableByTeam.get(team.id)!;
    const rating = finalRatings.get(team.id) ?? defaultRating(team.id, priorRatings);
    const stats = teamStats.get(team.id)!;
    const teamMatches = matchViews.filter(
      (m) => m.status === 'played' && (m.home.id === team.id || m.away.id === team.id),
    );
    const upcoming = matchViews
      .filter((m) => m.status === 'upcoming' && (m.home.id === team.id || m.away.id === team.id))
      .slice(0, 5);
    return {
      id: team.id,
      name: team.name,
      shortName: team.short_name,
      rank: row.position,
      rating: {
        elo: rating.elo,
        attack: rating.attack,
        defence: rating.defence,
        power: rating.power,
        xgDiff90: rating.xgDiff90,
        form: rating.form,
        matches: rating.matches,
      },
      stats,
      form: formFor(team.id),
      results: teamMatches.slice(-6).reverse(),
      upcoming,
      squadCount: 0,
    };
  });

  const playerRows = all<PlayerRow>(
    `SELECT ps.*, p.name
       FROM player_seasons ps
       JOIN players p ON p.id = ps.player_id
      WHERE ps.season_id = ?
      ORDER BY ps.minutes DESC`,
    [sid],
  );
  const players = playerViews(playerRows, teamById, teamStats);
  for (const team of teams) {
    team.squadCount = players.filter((p) => p.teamId === team.id).length;
  }

  const simulations = simulateSeason(
    teamRows.map((team) => ({ id: team.id, name: team.name, shortName: team.short_name })),
    table,
    finalRatings,
    finalAverages,
    remaining,
    completed,
  );
  const backtest = backtestFrom(matchViews);

  const snapshot: Snapshot = {
    league: {
      id: league.id,
      slug: league.slug,
      name: league.name,
      country: league.country,
      accent: league.accent,
    },
    season: { id: sid, year: season.year, label: season.label },
    updatedAt: get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [`synced:${sid}`])?.value ?? null,
    averages: finalAverages,
    completed,
    table: table.map((row) => ({ ...row, form: formFor(row.teamId) })),
    teams,
    matches: matchViews,
    players,
    simulations,
    backtest,
    insights: [],
    coverage: {
      teams: teamRows.length,
      players: players.length,
      matches: matches.length,
      played: played.length,
      remaining: remaining.length,
    },
  };

  snapshot.insights = buildInsights({
    league: snapshot.league,
    season: snapshot.season,
    completed,
    table: snapshot.table,
    teams: snapshot.teams,
    players: snapshot.players,
    matches: snapshot.matches,
    simulations: snapshot.simulations,
    averages: snapshot.averages,
    backtest: snapshot.backtest,
  });

  // Persist derived outputs for auditability and faster inspection.
  try {
    for (const rating of finalRatings.values()) {
      run(
        `INSERT INTO ratings (team_id, season_id, elo, attack, defence, power, xg_diff90, ppda, deep90, form)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(team_id, season_id) DO UPDATE SET
           elo=excluded.elo, attack=excluded.attack, defence=excluded.defence, power=excluded.power,
           xg_diff90=excluded.xg_diff90, ppda=excluded.ppda, deep90=excluded.deep90, form=excluded.form`,
        [
          rating.teamId,
          sid,
          rating.elo,
          rating.attack,
          rating.defence,
          rating.power,
          rating.xgDiff90,
          teamStats.get(rating.teamId)?.ppda ?? null,
          (teamStats.get(rating.teamId)?.deep ?? 0) / Math.max(1, teamStats.get(rating.teamId)?.played ?? 1),
          rating.form,
        ],
      );
    }
    run(
      `INSERT INTO simulations (season_id, payload, created_at) VALUES (?, ?, ?)
       ON CONFLICT(season_id) DO UPDATE SET payload=excluded.payload, created_at=excluded.created_at`,
      [sid, JSON.stringify(simulations), new Date().toISOString()],
    );
    if (backtest) {
      run(
        `INSERT INTO backtests (season_id, payload, created_at) VALUES (?, ?, ?)
         ON CONFLICT(season_id) DO UPDATE SET payload=excluded.payload, created_at=excluded.created_at`,
        [sid, JSON.stringify(backtest), new Date().toISOString()],
      );
    }
    setMeta(`model:${sid}`, MODEL_VERSION);
  } catch (error) {
    console.warn('Could not persist derived model outputs', error);
  }

  return snapshot;
}
