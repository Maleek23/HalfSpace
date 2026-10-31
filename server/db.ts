import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
export const RAW_DIR = path.join(DATA_DIR, 'raw');
fs.mkdirSync(RAW_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'halfspace.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leagues (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      country TEXT NOT NULL,
      understat TEXT NOT NULL,
      accent TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      label TEXT NOT NULL,
      UNIQUE (league_id, year)
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      league_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_seasons (
      team_id TEXT NOT NULL,
      season_id TEXT NOT NULL,
      played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      goals_for INTEGER NOT NULL DEFAULT 0,
      goals_against INTEGER NOT NULL DEFAULT 0,
      xg REAL NOT NULL DEFAULT 0,
      xga REAL NOT NULL DEFAULT 0,
      npxg REAL NOT NULL DEFAULT 0,
      npxga REAL NOT NULL DEFAULT 0,
      xpts REAL NOT NULL DEFAULT 0,
      ppda REAL,
      oppda REAL,
      deep INTEGER NOT NULL DEFAULT 0,
      deep_allowed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (team_id, season_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL,
      league_id TEXT NOT NULL,
      round INTEGER NOT NULL,
      kickoff TEXT NOT NULL,
      home_id TEXT NOT NULL,
      away_id TEXT NOT NULL,
      home_goals INTEGER,
      away_goals INTEGER,
      home_xg REAL,
      away_xg REAL,
      is_result INTEGER NOT NULL DEFAULT 0,
      forecast_h REAL,
      forecast_d REAL,
      forecast_a REAL
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_seasons (
      player_id TEXT NOT NULL,
      season_id TEXT NOT NULL,
      team_id TEXT,
      position TEXT NOT NULL,
      games INTEGER NOT NULL DEFAULT 0,
      minutes INTEGER NOT NULL DEFAULT 0,
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      xg REAL NOT NULL DEFAULT 0,
      xa REAL NOT NULL DEFAULT 0,
      npg INTEGER NOT NULL DEFAULT 0,
      npxg REAL NOT NULL DEFAULT 0,
      shots INTEGER NOT NULL DEFAULT 0,
      key_passes INTEGER NOT NULL DEFAULT 0,
      xg_chain REAL NOT NULL DEFAULT 0,
      xg_buildup REAL NOT NULL DEFAULT 0,
      yellow INTEGER NOT NULL DEFAULT 0,
      red INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, season_id)
    );

    CREATE TABLE IF NOT EXISTS ratings (
      team_id TEXT NOT NULL,
      season_id TEXT NOT NULL,
      elo REAL NOT NULL,
      attack REAL NOT NULL,
      defence REAL NOT NULL,
      power REAL NOT NULL,
      xg_diff90 REAL NOT NULL,
      ppda REAL,
      deep90 REAL NOT NULL,
      form REAL NOT NULL,
      PRIMARY KEY (team_id, season_id)
    );

    CREATE TABLE IF NOT EXISTS predictions (
      match_id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL,
      home_win REAL NOT NULL,
      draw REAL NOT NULL,
      away_win REAL NOT NULL,
      home_xg REAL NOT NULL,
      away_xg REAL NOT NULL,
      btts REAL NOT NULL,
      over25 REAL NOT NULL,
      confidence REAL NOT NULL,
      model_version TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS simulations (
      season_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backtests (
      season_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_matches_season ON matches (season_id, kickoff);
    CREATE INDEX IF NOT EXISTS idx_team_seasons_season ON team_seasons (season_id);
    CREATE INDEX IF NOT EXISTS idx_player_seasons_season ON player_seasons (season_id, team_id);
  `);
}

export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[];
}

export function get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): void {
  db.prepare(sql).run(...(params as never[]));
}

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function setMeta(key: string, value: string): void {
  run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export function getMeta(key: string): string | undefined {
  return get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])?.value;
}

migrate();
