import type {
  BacktestResult,
  Insight,
  LeagueView,
  MatchView,
  PlayerView,
  SeasonView,
  SimulationResult,
  TableRow,
  TeamView,
} from './snapshot.js';
import type { LeagueAverages } from './model.js';

interface InsightInput {
  league: LeagueView;
  season: SeasonView;
  completed: boolean;
  table: TableRow[];
  teams: TeamView[];
  players: PlayerView[];
  matches: MatchView[];
  simulations: SimulationResult;
  averages: LeagueAverages;
  backtest: BacktestResult | null;
}

const pct = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`;
const fix = (value: number, digits = 1) => value.toFixed(digits);
const signed = (value: number, digits = 1) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

function confidenceFromSample(sample: number, strong = false): 'High' | 'Medium' | 'Low' {
  if (sample >= 14 && strong) return 'High';
  if (sample >= 8) return 'Medium';
  return 'Low';
}

function teamMatches(teamId: string, matches: MatchView[]): MatchView[] {
  return matches.filter(
    (m) => m.status === 'played' && (m.home.id === teamId || m.away.id === teamId),
  );
}

export function buildInsights(input: InsightInput): Insight[] {
  const { teams, players, matches, simulations, averages, backtest, completed } = input;
  const insights: Insight[] = [];
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const played = matches.filter((m) => m.status === 'played');
  const upcoming = matches.filter((m) => m.status === 'upcoming');
  const ppdaTeams = teams.filter((t) => t.stats.ppda !== null).sort((a, b) => (a.stats.ppda ?? 99) - (b.stats.ppda ?? 99));
  const ppdaRank = new Map(ppdaTeams.map((t, index) => [t.id, index + 1]));
  const eloRank = [...teams].sort((a, b) => b.rating.elo - a.rating.elo).map((t, index) => [t.id, index + 1] as const);
  const xgRank = [...teams].sort((a, b) => b.rating.xgDiff90 - a.rating.xgDiff90).map((t, index) => [t.id, index + 1] as const);
  const eloRankMap = new Map(eloRank);
  const xgRankMap = new Map(xgRank);

  for (const team of teams) {
    const stats = team.stats;
    const n = Math.max(1, stats.played);
    const goalDiff = stats.goalsFor - stats.xg;
    const defensiveDiff = stats.goalsAgainst - stats.xga;

    if (stats.played >= 6 && Math.abs(goalDiff) >= 2.6) {
      const over = goalDiff > 0;
      insights.push({
        id: `team-${team.id}-finishing`,
        type: 'team',
        category: 'Finishing',
        headline: `${team.name} are ${over ? 'outscoring' : 'underperforming'} their xG by ${fix(Math.abs(goalDiff))} goals`,
        body: over
          ? `${team.name} have scored ${stats.goalsFor} from ${fix(stats.xg)} expected goals. That ${signed(goalDiff)} gap is one of the largest in the league — either elite finishing or a signal that results are running ahead of the underlying process.`
          : `${team.name} have scored ${stats.goalsFor} from ${fix(stats.xg)} expected goals. The ${signed(goalDiff)} shortfall points to wastefulness or bad luck; shot quality says the goals should come.`,
        evidence: [
          { label: 'Goals', value: String(stats.goalsFor) },
          { label: 'xG', value: fix(stats.xg) },
          { label: 'G − xG', value: signed(goalDiff), note: `${fix(goalDiff / n, 2)} per match` },
        ],
        confidence: confidenceFromSample(stats.played, Math.abs(goalDiff) >= 6),
        teamIds: [team.id],
        score: Math.abs(goalDiff) * (0.5 + stats.played / 30),
      });
    }

    if (stats.played >= 6 && Math.abs(defensiveDiff) >= 2.6) {
      const worse = defensiveDiff > 0;
      insights.push({
        id: `team-${team.id}-defending`,
        type: 'team',
        category: 'Defence',
        headline: `${team.name} have ${worse ? 'conceded' : 'prevented'} ${fix(Math.abs(defensiveDiff))} goals ${worse ? 'more' : 'fewer'} than expected`,
        body: worse
          ? `${team.name} have shipped ${stats.goalsAgainst} goals from ${fix(stats.xga)} xGA. The gap suggests goalkeeping or finishing against them has been costly — but it is rarely sustained.`
          : `${team.name} have conceded ${stats.goalsAgainst} from ${fix(stats.xga)} xGA, a ${signed(defensiveDiff)} overperformance. Their defence is either genuinely resilient or benefiting from unsustainable shot-stopping.`,
        evidence: [
          { label: 'Goals conceded', value: String(stats.goalsAgainst) },
          { label: 'xGA', value: fix(stats.xga) },
          { label: 'GA − xGA', value: signed(defensiveDiff), note: `${fix(defensiveDiff / n, 2)} per match` },
        ],
        confidence: confidenceFromSample(stats.played, Math.abs(defensiveDiff) >= 6),
        teamIds: [team.id],
        score: Math.abs(defensiveDiff) * (0.45 + stats.played / 30),
      });
    }

    const rank = ppdaRank.get(team.id);
    if (rank && stats.played >= 6 && (rank <= 3 || rank >= teams.length - 2) && stats.ppda !== null) {
      const pressing = rank <= 3;
      insights.push({
        id: `team-${team.id}-press`,
        type: 'team',
        category: 'Tactics',
        headline: `${team.name} ${pressing ? 'press higher than almost anyone' : 'defend in a deep block'}`,
        body: pressing
          ? `${team.name} allow only ${fix(stats.ppda)} passes per defensive action — rank ${rank} of ${teams.length} for press intensity. They win the ball early, but the trade-off is space behind the line.`
          : `${team.name} allow ${fix(stats.ppda)} passes per defensive action, one of the most passive press profiles in the league. They concede territory but protect the central lane.`,
        evidence: [
          { label: 'PPDA', value: fix(stats.ppda), note: 'lower = more pressing' },
          { label: 'Press rank', value: `${rank} / ${teams.length}` },
          { label: 'Deep completions', value: fix(stats.deep / n, 1), note: 'per match' },
        ],
        confidence: confidenceFromSample(stats.played),
        teamIds: [team.id],
        score: 3.2,
      });
    }

    if (team.form.length >= 5) {
      const last5Diff = team.form.reduce((sum, m) => sum + (m.xgFor - m.xgAgainst), 0) / team.form.length;
      const seasonDiff = team.rating.xgDiff90;
      const delta = last5Diff - seasonDiff;
      if (Math.abs(delta) >= 0.45) {
        const up = delta > 0;
        insights.push({
          id: `team-${team.id}-momentum`,
          type: 'team',
          category: 'Momentum',
          headline: `${team.name} are ${up ? 'trending up' : 'slipping'} on expected goals`,
          body: `${up ? 'Over' : 'Across'} the last five matches, ${team.name} average ${signed(last5Diff, 2)} xG difference per game versus ${signed(seasonDiff, 2)} for the season. The recent process is ${up ? 'better' : 'worse'} than the headline record suggests.`,
          evidence: [
            { label: 'Last 5 xGD/90', value: signed(last5Diff, 2) },
            { label: 'Season xGD/90', value: signed(seasonDiff, 2) },
            { label: 'Change', value: signed(delta, 2) },
          ],
          confidence: 'Medium',
          teamIds: [team.id],
          score: 2.4 + Math.abs(delta),
        });
      }
    }

    const teamPlayed = teamMatches(team.id, matches);
    const homeMatches = teamPlayed.filter((m) => m.home.id === team.id);
    const awayMatches = teamPlayed.filter((m) => m.away.id === team.id);
    if (homeMatches.length >= 3 && awayMatches.length >= 3) {
      const xgDiff = (list: MatchView[]) => {
        const total = list.reduce((sum, m) => {
          const forXg = m.home.id === team.id ? m.xg?.home ?? 0 : m.xg?.away ?? 0;
          const againstXg = m.home.id === team.id ? m.xg?.away ?? 0 : m.xg?.home ?? 0;
          return sum + (forXg - againstXg);
        }, 0);
        return total / list.length;
      };
      const homeDiff = xgDiff(homeMatches);
      const awayDiff = xgDiff(awayMatches);
      if (Math.abs(homeDiff - awayDiff) >= 0.55) {
        const homeStronger = homeDiff > awayDiff;
        insights.push({
          id: `team-${team.id}-venue`,
          type: 'team',
          category: 'Venue split',
          headline: `${team.name} are ${homeStronger ? 'home-dependent' : 'stronger on the road'}`,
          body: `${team.name} average ${signed(homeDiff, 2)} xGD at home and ${signed(awayDiff, 2)} away. That ${fix(Math.abs(homeDiff - awayDiff), 2)}-per-game split is large enough to change how you price their next fixture.`,
          evidence: [
            { label: 'Home xGD/90', value: signed(homeDiff, 2) },
            { label: 'Away xGD/90', value: signed(awayDiff, 2) },
            { label: 'Split', value: signed(homeDiff - awayDiff, 2) },
          ],
          confidence: confidenceFromSample(teamPlayed.length),
          teamIds: [team.id],
          score: 2.1 + Math.abs(homeDiff - awayDiff),
        });
      }
    }

    const er = eloRankMap.get(team.id);
    const xr = xgRankMap.get(team.id);
    if (er && xr && Math.abs(er - xr) >= 4) {
      const eloBetter = er < xr;
      insights.push({
        id: `team-${team.id}-divergence`,
        type: 'team',
        category: 'Model disagreement',
        headline: `${team.name} rank ${er}th on Elo but ${xr}th on xG difference`,
        body: eloBetter
          ? `${team.name} get results that outrun their shot profile. Elo rewards points; xG says the margin is thinner. They are a candidate to regress.`
          : `${team.name} create more than their results show. The xG model is more optimistic than the table — a potential buy-low signal if the process holds.`,
        evidence: [
          { label: 'Elo rank', value: `${er}` },
          { label: 'xG diff rank', value: `${xr}` },
          { label: 'Gap', value: `${Math.abs(er - xr)} places` },
        ],
        confidence: confidenceFromSample(team.stats.played),
        teamIds: [team.id],
        score: 2.8 + Math.abs(er - xr) * 0.2,
      });
    }

    const next = team.upcoming.slice(0, 3);
    if (next.length >= 2) {
      const opponents = next.map((m) => (m.home.id === team.id ? m.away.id : m.home.id));
      const avgPower =
        opponents.reduce((sum, id) => sum + (teamById.get(id)?.rating.power ?? 50), 0) / opponents.length;
      if (avgPower >= 60 || avgPower <= 38) {
        const brutal = avgPower >= 60;
        insights.push({
          id: `team-${team.id}-schedule`,
          type: 'team',
          category: 'Schedule',
          headline: `${team.name} face a ${brutal ? 'brutal' : 'soft'} next ${next.length} fixtures`,
          body: `${brutal ? 'The next opponents' : 'The next opponents'} average a power rating of ${fix(avgPower)} (league mean 50). ${brutal ? 'Expect the underlying numbers to dip; judge them on process, not points.' : 'This is a window to bank points before the schedule stiffens.'}`,
          evidence: [
            { label: 'Opponent power', value: fix(avgPower) },
            { label: 'Fixtures', value: next.map((m) => (m.home.id === team.id ? m.away.shortName : m.home.shortName)).join(', ') },
          ],
          confidence: 'Medium',
          teamIds: [team.id],
          score: 1.9 + Math.abs(avgPower - 50) * 0.06,
        });
      }
    }
  }

  // League-wide finishing signal.
  const totalGoals = played.reduce((sum, m) => sum + (m.score?.home ?? 0) + (m.score?.away ?? 0), 0);
  const totalXg = played.reduce((sum, m) => sum + (m.xg?.home ?? 0) + (m.xg?.away ?? 0), 0);
  if (played.length >= 25) {
    const diff = totalGoals - totalXg;
    insights.push({
      id: 'league-finishing',
      type: 'league',
      category: 'League trend',
      headline: `The league has scored ${fix(Math.abs(diff))} goals ${diff >= 0 ? 'more' : 'fewer'} than xG`,
      body: `Across ${played.length} matches, ${input.league.name} has produced ${totalGoals} goals from ${fix(totalXg)} xG (${signed(diff)}). A league-wide gap is usually finishing quality and game state, not luck alone.`,
      evidence: [
        { label: 'Goals', value: String(totalGoals) },
        { label: 'xG', value: fix(totalXg) },
        { label: 'Goals per match', value: fix(totalGoals / played.length, 2) },
      ],
      confidence: played.length >= 100 ? 'High' : 'Medium',
      teamIds: [],
      score: 2.5,
    });
  }

  if (!completed && simulations.outcomes.length > 0) {
    const leader = [...simulations.outcomes].sort((a, b) => b.title - a.title)[0];
    const second = [...simulations.outcomes].sort((a, b) => b.title - a.title)[1];
    if (leader) {
      insights.push({
        id: 'league-title-race',
        type: 'league',
        category: 'Projection',
        headline: `${leader.name} win the title in ${pct(leader.title)} of simulations`,
        body:
          leader.title < 0.5 && second
            ? `The race is open. ${leader.name} are favourites but ${second.name} retain ${pct(second.title)} of the probability. ${simulations.sims.toLocaleString()} Monte Carlo seasons were run on current ratings and remaining fixtures.`
            : `${leader.name} are clear favourites after ${simulations.sims.toLocaleString()} simulated seasons. The model accounts for fixture difficulty, attack/defence strength and home advantage.`,
        evidence: [
          { label: 'Title probability', value: pct(leader.title) },
          { label: 'Top-four probability', value: pct(leader.top4) },
          { label: 'Projected points', value: fix(leader.avgPoints) },
        ],
        confidence: 'High',
        teamIds: [leader.teamId],
        score: 5.2,
      });
    }
  }

  // Model performance as an insight.
  if (backtest && backtest.matches >= 40) {
    const improvement = ((backtest.baselineLogLoss - backtest.logLoss) / backtest.baselineLogLoss) * 100;
    insights.push({
      id: 'model-performance',
      type: 'model',
      category: 'Model',
      headline: `The model beats the base rate by ${fix(improvement, 1)}% on log loss`,
      body: `Over ${backtest.matches} walk-forward matches, the Dixon-Coles xG model recorded ${fix(backtest.logLoss, 3)} log loss versus ${fix(backtest.baselineLogLoss, 3)} for the league's outcome base rates. Accuracy is ${pct(backtest.accuracy, 1)} and calibration error is ${pct(backtest.ece, 1)}.`,
      evidence: [
        { label: 'Log loss', value: fix(backtest.logLoss, 3) },
        { label: 'Baseline', value: fix(backtest.baselineLogLoss, 3) },
        { label: 'Accuracy', value: pct(backtest.accuracy, 1) },
        { label: 'ECE', value: pct(backtest.ece, 1) },
      ],
      confidence: 'High',
      teamIds: [],
      score: 5.8,
    });
  }

  // Player signals.
  const eligible = players.filter((p) => p.minutes >= 500);
  const overperformers = [...eligible]
    .filter((p) => p.role !== 'GK' && p.goals >= 5)
    .sort((a, b) => b.goalOverperformance - a.goalOverperformance)
    .slice(0, 2);
  for (const player of overperformers) {
    if (player.goalOverperformance < 2.5) continue;
    insights.push({
      id: `player-${player.id}-finishing`,
      type: 'player',
      category: 'Finishing',
      headline: `${player.name} is ${fix(player.goalOverperformance)} goals ahead of xG`,
      body: `${player.name} has scored ${player.goals} from ${fix(player.xg)} xG in ${player.minutes} minutes for ${player.teamName}. The model rates the finishing ${Math.abs(player.goalOverperformance) >= 5 ? 'extreme' : 'notable'}; expect some regression unless shot selection has genuinely changed.`,
      evidence: [
        { label: 'Goals', value: String(player.goals) },
        { label: 'xG', value: fix(player.xg) },
        { label: 'G − xG', value: signed(player.goalOverperformance) },
        { label: 'Minutes', value: String(player.minutes) },
      ],
      confidence: player.minutes >= 1200 ? 'High' : 'Medium',
      teamIds: player.teamId ? [player.teamId] : [],
      playerId: player.id,
      score: 3.4 + player.goalOverperformance * 0.25,
    });
  }

  const creators = [...eligible]
    .filter((p) => p.minutes >= 700)
    .sort((a, b) => b.per90.xa - a.per90.xa)
    .slice(0, 1);
  for (const player of creators) {
    if (player.per90.xa <= 0.25) continue;
    insights.push({
      id: `player-${player.id}-creation`,
      type: 'player',
      category: 'Creativity',
      headline: `${player.name} creates ${fix(player.per90.xa, 2)} expected assists per 90`,
      body: `${player.name} leads the league's qualified players for xA per 90 (${fix(player.per90.xa, 2)}) with ${player.assists} actual assists. The gap between expected and actual assists is a proxy for how well teammates have finished his chances.`,
      evidence: [
        { label: 'xA/90', value: fix(player.per90.xa, 2) },
        { label: 'Assists', value: String(player.assists) },
        { label: 'Key passes', value: String(player.keyPasses) },
      ],
      confidence: player.minutes >= 1200 ? 'High' : 'Medium',
      teamIds: player.teamId ? [player.teamId] : [],
      playerId: player.id,
      score: 3.1 + player.per90.xa,
    });
  }

  // Match-specific signals for the next fixtures.
  for (const match of upcoming.slice(0, 5)) {
    const home = teamById.get(match.home.id);
    const away = teamById.get(match.away.id);
    if (!home || !away) continue;

    if (match.forecast) {
      const model = [match.prediction.homeWin, match.prediction.draw, match.prediction.awayWin];
      const forecast = [match.forecast.home, match.forecast.draw, match.forecast.away];
      const divergence = Math.max(...model.map((p, i) => Math.abs(p - forecast[i])));
      if (divergence >= 0.07) {
        const index = model.map((p, i) => Math.abs(p - forecast[i])).indexOf(divergence);
        const label = ['home win', 'draw', 'away win'][index];
        const modelP = model[index];
        const forecastP = forecast[index];
        insights.push({
          id: `match-${match.id}-divergence`,
          type: 'match',
          category: 'Model vs market',
          headline: `Model and Understat disagree on ${match.home.shortName} vs ${match.away.shortName}`,
          body: `HalfSpace puts ${pct(modelP)} on the ${label}; Understat's pre-match forecast puts ${pct(forecastP)}. A ${pct(divergence)} gap is large enough to flag, but it is not a bet recommendation.`,
          evidence: [
            { label: 'HalfSpace', value: pct(modelP) },
            { label: 'Understat', value: pct(forecastP) },
            { label: 'Divergence', value: pct(divergence) },
          ],
          confidence: 'Medium',
          teamIds: [match.home.id, match.away.id],
          matchId: match.id,
          score: 3.0 + divergence * 5,
        });
      }
    }

    if (home.stats.ppda !== null && away.stats.deep > 0) {
      const pressRank = ppdaRank.get(home.id) ?? 10;
      const awayDeep = away.stats.deep / Math.max(1, away.stats.played);
      if (pressRank <= 3 && awayDeep >= 9) {
        insights.push({
          id: `match-${match.id}-press`,
          type: 'match',
          category: 'Tactical matchup',
          headline: `${home.name}'s press meets ${away.name}'s deep build-up`,
          body: `${home.name} rank ${pressRank} for press intensity (${fix(home.stats.ppda ?? 0)} PPDA), while ${away.name} average ${fix(awayDeep, 1)} deep completions per match. This is the game's defining tension: can ${away.shortName} play through the first line?`,
          evidence: [
            { label: `${home.shortName} PPDA`, value: fix(home.stats.ppda ?? 0) },
            { label: `${away.shortName} deep`, value: fix(awayDeep, 1), note: 'per match' },
            { label: 'Kickoff', value: match.kickoff.slice(0, 16).replace('T', ' ') },
          ],
          confidence: 'Medium',
          teamIds: [home.id, away.id],
          matchId: match.id,
          score: 3.3,
        });
      }
    }
  }

  // Cap team insights so the feed stays varied.
  const perTeam = new Map<string, number>();
  const filtered: Insight[] = [];
  for (const insight of insights.sort((a, b) => b.score - a.score)) {
    if (insight.type === 'team' && insight.teamIds.length === 1) {
      const count = perTeam.get(insight.teamIds[0]) ?? 0;
      if (count >= 2) continue;
      perTeam.set(insight.teamIds[0], count + 1);
    }
    filtered.push(insight);
  }

  return filtered.slice(0, 28);
}
