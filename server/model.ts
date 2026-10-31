export interface MatchInput {
  id: string;
  seasonId: string;
  round: number;
  kickoff: string;
  homeId: string;
  awayId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homeXg: number | null;
  awayXg: number | null;
  isResult: boolean;
  forecastH: number | null;
  forecastD: number | null;
  forecastA: number | null;
}

export interface TeamRating {
  teamId: string;
  elo: number;
  attack: number;
  defence: number;
  power: number;
  xgDiff90: number;
  form: number;
  matches: number;
  pointsPerGame: number;
  priorElo: number;
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
  matrix: number[][];
  confidence: number;
  confidenceLabel: 'High' | 'Medium' | 'Low';
  eloHome: number;
  eloAway: number;
  eloHomeWin: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function computeLeagueAverages(matches: MatchInput[]): LeagueAverages {
  const played = matches.filter((m) => m.isResult && m.homeGoals !== null && m.awayGoals !== null);
  const withXg = played.filter((m) => m.homeXg !== null && m.awayXg !== null);
  let homeXg = 1.55;
  let awayXg = 1.25;
  if (withXg.length >= 10) {
    homeXg = withXg.reduce((sum, m) => sum + (m.homeXg ?? 0), 0) / withXg.length;
    awayXg = withXg.reduce((sum, m) => sum + (m.awayXg ?? 0), 0) / withXg.length;
  } else if (played.length > 0) {
    homeXg = played.reduce((sum, m) => sum + (m.homeGoals ?? 0), 0) / played.length;
    awayXg = played.reduce((sum, m) => sum + (m.awayGoals ?? 0), 0) / played.length;
  }
  const homeGoals =
    played.length > 0
      ? played.reduce((sum, m) => sum + (m.homeGoals ?? 0), 0) / played.length
      : homeXg;
  const awayGoals =
    played.length > 0
      ? played.reduce((sum, m) => sum + (m.awayGoals ?? 0), 0) / played.length
      : awayXg;
  const homeWins = played.filter((m) => (m.homeGoals ?? 0) > (m.awayGoals ?? 0)).length;
  const draws = played.filter((m) => (m.homeGoals ?? 0) === (m.awayGoals ?? 0)).length;
  const awayWins = played.length - homeWins - draws;
  const denom = Math.max(1, played.length);
  return {
    homeXg,
    awayXg,
    homeGoals,
    awayGoals,
    homeWin: homeWins / denom,
    draw: draws / denom,
    awayWin: awayWins / denom,
    goalsPerMatch: homeGoals + awayGoals,
  };
}

/** Dixon-Coles low-score dependency. Negative rho lifts 0-0 and 1-1, trims 1-0 / 0-1. */
export const DC_RHO = -0.06;

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let factorial = 1;
  for (let i = 2; i <= k; i += 1) factorial *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial;
}

function dcTau(home: number, away: number, lambda: number, mu: number): number {
  if (home === 0 && away === 0) return 1 - lambda * mu * DC_RHO;
  if (home === 0 && away === 1) return 1 + lambda * DC_RHO;
  if (home === 1 && away === 0) return 1 + mu * DC_RHO;
  if (home === 1 && away === 1) return 1 - DC_RHO;
  return 1;
}

export function scoreMatrix(lambda: number, mu: number, size = 8): number[][] {
  const matrix: number[][] = [];
  let total = 0;
  for (let home = 0; home < size; home += 1) {
    const row: number[] = [];
    for (let away = 0; away < size; away += 1) {
      const p = poissonPmf(home, lambda) * poissonPmf(away, mu) * dcTau(home, away, lambda, mu);
      const value = Math.max(0, p);
      row.push(value);
      total += value;
    }
    matrix.push(row);
  }
  return matrix.map((row) => row.map((p) => p / total));
}

export function expectedGoals(
  home: TeamRating,
  away: TeamRating,
  averages: LeagueAverages,
): { lambda: number; mu: number } {
  const eloAdjustment = (home.elo - away.elo) / 400;
  const lambda = clamp(
    averages.homeXg * home.attack * away.defence * Math.exp(0.10 * eloAdjustment),
    0.15,
    4.6,
  );
  const mu = clamp(
    averages.awayXg * away.attack * home.defence * Math.exp(-0.10 * eloAdjustment),
    0.15,
    4.6,
  );
  return { lambda, mu };
}

export function predictMatch(
  home: TeamRating,
  away: TeamRating,
  averages: LeagueAverages,
  homeMatches: number,
  awayMatches: number,
): Prediction {
  const { lambda, mu } = expectedGoals(home, away, averages);
  const matrix = scoreMatrix(lambda, mu, 8);

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let btts = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let homeCleanSheet = 0;
  let awayCleanSheet = 0;

  for (let h = 0; h < matrix.length; h += 1) {
    for (let a = 0; a < matrix[h].length; a += 1) {
      const p = matrix[h][a];
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
      if (h > 0 && a > 0) btts += p;
      if (h + a > 1.5) over15 += p;
      if (h + a > 2.5) over25 += p;
      if (h + a > 3.5) over35 += p;
      if (a === 0) homeCleanSheet += p;
      if (h === 0) awayCleanSheet += p;
    }
  }

  const eloDiff = home.elo + 62 - away.elo;
  const eloHomeWin = 1 / (1 + Math.pow(10, -eloDiff / 400));
  const drawShare = clamp(0.28 - Math.abs(home.elo - away.elo) * 0.00035, 0.17, 0.29);
  const eloAwayWin = 1 - eloHomeWin;
  const eloDraw = drawShare;
  const eloHome = eloHomeWin * (1 - eloDraw);
  const eloAway = eloAwayWin * (1 - eloDraw);

  const blend = 0.82;
  let probs = [homeWin, draw, awayWin];
  probs = [
    probs[0] * blend + eloHome * (1 - blend),
    probs[1] * blend + eloDraw * (1 - blend),
    probs[2] * blend + eloAway * (1 - blend),
  ];
  const sum = probs[0] + probs[1] + probs[2];
  probs = probs.map((p) => p / sum);

  const sample = clamp((homeMatches + awayMatches) / 16, 0.2, 1);
  const maxProb = Math.max(...probs);
  const confidence = clamp(((maxProb - 0.333) / 0.4) * (0.6 + 0.4 * sample), 0, 1);
  const confidenceLabel: Prediction['confidenceLabel'] =
    confidence >= 0.62 && sample > 0.7 ? 'High' : confidence >= 0.38 ? 'Medium' : 'Low';

  const scorelines: Scoreline[] = [];
  for (let h = 0; h < matrix.length; h += 1) {
    for (let a = 0; a < matrix[h].length; a += 1) {
      scorelines.push({ home: h, away: a, probability: matrix[h][a] });
    }
  }
  scorelines.sort((a, b) => b.probability - a.probability);

  return {
    homeWin: probs[0],
    draw: probs[1],
    awayWin: probs[2],
    homeXg: lambda,
    awayXg: mu,
    btts,
    over15,
    over25,
    over35,
    under25: 1 - over25,
    homeCleanSheet,
    awayCleanSheet,
    topScorelines: scorelines.slice(0, 8).map((s) => ({
      ...s,
      probability: Number(s.probability.toFixed(4)),
    })),
    matrix: matrix.map((row) => row.map((p) => Number(p.toFixed(4)))),
    confidence,
    confidenceLabel,
    eloHome: home.elo,
    eloAway: away.elo,
    eloHomeWin: eloHome,
  };
}

interface TeamAccumulator {
  teamId: string;
  matches: Array<{
    opponentId: string;
    xgFor: number;
    xgAgainst: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
    kickoff: string;
    home: boolean;
  }>;
}

function zScores(values: Map<string, number>): Map<string, number> {
  const arr = [...values.values()];
  const mean = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, arr.length);
  const sd = Math.sqrt(variance) || 1;
  return new Map([...values.entries()].map(([id, value]) => [id, (value - mean) / sd]));
}

/**
 * Opponent-adjusted attack/defence ratings from xG, with exponential time decay,
 * Bayesian shrinkage and an optional prior season. Elo is computed from results.
 */
export function computeRatings(
  matches: MatchInput[],
  prior?: Map<string, TeamRating>,
): Map<string, TeamRating> {
  const played = matches
    .filter((m) => m.isResult && m.homeGoals !== null && m.awayGoals !== null)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const averages = computeLeagueAverages(matches);
  const accumulators = new Map<string, TeamAccumulator>();

  const ensure = (id: string) => {
    if (!accumulators.has(id)) accumulators.set(id, { teamId: id, matches: [] });
    return accumulators.get(id)!;
  };

  for (const match of played) {
    const home = ensure(match.homeId);
    const away = ensure(match.awayId);
    const homeXg = match.homeXg ?? match.homeGoals ?? 0;
    const awayXg = match.awayXg ?? match.awayGoals ?? 0;
    home.matches.push({
      opponentId: match.awayId,
      xgFor: homeXg,
      xgAgainst: awayXg,
      goalsFor: match.homeGoals ?? 0,
      goalsAgainst: match.awayGoals ?? 0,
      points: (match.homeGoals ?? 0) > (match.awayGoals ?? 0) ? 3 : (match.homeGoals ?? 0) === (match.awayGoals ?? 0) ? 1 : 0,
      kickoff: match.kickoff,
      home: true,
    });
    away.matches.push({
      opponentId: match.homeId,
      xgFor: awayXg,
      xgAgainst: homeXg,
      goalsFor: match.awayGoals ?? 0,
      goalsAgainst: match.homeGoals ?? 0,
      points: (match.awayGoals ?? 0) > (match.homeGoals ?? 0) ? 3 : (match.awayGoals ?? 0) === (match.homeGoals ?? 0) ? 1 : 0,
      kickoff: match.kickoff,
      home: false,
    });
  }

  const teamIds = [...accumulators.keys()];
  const attack = new Map<string, number>();
  const defence = new Map<string, number>();
  for (const id of teamIds) {
    attack.set(id, prior?.get(id)?.attack ?? 1);
    defence.set(id, prior?.get(id)?.defence ?? 1);
  }

  const halfLife = 6;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const nextAttack = new Map<string, number>();
    const nextDefence = new Map<string, number>();
    for (const id of teamIds) {
      const acc = accumulators.get(id)!;
      const n = acc.matches.length;
      if (n === 0) {
        nextAttack.set(id, 1);
        nextDefence.set(id, 1);
        continue;
      }
      let attackNum = 0;
      let attackDen = 0;
      let defNum = 0;
      let defDen = 0;
      acc.matches.forEach((m, index) => {
        const age = n - 1 - index;
        const weight = Math.pow(0.5, age / halfLife);
        const opponentDefence = defence.get(m.opponentId) ?? 1;
        const opponentAttack = attack.get(m.opponentId) ?? 1;
        const baseFor = m.home ? averages.homeXg : averages.awayXg;
        const baseAgainst = m.home ? averages.awayXg : averages.homeXg;
        attackNum += weight * (m.xgFor / Math.max(0.2, baseFor * opponentDefence));
        attackDen += weight;
        defNum += weight * (m.xgAgainst / Math.max(0.2, baseAgainst * opponentAttack));
        defDen += weight;
      });
      const shrink = n / (n + 5);
      const rawAttack = attackDen > 0 ? attackNum / attackDen : 1;
      const rawDefence = defDen > 0 ? defNum / defDen : 1;
      let a = 1 + (rawAttack - 1) * shrink;
      let d = 1 + (rawDefence - 1) * shrink;
      const p = prior?.get(id);
      if (p) {
        const priorWeight = 3 / (n + 3);
        a = a * (1 - priorWeight) + p.attack * priorWeight;
        d = d * (1 - priorWeight) + p.defence * priorWeight;
      }
      nextAttack.set(id, clamp(a, 0.35, 2.6));
      nextDefence.set(id, clamp(d, 0.35, 2.6));
    }
    for (const [id, value] of nextAttack) attack.set(id, value);
    for (const [id, value] of nextDefence) defence.set(id, value);
  }

  // Elo, processed chronologically from the prior season's final rating.
  const elo = new Map<string, number>();
  for (const id of teamIds) elo.set(id, prior?.get(id)?.elo ?? 1500);
  for (const match of played) {
    const homeElo = elo.get(match.homeId) ?? 1500;
    const awayElo = elo.get(match.awayId) ?? 1500;
    const expected = 1 / (1 + Math.pow(10, -(homeElo + 62 - awayElo) / 400));
    const homeScore = (match.homeGoals ?? 0) > (match.awayGoals ?? 0) ? 1 : (match.homeGoals ?? 0) === (match.awayGoals ?? 0) ? 0.5 : 0;
    const diff = Math.abs((match.homeGoals ?? 0) - (match.awayGoals ?? 0));
    const mov = diff <= 1 ? 1 : diff === 2 ? 1.5 : (11 + diff) / 8;
    const k = 22;
    const delta = k * mov * (homeScore - expected);
    elo.set(match.homeId, homeElo + delta);
    elo.set(match.awayId, awayElo - delta);
  }

  const ppg = new Map<string, number>();
  const xgDiff = new Map<string, number>();
  const form = new Map<string, number>();
  for (const id of teamIds) {
    const acc = accumulators.get(id)!;
    const n = acc.matches.length || 1;
    ppg.set(id, acc.matches.reduce((sum, m) => sum + m.points, 0) / n);
    xgDiff.set(id, acc.matches.reduce((sum, m) => sum + (m.xgFor - m.xgAgainst), 0) / n);
    const last5 = acc.matches.slice(-5);
    form.set(id, last5.length ? last5.reduce((sum, m) => sum + (m.xgFor - m.xgAgainst), 0) / last5.length : 0);
  }

  const zElo = zScores(elo);
  const zXg = zScores(xgDiff);
  const zPpg = zScores(ppg);
  const zForm = zScores(form);

  const result = new Map<string, TeamRating>();
  for (const id of teamIds) {
    const composite =
      (zElo.get(id) ?? 0) * 0.45 +
      (zXg.get(id) ?? 0) * 0.3 +
      (zPpg.get(id) ?? 0) * 0.15 +
      (zForm.get(id) ?? 0) * 0.1;
    result.set(id, {
      teamId: id,
      elo: Math.round(elo.get(id) ?? 1500),
      attack: attack.get(id) ?? 1,
      defence: defence.get(id) ?? 1,
      power: clamp(50 + composite * 13, 1, 99),
      xgDiff90: xgDiff.get(id) ?? 0,
      form: form.get(id) ?? 0,
      matches: accumulators.get(id)?.matches.length ?? 0,
      pointsPerGame: ppg.get(id) ?? 0,
      priorElo: prior?.get(id)?.elo ?? 1500,
    });
  }
  return result;
}
