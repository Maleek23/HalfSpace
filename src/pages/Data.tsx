import { useState } from 'react';
import { ArrowUpRight, Database, DownloadCloud, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { apiPost, useApi, timeAgo } from '../api';
import { useApp } from '../state';
import type { DataStatus } from '../types';
import { ErrorState, Loading, PageHeader, SectionHead, Stat } from '../components/ui';

const ENDPOINTS = [
  ['GET', '/api/bootstrap', 'Leagues, seasons, coverage and model version'],
  ['GET', '/api/leagues/:slug/overview', 'Dashboard payload: table, fixtures, sims, insights'],
  ['GET', '/api/leagues/:slug/matches', 'Fixture list with model probabilities'],
  ['GET', '/api/matches/:id', 'Full match card, scoreline matrix, markets, XIs'],
  ['GET', '/api/leagues/:slug/ratings', 'Power ratings, simulations and backtest'],
  ['GET', '/api/teams/:id', 'Team profile, squad, projected XI, signals'],
  ['GET', '/api/leagues/:slug/players', 'Filterable player leaderboard'],
  ['GET', '/api/leagues/:slug/lineup', 'Formation-aware projected XI'],
  ['GET', '/api/leagues/:slug/insights', 'Evidence-backed insight feed'],
  ['GET', '/api/leagues/:slug/model', 'Model card and calibration metrics'],
  ['POST', '/api/sync', 'Re-ingest Understat data and rebuild outputs'],
];

export function Data() {
  const { league, season, leagueInfo, refreshBootstrap } = useApp();
  const { data, loading, error, reload } = useApi<DataStatus>('/api/data');
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading && !data) return <Loading rows={8} />;
  if (error || !data) return <ErrorState message={error ?? 'No data status'} onRetry={reload} />;

  const sync = async (scope: 'current' | 'all') => {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await apiPost<{ results: Array<{ league: string; year: number; matches: number; played: number }> }>(
        '/api/sync',
        scope === 'current' ? { league, year: season } : {},
      );
      setMessage(`Synced ${result.results.length} league-season${result.results.length === 1 ? '' : 's'} successfully.`);
      reload();
      refreshBootstrap();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const totalMatches = data.coverage.reduce((sum, row) => sum + row.matches, 0);
  const totalPlayed = data.coverage.reduce((sum, row) => sum + row.played, 0);
  const totalPlayers = data.coverage.reduce((sum, row) => sum + row.players, 0);

  return (
    <>
      <PageHeader
        eyebrow={<><Database size={12} /> System · provenance</>}
        title="Data & pipeline"
        subtitle="Where the numbers come from, what is covered, and how to rebuild the model. No black boxes, no invisible joins."
        actions={
          <button className="btn btn--primary" onClick={() => sync('current')} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Syncing…' : 'Sync this league'}
          </button>
        }
      />

      {message && <div className="toast">{message}</div>}

      <div className="stat-strip">
        <Stat label="League-seasons" value={data.coverage.length} hint="across five competitions" />
        <Stat label="Fixtures" value={totalMatches.toLocaleString()} hint={`${totalPlayed.toLocaleString()} played`} tone="accent" />
        <Stat label="Player rows" value={totalPlayers.toLocaleString()} hint="season-level records" />
        <Stat label="Last sync" value={timeAgo(data.lastSync)} hint={data.lastSync ? new Date(data.lastSync).toLocaleString('en-GB') : 'Never'} />
        <Stat label="Model" value={data.modelVersion} hint="production version" />
        <Stat label="Storage" value="SQLite" hint="local, inspectable" />
      </div>

      <section className="section">
        <SectionHead
          eyebrow="Sources"
          title="The data stack"
          action={
            <button className="btn btn--ghost btn--sm" onClick={() => sync('all')} disabled={syncing}>
              <DownloadCloud size={14} /> Sync all competitions
            </button>
          }
        />
        <div className="source-grid">
          {data.sources.map((source) => (
            <article className="source-card source-card--lg" key={source.name}>
              <div className="source-card__top">
                <span className="source-card__name">{source.name}</span>
                <span className={`source-badge ${source.role === 'Primary' ? 'source-badge--live' : ''}`}>{source.role}</span>
              </div>
              <p>{source.provides}</p>
              <dl>
                <div><dt>Licence</dt><dd>{source.license}</dd></div>
                <div><dt>Refresh</dt><dd>{source.freshness}</dd></div>
              </dl>
              <a href={source.url} target="_blank" rel="noreferrer" className="text-link">
                Source <ArrowUpRight size={13} />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Coverage" title="What is loaded" />
        <div className="card card--flush table-wrap">
          <table className="table coverage-table">
            <thead>
              <tr>
                <th>Competition</th>
                <th>Season</th>
                <th className="num">Teams</th>
                <th className="num">Players</th>
                <th className="num">Played</th>
                <th>Completeness</th>
                <th>Last sync</th>
              </tr>
            </thead>
            <tbody>
              {data.coverage.map((row) => {
                const pct = row.matches ? (row.played / row.matches) * 100 : 0;
                return (
                  <tr key={`${row.league}-${row.year}`}>
                    <td>
                      <span className="source-inline">
                        <span className="league-dot" />
                        {row.leagueName}
                      </span>
                    </td>
                    <td>{row.label}</td>
                    <td className="num">{row.teams}</td>
                    <td className="num">{row.players}</td>
                    <td className="num">{row.played} / {row.matches}</td>
                    <td>
                      <div className="coverage-bar">
                        <span style={{ width: `${pct}%` }} />
                        <b>{Math.round(pct)}%</b>
                      </div>
                    </td>
                    <td className="muted small">{timeAgo(row.syncedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="table-legend">
          “Played” counts completed fixtures. The current season shows partial completion; historical seasons should be 100%.
        </p>
      </section>

      <div className="split">
        <section className="section">
          <SectionHead eyebrow="Contract" title="API surface" />
          <div className="card card--flush api-list">
            {ENDPOINTS.map(([method, path, description]) => (
              <div className="api-row" key={`${method}-${path}`}>
                <span className={`method method--${method.toLowerCase()}`}>{method}</span>
                <code>{path}</code>
                <span className="muted small">{description}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <SectionHead eyebrow="Integrity" title="Pipeline rules" />
          <div className="card rules">
            <div className="rule"><ShieldCheck size={16} /><span><b>Walk-forward backtests.</b> Historical matches are priced only with data available before kickoff. No leakage from future results.</span></div>
            <div className="rule"><Server size={16} /><span><b>Single source of truth.</b> SQLite stores raw provider fields; ratings, simulations and insights are derived and versioned.</span></div>
            <div className="rule"><RefreshCw size={16} /><span><b>Idempotent syncs.</b> Re-syncing a season replaces its rows instead of duplicating them.</span></div>
            <div className="rule"><Database size={16} /><span><b>Rates over totals.</b> Per-90, per-match and percentile views prevent volume from masquerading as quality.</span></div>
            <div className="rule"><ShieldCheck size={16} /><span><b>Uncertainty stated.</b> Every projection carries a confidence label; every insight states its evidence.</span></div>
          </div>
        </section>
      </div>

      <div className="callout">
        <div>
          <div className="eyebrow">Current context</div>
          <h3>{leagueInfo?.name} · {season}/{String(season + 1).slice(-2)}</h3>
          <p>
            Syncing this league replaces its fixtures, team-season aggregates, player rows and all derived outputs. The
            first page load after a sync may take a few seconds while ratings and 3,000 simulations rebuild.
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => sync('current')} disabled={syncing}>
          <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Working…' : `Sync ${leagueInfo?.name}`}
        </button>
      </div>
    </>
  );
}
