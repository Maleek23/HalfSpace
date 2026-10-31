import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { all, get } from './db.js';
import { DEFAULT_SEASON, LEAGUES, MODEL_VERSION, SEASON_YEARS, getLeague } from './config.js';
import { buildLineup, buildTacticsBoard, getSnapshot, invalidateSnapshots, listFormations } from './engine.js';
import { syncAll } from './understat.js';
import type { MatchView, Snapshot } from './snapshot.js';

const app = express();
const PORT = Number(process.env.PORT || 8787);

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response) => {
    Promise.resolve(fn(req, res)).catch((error: Error) => {
      console.error(error);
      if (!res.headersSent) res.status(500).json({ error: error.message || 'Internal error' });
    });
  };

function liteMatch(match: MatchView) {
  const { matrix: _matrix, ...prediction } = match.prediction;
  return { ...match, prediction };
}

function seasonFrom(req: Request): number {
  const raw = Array.isArray(req.query.season) ? req.query.season[0] : req.query.season;
  const value = Number(raw);
  return SEASON_YEARS.includes(value) ? value : DEFAULT_SEASON;
}

function param(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function latestSeasonForLeague(leagueId: string): { year: number; label: string } | undefined {
  return get<{ year: number; label: string }>(
    'SELECT year, label FROM seasons WHERE league_id = ? ORDER BY year DESC LIMIT 1',
    [leagueId],
  );
}

function snapshotFor(slug: string, year: number): Snapshot {
  if (!getLeague(slug)) throw new Error('Unknown league');
  return getSnapshot(slug, year);
}

function teamContext(teamId: string): { slug: string; year: number; leagueId: string } {
  const team = get<{ league_id: string }>('SELECT league_id FROM teams WHERE id = ?', [teamId]);
  if (!team) throw new Error('Team not found');
  const league = get<{ slug: string }>('SELECT slug FROM leagues WHERE id = ?', [team.league_id]);
  if (!league) throw new Error('League not found');
  const latest = latestSeasonForLeague(team.league_id);
  return { slug: league.slug, year: latest?.year ?? DEFAULT_SEASON, leagueId: team.league_id };
}

function matchContext(matchId: string) {
  const row = get<{ season_id: string; league_id: string; home_id: string; away_id: string; kickoff: string }>(
    'SELECT season_id, league_id, home_id, away_id, kickoff FROM matches WHERE id = ?',
    [matchId],
  );
  if (!row) throw new Error('Match not found');
  const season = get<{ year: number }>('SELECT year FROM seasons WHERE id = ?', [row.season_id]);
  const league = get<{ slug: string }>('SELECT slug FROM leagues WHERE id = ?', [row.league_id]);
  if (!season || !league) throw new Error('Season not found');
  return { ...row, slug: league.slug, year: season.year };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, modelVersion: MODEL_VERSION, time: new Date().toISOString() });
});

app.get(
  '/api/bootstrap',
  asyncHandler((_req, res) => {
    const seasons = all<{ id: string; league_id: string; year: number; label: string }>(
      'SELECT * FROM seasons ORDER BY year DESC, league_id',
    );
    const coverage = LEAGUES.map((league) => {
      const season = seasons.find((s) => s.league_id === league.id && s.year === DEFAULT_SEASON);
      const counts = season
        ? get<{ matches: number; played: number; teams: number; players: number }>(
            `SELECT
               (SELECT COUNT(*) FROM matches WHERE season_id = ?) AS matches,
               (SELECT COUNT(*) FROM matches WHERE season_id = ? AND is_result = 1) AS played,
               (SELECT COUNT(*) FROM team_seasons WHERE season_id = ?) AS teams,
               (SELECT COUNT(*) FROM player_seasons WHERE season_id = ?) AS players`,
            [season.id, season.id, season.id, season.id],
          )
        : null;
      return {
        league: league.slug,
        name: league.name,
        year: season?.year ?? null,
        label: season?.label ?? null,
        matches: counts?.matches ?? 0,
        played: counts?.played ?? 0,
        teams: counts?.teams ?? 0,
        players: counts?.players ?? 0,
      };
    });
    res.json({
      leagues: LEAGUES.map(({ slug, name, country, accent }) => ({ slug, name, country, accent })),
      seasons: SEASON_YEARS,
      defaultSeason: DEFAULT_SEASON,
      modelVersion: MODEL_VERSION,
      formations: listFormations(),
      coverage,
      lastSync: get<{ value: string }>('SELECT value FROM meta WHERE key = ?', ['lastSync'])?.value ?? null,
    });
  }),
);

app.get(
  '/api/leagues/:slug/overview',
  asyncHandler((req, res) => {
    const snapshot = snapshotFor(param(req, 'slug'), seasonFrom(req));
    const upcoming = snapshot.matches.filter((m) => m.status === 'upcoming').slice(0, 10).map(liteMatch);
    const results = snapshot.matches
      .filter((m) => m.status === 'played')
      .slice(-8)
      .reverse()
      .map(liteMatch);
    res.json({
      league: snapshot.league,
      season: snapshot.season,
      updatedAt: snapshot.updatedAt,
      completed: snapshot.completed,
      averages: snapshot.averages,
      table: snapshot.table,
      teams: snapshot.teams.map((team) => ({
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        rank: team.rank,
        rating: team.rating,
        stats: team.stats,
        form: team.form,
      })),
      upcoming,
      results,
      simulations: snapshot.simulations,
      backtest: snapshot.backtest,
      insights: snapshot.insights.slice(0, 6),
      coverage: snapshot.coverage,
      topPlayers: snapshot.players.slice(0, 5),
    });
  }),
);

app.get(
  '/api/leagues/:slug/matches',
  asyncHandler((req, res) => {
    const snapshot = snapshotFor(param(req, 'slug'), seasonFrom(req));
    const status = String(req.query.status ?? 'upcoming');
    let matches = snapshot.matches;
    if (status === 'upcoming') matches = matches.filter((m) => m.status === 'upcoming');
    else if (status === 'results') matches = matches.filter((m) => m.status === 'played').reverse();
    res.json({
      league: snapshot.league,
      season: snapshot.season,
      matches: matches.map(liteMatch),
      counts: {
        all: snapshot.matches.length,
        upcoming: snapshot.matches.filter((m) => m.status === 'upcoming').length,
        results: snapshot.matches.filter((m) => m.status === 'played').length,
      },
    });
  }),
);

app.get(
  '/api/matches/:id',
  asyncHandler((req, res) => {
    const context = matchContext(param(req, 'id'));
    const snapshot = snapshotFor(context.slug, context.year);
    const match = snapshot.matches.find((m) => m.id === param(req, 'id'));
    if (!match) throw new Error('Match not found');
    const home = snapshot.teams.find((t) => t.id === match.home.id);
    const away = snapshot.teams.find((t) => t.id === match.away.id);
    const h2h = all<{
      id: string;
      kickoff: string;
      home_id: string;
      away_id: string;
      home_goals: number;
      away_goals: number;
      season_id: string;
    }>(
      `SELECT id, kickoff, home_id, away_id, home_goals, away_goals, season_id
         FROM matches
        WHERE is_result = 1
          AND ((home_id = ? AND away_id = ?) OR (home_id = ? AND away_id = ?))
        ORDER BY kickoff DESC LIMIT 6`,
      [match.home.id, match.away.id, match.away.id, match.home.id],
    ).map((row) => {
      const season = get<{ label: string }>('SELECT label FROM seasons WHERE id = ?', [row.season_id]);
      return {
        id: row.id,
        kickoff: row.kickoff,
        season: season?.label ?? '',
        home: row.home_id === match.home.id ? match.home : match.away,
        away: row.away_id === match.away.id ? match.away : match.home,
        homeGoals: row.home_goals,
        awayGoals: row.away_goals,
      };
    });
    res.json({
      league: snapshot.league,
      season: snapshot.season,
      match,
      lineups: {
        home: buildLineup(snapshot, match.home.id),
        away: buildLineup(snapshot, match.away.id),
      },
      teams: { home, away },
      h2h,
      insights: snapshot.insights.filter(
        (insight) =>
          insight.matchId === match.id ||
          (insight.teamIds.includes(match.home.id) && insight.teamIds.includes(match.away.id)),
      ),
      formations: listFormations(),
    });
  }),
);

app.get(
  '/api/leagues/:slug/ratings',
  asyncHandler((req, res) => {
    const snapshot = snapshotFor(param(req, 'slug'), seasonFrom(req));
    res.json({
      league: snapshot.league,
      season: snapshot.season,
      updatedAt: snapshot.updatedAt,
      table: snapshot.table,
      simulations: snapshot.simulations,
      backtest: snapshot.backtest,
      averages: snapshot.averages,
      coverage: snapshot.coverage,
    });
  }),
);

app.get(
  '/api/teams/:id',
  asyncHandler((req, res) => {
    const context = teamContext(param(req, 'id'));
    const yearParam = Number(Array.isArray(req.query.season) ? req.query.season[0] : req.query.season);
    const year = SEASON_YEARS.includes(yearParam) ? yearParam : context.year;
    const snapshot = snapshotFor(context.slug, year);
    const team = snapshot.teams.find((t) => t.id === param(req, 'id'));
    if (!team) throw new Error('Team not found for this season');
    const squad = snapshot.players
      .filter((player) => player.teamId === team.id)
      .sort((a, b) => b.minutes - a.minutes);
    res.json({
      league: snapshot.league,
      season: snapshot.season,
      team,
      squad,
      lineup: buildLineup(snapshot, team.id),
      insights: snapshot.insights.filter((insight) => insight.teamIds.includes(team.id)),
      formations: listFormations(),
    });
  }),
);

app.get(
  '/api/leagues/:slug/players',
  asyncHandler((req, res) => {
    const snapshot = snapshotFor(param(req, 'slug'), seasonFrom(req));
    const sort = String(req.query.sort ?? 'rating');
    const role = String(req.query.role ?? 'ALL');
    const team = String(req.query.team ?? '');
    const minMinutes = Number(req.query.minMinutes ?? 300);
    const limit = Math.min(400, Math.max(1, Number(req.query.limit ?? 100)));
    let players = snapshot.players.filter((player) => player.minutes >= minMinutes);
    if (role !== 'ALL') players = players.filter((player) => player.role === role);
    if (team) players = players.filter((player) => player.teamId === team);
    const sorters: Record<string, (a: (typeof players)[number], b: (typeof players)[number]) => number> = {
      rating: (a, b) => b.rating - a.rating,
      attack: (a, b) => b.per90.xgxa - a.per90.xgxa,
      goals: (a, b) => b.goals - a.goals,
      assists: (a, b) => b.assists - a.assists,
      finishing: (a, b) => b.goalOverperformance - a.goalOverperformance,
      creativity: (a, b) => b.per90.xa - a.per90.xa,
      progression: (a, b) => b.per90.xgChain - a.per90.xgChain,
      minutes: (a, b) => b.minutes - a.minutes,
    };
    players = [...players].sort(sorters[sort] ?? sorters.rating);
    res.json({
      league: snapshot.league,
      season: snapshot.season,
      players: players.slice(0, limit),
      total: players.length,
      sort,
    });
  }),
);

app.get(
  '/api/players/:id',
  asyncHandler((req, res) => {
    const seasons = all<{ season_id: string; year: number; league_id: string }>(
      `SELECT ps.season_id, s.year, s.league_id
         FROM player_seasons ps JOIN seasons s ON s.id = ps.season_id
        WHERE ps.player_id = ? ORDER BY s.year DESC`,
      [param(req, 'id')],
    );
    const requested = Number(Array.isArray(req.query.season) ? req.query.season[0] : req.query.season);
    const target = SEASON_YEARS.includes(requested)
      ? seasons.find((s) => s.year === requested) ?? seasons[0]
      : seasons[0];
    if (!target) throw new Error('Player not found');
    const season = get<{ year: number }>('SELECT year FROM seasons WHERE id = ?', [target.season_id]);
    const league = get<{ slug: string }>('SELECT slug FROM leagues WHERE id = ?', [target.league_id]);
    if (!season || !league) throw new Error('Season not found');
    const snapshot = snapshotFor(league.slug, season.year);
    const player = snapshot.players.find((p) => p.id === param(req, 'id'));
    if (!player) throw new Error('Player not found in this season');
    const peers = snapshot.players
      .filter((p) => p.role === player.role && p.id !== player.id)
      .sort((a, b) => Math.abs(a.rating - player.rating) - Math.abs(b.rating - player.rating))
      .slice(0, 5);
    res.json({
      league: snapshot.league,
      season: snapshot.season,
      player,
      peers,
      team: snapshot.teams.find((t) => t.id === player.teamId) ?? null,
    });
  }),
);

app.get(
  '/api/leagues/:slug/lineup',
  asyncHandler((req, res) => {
    const snapshot = snapshotFor(param(req, 'slug'), seasonFrom(req));
    const teamId = String(req.query.team ?? '');
    const formation = String(req.query.formation ?? 'auto');
    if (!teamId) throw new Error('A team id is required');
    res.json({
      league: snapshot.league,
      season: snapshot.season,
      formations: listFormations(),
      ...buildLineup(snapshot, teamId, formation === 'auto' ? undefined : formation),
    });
  }),
);

app.get(
  '/api/leagues/:slug/tactics',
  asyncHandler((req, res) => {
    const snapshot = snapshotFor(param(req, 'slug'), seasonFrom(req));
    res.json(buildTacticsBoard(snapshot));
  }),
);

app.get(
  '/api/leagues/:slug/insights',
  asyncHandler((req, res) => {
    const snapshot = snapshotFor(param(req, 'slug'), seasonFrom(req));
    const type = String(req.query.type ?? 'ALL');
    const confidence = String(req.query.confidence ?? 'ALL');
    let insights = snapshot.insights;
    if (type !== 'ALL') insights = insights.filter((insight) => insight.type === type);
    if (confidence !== 'ALL') insights = insights.filter((insight) => insight.confidence === confidence);
    res.json({
      league: snapshot.league,
      season: snapshot.season,
      insights,
      counts: {
        all: snapshot.insights.length,
        team: snapshot.insights.filter((i) => i.type === 'team').length,
        player: snapshot.insights.filter((i) => i.type === 'player').length,
        match: snapshot.insights.filter((i) => i.type === 'match').length,
        league: snapshot.insights.filter((i) => i.type === 'league').length,
        model: snapshot.insights.filter((i) => i.type === 'model').length,
      },
    });
  }),
);

app.get(
  '/api/leagues/:slug/model',
  asyncHandler((req, res) => {
    const snapshot = snapshotFor(param(req, 'slug'), seasonFrom(req));
    res.json({
      league: snapshot.league,
      season: snapshot.season,
      modelVersion: MODEL_VERSION,
      backtest: snapshot.backtest,
      averages: snapshot.averages,
      coverage: snapshot.coverage,
      completed: snapshot.completed,
      simulations: snapshot.simulations,
      updatedAt: snapshot.updatedAt,
    });
  }),
);

app.get(
  '/api/data',
  asyncHandler((_req, res) => {
    const coverage = [];
    for (const league of LEAGUES) {
      for (const year of SEASON_YEARS) {
        const season = get<{ id: string; label: string }>('SELECT id, label FROM seasons WHERE league_id = ? AND year = ?', [
          league.id,
          year,
        ]);
        if (!season) continue;
        const counts = get<{ matches: number; played: number; teams: number; players: number }>(
          `SELECT
             (SELECT COUNT(*) FROM matches WHERE season_id = ?) AS matches,
             (SELECT COUNT(*) FROM matches WHERE season_id = ? AND is_result = 1) AS played,
             (SELECT COUNT(*) FROM team_seasons WHERE season_id = ?) AS teams,
             (SELECT COUNT(*) FROM player_seasons WHERE season_id = ?) AS players`,
          [season.id, season.id, season.id, season.id],
        );
        coverage.push({
          league: league.slug,
          leagueName: league.name,
          year,
          label: season.label,
          matches: counts?.matches ?? 0,
          played: counts?.played ?? 0,
          teams: counts?.teams ?? 0,
          players: counts?.players ?? 0,
          syncedAt: get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [`synced:${season.id}`])?.value ?? null,
        });
      }
    }
    res.json({
      modelVersion: MODEL_VERSION,
      lastSync: get<{ value: string }>('SELECT value FROM meta WHERE key = ?', ['lastSync'])?.value ?? null,
      coverage,
      sources: [
        {
          name: 'Understat',
          role: 'Primary',
          provides: 'Match results, xG, xGA, npxG, PPDA, deep completions, player season totals',
          url: 'https://understat.com',
          license: 'Public web data. Respect robots.txt and rate limits.',
          freshness: 'On demand; cached for 6 hours',
        },
        {
          name: 'football-data.co.uk',
          role: 'Planned',
          provides: 'Closing odds, shots, cards, corners for market benchmarks',
          url: 'https://www.football-data.co.uk',
          license: 'Free for personal use',
          freshness: 'Not yet ingested',
        },
        {
          name: 'StatsBomb Open Data',
          role: 'Planned',
          provides: 'Event-level passes, carries, pressure and shot locations',
          url: 'https://github.com/statsbomb/open-data',
          license: 'Open data licence, attribution required',
          freshness: 'Selected historical competitions only',
        },
      ],
    });
  }),
);

app.post(
  '/api/sync',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { league?: string; year?: number; force?: boolean };
    const leagues = body.league ? [getLeague(body.league)].filter(Boolean) : LEAGUES;
    if (body.league && leagues.length === 0) throw new Error('Unknown league');
    const years = body.year && SEASON_YEARS.includes(Number(body.year)) ? [Number(body.year)] : SEASON_YEARS;
    const results = await syncAll(leagues as typeof LEAGUES, years, { force: Boolean(body.force) });
    invalidateSnapshots();
    res.json({ ok: true, results, syncedAt: new Date().toISOString() });
  }),
);

app.get(
  '/api/search',
  asyncHandler((req, res) => {
    const query = String(req.query.q ?? '').trim();
    const requested = Number(Array.isArray(req.query.season) ? req.query.season[0] : req.query.season);
    const seasonFilter = SEASON_YEARS.includes(requested) ? requested : null;
    if (query.length < 2) return res.json({ teams: [], players: [] });
    const like = `%${query}%`;
    const teams = all<{ id: string; name: string; short_name: string; slug: string }>(
      `SELECT t.id, t.name, t.short_name, l.slug
         FROM teams t JOIN leagues l ON l.id = t.league_id
        WHERE t.name LIKE ? LIMIT 8`,
      [like],
    );
    const players = seasonFilter
      ? all<{ id: string; name: string; team_name: string; slug: string; season: number }>(
          `SELECT p.id, p.name, t.name AS team_name, l.slug, ? AS season
             FROM players p
             JOIN player_seasons ps ON ps.player_id = p.id
             JOIN seasons s ON s.id = ps.season_id
             JOIN leagues l ON l.id = s.league_id
             LEFT JOIN teams t ON t.id = ps.team_id
            WHERE p.name LIKE ? AND s.year = ?
            ORDER BY ps.minutes DESC
            LIMIT 8`,
          [seasonFilter, like, seasonFilter],
        )
      : String(req.query.history ?? '') === '1'
        ? all<{ id: string; name: string; team_name: string; slug: string; season: number }>(
            `SELECT p.id, p.name, t.name AS team_name, l.slug, s.year AS season
               FROM players p
               JOIN player_seasons ps ON ps.player_id = p.id
               JOIN seasons s ON s.id = ps.season_id
               JOIN leagues l ON l.id = s.league_id
               LEFT JOIN teams t ON t.id = ps.team_id
              WHERE p.name LIKE ?
              ORDER BY s.year DESC, ps.minutes DESC
              LIMIT 14`,
            [like],
          )
        : all<{ id: string; name: string; team_name: string; slug: string; season: number }>(
          `WITH ranked AS (
             SELECT p.id, p.name, t.name AS team_name, l.slug, s.year,
                    ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY s.year DESC, ps.minutes DESC) AS rn
               FROM players p
               JOIN player_seasons ps ON ps.player_id = p.id
               JOIN seasons s ON s.id = ps.season_id
               JOIN leagues l ON l.id = s.league_id
               LEFT JOIN teams t ON t.id = ps.team_id
              WHERE p.name LIKE ?
           )
           SELECT id, name, team_name, slug, year AS season
             FROM ranked WHERE rn = 1
            ORDER BY name
            LIMIT 8`,
          [like],
        );
    res.json({ teams, players });
  }),
);

const dist = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`HalfSpace API listening on http://localhost:${PORT}`);
});
