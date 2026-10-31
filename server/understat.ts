import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, run, setMeta, transaction } from './db.js';
import { LEAGUES, SEASON_YEARS, type LeagueConfig, seasonId, seasonLabel } from './config.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface RawHistory {
  h_a: 'h' | 'a';
  xG: number;
  xGA: number;
  npxG: number;
  npxGA: number;
  ppda: { att: number; def: number } | null;
  ppda_allowed: { att: number; def: number } | null;
  deep: number;
  deep_allowed: number;
  scored: number;
  missed: number;
  xpts: number;
  result: 'w' | 'd' | 'l';
  date: string;
}

interface RawTeam {
  id: string;
  title: string;
  history: RawHistory[];
}

interface RawMatch {
  id: string;
  isResult: boolean;
  h: { id: string; title: string; short_title: string };
  a: { id: string; title: string; short_title: string };
  goals: { h: string | null; a: string | null };
  xG: { h: string | null; a: string | null };
  datetime: string;
  forecast?: { w: string; d: string; l: string };
}

interface RawPlayer {
  id: string;
  player_name: string;
  games: string;
  time: string;
  goals: string;
  xG: string;
  assists: string;
  xA: string;
  shots: string;
  key_passes: string;
  yellow_cards: string;
  red_cards: string;
  position: string;
  team_title: string;
  npg: string;
  npxG: string;
  xGChain: string;
  xGBuildup: string;
}

export interface RawLeagueData {
  teams: Record<string, RawTeam>;
  players: RawPlayer[];
  dates: RawMatch[];
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function int(value: unknown, fallback = 0): number {
  return Math.round(num(value, fallback));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchLeagueData(
  league: LeagueConfig,
  year: number,
  force = false,
): Promise<RawLeagueData> {
  const cachePath = path.join(RAW_DIR, `${league.understat}-${year}.json`);
  if (!force && fs.existsSync(cachePath)) {
    const ageMs = Date.now() - fs.statSync(cachePath).mtimeMs;
    if (ageMs < 1000 * 60 * 60 * 6) {
      return JSON.parse(fs.readFileSync(cachePath, 'utf8')) as RawLeagueData;
    }
  }

  const url = `https://understat.com/getLeagueData/${league.understat}/${year}/`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: `https://understat.com/league/${league.understat}/${year}/`,
          'Accept-Language': 'en-GB,en;q=0.9',
        },
      });
      if (!response.ok) throw new Error(`Understat responded ${response.status}`);
      const text = await response.text();
      if (!text.trim().startsWith('{')) throw new Error('Unexpected non-JSON response from Understat');
      const data = JSON.parse(text) as RawLeagueData;
      if (!data.teams || !data.players || !data.dates) throw new Error('Incomplete Understat payload');
      fs.writeFileSync(cachePath, JSON.stringify(data));
      return data;
    } catch (error) {
      lastError = error;
      await sleep(900 * attempt);
    }
  }
  throw new Error(
    `Unable to fetch ${league.name} ${seasonLabel(year)}: ${(lastError as Error)?.message ?? 'unknown error'}`,
  );
}

function aggregateTeam(history: RawHistory[]) {
  const total = {
    played: history.length,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    xg: 0,
    xga: 0,
    npxg: 0,
    npxga: 0,
    xpts: 0,
    ppda: null as number | null,
    oppda: null as number | null,
    deep: 0,
    deepAllowed: 0,
  };
  let ppdaAtt = 0;
  let ppdaDef = 0;
  let oppdaAtt = 0;
  let oppdaDef = 0;

  for (const row of history) {
    if (row.result === 'w') total.wins += 1;
    else if (row.result === 'd') total.draws += 1;
    else total.losses += 1;
    total.goalsFor += num(row.scored);
    total.goalsAgainst += num(row.missed);
    total.xg += num(row.xG);
    total.xga += num(row.xGA);
    total.npxg += num(row.npxG);
    total.npxga += num(row.npxGA);
    total.xpts += num(row.xpts);
    total.deep += num(row.deep);
    total.deepAllowed += num(row.deep_allowed);
    if (row.ppda) {
      ppdaAtt += num(row.ppda.att);
      ppdaDef += num(row.ppda.def);
    }
    if (row.ppda_allowed) {
      oppdaAtt += num(row.ppda_allowed.att);
      oppdaDef += num(row.ppda_allowed.def);
    }
  }
  if (ppdaDef > 0) total.ppda = ppdaAtt / ppdaDef;
  if (oppdaDef > 0) total.oppda = oppdaAtt / oppdaDef;
  return total;
}

function playerTeamId(teamTitle: string, teamsByName: Map<string, string>): string | null {
  const parts = decodeEntities(teamTitle)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of [...parts].reverse()) {
    const id = teamsByName.get(part.toLowerCase());
    if (id) return id;
  }
  return null;
}

export interface IngestResult {
  league: string;
  year: number;
  teams: number;
  players: number;
  matches: number;
  played: number;
}

export async function ingestLeagueSeason(
  league: LeagueConfig,
  year: number,
  options: { force?: boolean } = {},
): Promise<IngestResult> {
  const data = await fetchLeagueData(league, year, options.force);
  const sid = seasonId(league.slug, year);
  const shortNames = new Map<string, string>();
  const teamsByName = new Map<string, string>();

  for (const match of data.dates) {
    shortNames.set(match.h.id, decodeEntities(match.h.short_title));
    shortNames.set(match.a.id, decodeEntities(match.a.short_title));
  }

  const teams = Object.values(data.teams).map((team) => {
    const title = decodeEntities(team.title);
    teamsByName.set(title.toLowerCase(), team.id);
    return { ...team, title };
  });

  const matches = [...data.dates].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const matchCount = new Map<string, number>();
  const rounds = new Map<string, number>();
  for (const match of matches) {
    const round = Math.max(matchCount.get(match.h.id) ?? 0, matchCount.get(match.a.id) ?? 0) + 1;
    rounds.set(match.id, round);
    matchCount.set(match.h.id, round);
    matchCount.set(match.a.id, round);
  }

  transaction(() => {
    run(
      `INSERT INTO leagues (id, slug, name, country, understat, accent)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, country=excluded.country,
         understat=excluded.understat, accent=excluded.accent`,
      [league.id, league.slug, league.name, league.country, league.understat, league.accent],
    );
    run(
      `INSERT INTO seasons (id, league_id, year, label) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET label=excluded.label`,
      [sid, league.id, year, seasonLabel(year)],
    );

    run('DELETE FROM matches WHERE season_id = ?', [sid]);
    run('DELETE FROM team_seasons WHERE season_id = ?', [sid]);
    run('DELETE FROM player_seasons WHERE season_id = ?', [sid]);
    run('DELETE FROM predictions WHERE season_id = ?', [sid]);
    run('DELETE FROM simulations WHERE season_id = ?', [sid]);
    run('DELETE FROM backtests WHERE season_id = ?', [sid]);

    for (const team of teams) {
      run(
        `INSERT INTO teams (id, name, short_name, league_id) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, short_name=excluded.short_name,
           league_id=excluded.league_id`,
        [team.id, team.title, shortNames.get(team.id) ?? team.title.slice(0, 3).toUpperCase(), league.id],
      );
      const agg = aggregateTeam(team.history ?? []);
      run(
        `INSERT INTO team_seasons
          (team_id, season_id, played, wins, draws, losses, goals_for, goals_against,
           xg, xga, npxg, npxga, xpts, ppda, oppda, deep, deep_allowed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(team_id, season_id) DO UPDATE SET
           played=excluded.played, wins=excluded.wins, draws=excluded.draws, losses=excluded.losses,
           goals_for=excluded.goals_for, goals_against=excluded.goals_against, xg=excluded.xg,
           xga=excluded.xga, npxg=excluded.npxg, npxga=excluded.npxga, xpts=excluded.xpts,
           ppda=excluded.ppda, oppda=excluded.oppda, deep=excluded.deep, deep_allowed=excluded.deep_allowed`,
        [
          team.id,
          sid,
          agg.played,
          agg.wins,
          agg.draws,
          agg.losses,
          agg.goalsFor,
          agg.goalsAgainst,
          agg.xg,
          agg.xga,
          agg.npxg,
          agg.npxga,
          agg.xpts,
          agg.ppda,
          agg.oppda,
          agg.deep,
          agg.deepAllowed,
        ],
      );
    }

    for (const match of matches) {
      run(
        `INSERT INTO matches
          (id, season_id, league_id, round, kickoff, home_id, away_id, home_goals, away_goals,
           home_xg, away_xg, is_result, forecast_h, forecast_d, forecast_a)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          match.id,
          sid,
          league.id,
          rounds.get(match.id) ?? 1,
          match.datetime,
          match.h.id,
          match.a.id,
          match.goals.h === null ? null : int(match.goals.h),
          match.goals.a === null ? null : int(match.goals.a),
          match.xG.h === null ? null : num(match.xG.h),
          match.xG.a === null ? null : num(match.xG.a),
          match.isResult ? 1 : 0,
          match.forecast ? num(match.forecast.w) : null,
          match.forecast ? num(match.forecast.d) : null,
          match.forecast ? num(match.forecast.l) : null,
        ],
      );
    }

    for (const player of data.players) {
      const name = decodeEntities(player.player_name);
      const teamId = playerTeamId(player.team_title, teamsByName);
      run(
        `INSERT INTO players (id, name) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name`,
        [player.id, name],
      );
      run(
        `INSERT INTO player_seasons
          (player_id, season_id, team_id, position, games, minutes, goals, assists, xg, xa,
           npg, npxg, shots, key_passes, xg_chain, xg_buildup, yellow, red)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(player_id, season_id) DO UPDATE SET
           team_id=excluded.team_id, position=excluded.position, games=excluded.games,
           minutes=excluded.minutes, goals=excluded.goals, assists=excluded.assists, xg=excluded.xg,
           xa=excluded.xa, npg=excluded.npg, npxg=excluded.npxg, shots=excluded.shots,
           key_passes=excluded.key_passes, xg_chain=excluded.xg_chain, xg_buildup=excluded.xg_buildup,
           yellow=excluded.yellow, red=excluded.red`,
        [
          player.id,
          sid,
          teamId,
          decodeEntities(player.position || ''),
          int(player.games),
          int(player.time),
          int(player.goals),
          int(player.assists),
          num(player.xG),
          num(player.xA),
          int(player.npg),
          num(player.npxG),
          int(player.shots),
          int(player.key_passes),
          num(player.xGChain),
          num(player.xGBuildup),
          int(player.yellow_cards),
          int(player.red_cards),
        ],
      );
    }
  });

  setMeta(`synced:${sid}`, new Date().toISOString());
  return {
    league: league.slug,
    year,
    teams: teams.length,
    players: data.players.length,
    matches: matches.length,
    played: matches.filter((m) => m.isResult).length,
  };
}

export async function syncAll(
  leagues: LeagueConfig[] = LEAGUES,
  years: number[] = SEASON_YEARS,
  options: { force?: boolean; onProgress?: (message: string) => void } = {},
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const league of leagues) {
    for (const year of years) {
      options.onProgress?.(`Syncing ${league.name} ${seasonLabel(year)}`);
      results.push(await ingestLeagueSeason(league, year, options));
      await sleep(650);
    }
  }
  setMeta('lastSync', new Date().toISOString());
  return results;
}
