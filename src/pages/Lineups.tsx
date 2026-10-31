import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Shirt, Sparkles } from 'lucide-react';
import { useApi, fmtNum, fmtSigned, timeAgo } from '../api';
import { useApp } from '../state';
import type { LineupResponse, Overview, Player } from '../types';
import {
  ErrorState,
  FormPills,
  Loading,
  PageHeader,
  SectionHead,
  TeamBadge,
} from '../components/ui';
import { Pitch } from '../components/charts';
import { PlayerDrawer } from '../components/PlayerDrawer';

const ROLE_GROUPS = ['GK', 'DEF', 'MID', 'FWD'] as const;

function MiniPitch({ formation, active = false }: { formation: string; active?: boolean }) {
  const lines = formation
    .split('-')
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part) && part > 0);
  const rows = [1, ...lines];
  return (
    <svg viewBox="0 0 80 58" className={active ? 'mini-pitch is-active' : 'mini-pitch'} aria-hidden="true">
      <rect x="1" y="1" width="78" height="56" rx="4" fill="rgba(255,255,255,0.018)" stroke="rgba(255,255,255,0.08)" />
      <line x1="1" y1="29" x2="79" y2="29" stroke="rgba(255,255,255,0.06)" />
      <circle cx="40" cy="29" r="5" fill="none" stroke="rgba(255,255,255,0.06)" />
      {rows.map((count, rowIndex) => {
        const y = 50 - (rowIndex / Math.max(1, rows.length - 1)) * 42;
        const spread = count === 1 ? 0 : Math.min(24, 58 / (count - 1));
        return Array.from({ length: count }, (_, dotIndex) => {
          const x = 40 + (dotIndex - (count - 1) / 2) * spread;
          return <circle key={`${rowIndex}-${dotIndex}`} cx={x} cy={y} r={2.2} fill={active ? 'var(--accent)' : 'rgba(232,240,234,0.28)'} />;
        });
      })}
    </svg>
  );
}

export function Lineups() {
  const { league, season, leagueInfo } = useApp();
  const [params, setParams] = useSearchParams();
  const overview = useApi<Overview>(`/api/leagues/${league}/overview?season=${season}`);
  const [teamId, setTeamId] = useState(params.get('team') ?? '');
  const [formation, setFormation] = useState<string | null>(params.get('formation'));
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!teamId && overview.data) setTeamId(overview.data.table[0]?.teamId ?? '');
  }, [overview.data, teamId]);

  useEffect(() => {
    const fromUrl = params.get('team');
    if (fromUrl) setTeamId(fromUrl);
    setFormation(params.get('formation'));
  }, [params]);

  const setContext = (nextTeam: string, nextFormation: string | null) => {
    const next = new URLSearchParams(params);
    next.set('team', nextTeam);
    if (nextFormation) next.set('formation', nextFormation);
    else next.delete('formation');
    setParams(next, { replace: true });
  };

  const chooseFormation = (next: string | null) => {
    setFormation(next);
    setContext(teamId, next);
  };

  const lineup = useApi<LineupResponse>(
    teamId
      ? `/api/leagues/${league}/lineup?season=${season}&team=${teamId}&formation=${formation ?? 'auto'}`
      : null,
  );

  const team = useMemo(
    () => overview.data?.teams.find((item) => item.id === teamId),
    [overview.data, teamId],
  );

  if (overview.loading && !overview.data) return <Loading rows={8} />;
  if (overview.error || !overview.data) return <ErrorState message={overview.error ?? 'No data'} onRetry={overview.reload} />;
  if (lineup.error) return <ErrorState message={lineup.error} onRetry={lineup.reload} />;
  if (lineup.loading && !lineup.data) return <Loading rows={6} />;
  if (!lineup.data) return <div className="empty">Select a team to build a lineup.</div>;

  const data = lineup.data;
  const avgRating = data.xi.reduce((sum, entry) => sum + entry.player.rating, 0) / Math.max(1, data.xi.length);
  const avgFit = data.xi.reduce((sum, entry) => sum + entry.roleFit, 0) / Math.max(1, data.xi.length);
  const naturalCount = data.xi.filter((entry) => entry.fit === 'natural').length;
  const adaptedCount = data.xi.filter((entry) => entry.fit === 'adapted').length;
  const outCount = data.xi.filter((entry) => entry.fit === 'out').length;
  const xiMinutes = data.xi.reduce((sum, entry) => sum + entry.player.minutes, 0);
  const benchRating = data.bench.reduce((sum, entry) => sum + entry.rating, 0) / Math.max(1, data.bench.length);
  const formations = data.formations;
  const formationScores = data.formationScores ?? [];
  const roleCounts = ROLE_GROUPS.map((role) => ({
    role,
    count: data.xi.filter((entry) => entry.group === role).length,
  }));
  const groupOrder = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;
  const orderedXi = [...data.xi].sort(
    (a, b) => groupOrder[a.group] - groupOrder[b.group] || a.x - b.x || a.y - b.y,
  );
  const fitLabel = (fit: string) => (fit === 'natural' ? 'Natural' : fit === 'adapted' ? 'Adapted' : 'Out of role');
  const teamForm = team?.form ?? [];
  const teamName = team?.name ?? data.team.name;
  const teamShort = team?.shortName ?? data.team.shortName;
  const activeFormation = formation ?? data.formation;

  return (
    <>
      <PageHeader
        eyebrow={<><Shirt size={12} /> {leagueInfo?.name} · {data.season.label}</>}
        title="Lineup lab"
        subtitle="Turn player impact, role fit and season minutes into a coherent XI. Change the shape and the model re-optimises."
        actions={
          <div className="page-head__actions">
            <span className={data.complete === false ? 'status-chip is-warn' : 'status-chip'}>
              <Sparkles size={13} /> {data.complete === false ? 'Partial projection' : 'Projected, not official'}
            </span>
            {teamId && (
              <Link to={`/teams/${teamId}`} className="btn btn--ghost">
                Team profile <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
        }
      />

      {data.complete === false && (
        <div className="callout callout--flat lineup-warning">
          <div>
            <div className="eyebrow">Incomplete projection</div>
            <h3>{data.xi.length} of 11 slots filled</h3>
            <p>
              Understat lists only {data.available} player{data.available === 1 ? '' : 's'} with minutes for{' '}
              {teamName} in {data.season.label}. The model leaves unfillable slots empty instead of inventing players.
              {data.xi.some((entry) => entry.group === 'GK') ? '' : ' No goalkeeper appears in the data.'}
            </p>
          </div>
          <Link to="/data" className="btn btn--ghost">
            Data notes <ArrowUpRight size={14} />
          </Link>
        </div>
      )}

      <div className="lineup-toolbar">
        <div className="lineup-toolbar__left">
          <label className="select-wrap select-wrap--lg lineup-team-select">
            <TeamBadge team={{ name: teamName, shortName: teamShort }} size="sm" />
            <select
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value);
                setContext(event.target.value, formation);
              }}
            >
              {overview.data.table.map((row) => (
                <option key={row.teamId} value={row.teamId}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <span className="lineup-toolbar__hint">Minutes · broad role · impact</span>
        </div>
        <div className="formation-switch" role="group" aria-label="Formation">
          <button
            className={formation === null ? 'formation-btn is-active' : 'formation-btn'}
            onClick={() => chooseFormation(null)}
            title="Let the model choose the best-fitting shape"
          >
            Auto
          </button>
          {formations.map((item) => (
            <button
              key={item.name}
              className={formation === item.name ? 'formation-btn is-active' : 'formation-btn'}
              onClick={() => chooseFormation(item.name)}
              title={item.label}
            >
              {item.name}
              {item.name === data.recommendedFormation && <span className="formation-btn__rec" aria-label="Recommended">•</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="lineup-layout">
        <section className="lineup-main">
          <div className="card lineup-pitch-card">
            <div className="lineup-pitch-card__head">
              <div className="lineup-identity">
                <TeamBadge team={{ name: teamName, shortName: teamShort }} size="lg" />
                <div>
                  <div className="eyebrow">{data.complete === false ? 'Partial XI' : 'Projected XI'}</div>
                  <h2>{teamName}</h2>
                  <span className="mono-label">{data.formationLabel}</span>
                </div>
              </div>
              <div className="lineup-pitch-card__metrics">
                <span><small>Avg rating</small><b>{fmtNum(avgRating, 1)}</b></span>
                <span><small>Broad role fit</small><b>{fmtNum(avgFit, 0)}%</b></span>
                <span><small>Natural roles</small><b>{naturalCount}/11</b></span>
                <span><small>XI minutes</small><b>{Math.round(xiMinutes / 1000)}k</b></span>
              </div>
            </div>

            <div className="lineup-context">
              <span><small>League rank</small><b>#{team?.rank ?? '—'}</b></span>
              <span><small>Power</small><b>{team ? fmtNum(team.rating.power, 0) : '—'}</b></span>
              <span><small>xGD</small><b>{team ? fmtSigned(team.stats.xgd, 1) : '—'}</b></span>
              <span className="lineup-context__form">
                <small>Form</small>
                {teamForm.length > 0 ? <FormPills form={teamForm} count={5} /> : <b>—</b>}
              </span>
            </div>

            <div className="lineup-pitch-stage">
              <div className="lineup-pitch-stage__head">
                <span><span className="live-dot" /> Re-optimised {timeAgo(overview.data.updatedAt)}</span>
                <span>Formation {data.formation}</span>
              </div>
              <Pitch lineup={data} onPlayer={setPlayer} />
              <div className="lineup-pitch-stage__legend">
                <span><i className="legend-dot legend-dot--accent" /> Selected by model</span>
                <span><i className="legend-dot" /> Click a player for profile</span>
              </div>
            </div>

            <div className="lineup-pitch-card__foot">
              <span>{data.complete === false ? `${data.xi.length} of 11 slots filled` : `${data.xi.length} starters`}</span>
              <span>·</span>
              <span>{data.bench.length} on bench</span>
              <span>·</span>
              <span>Projection, not team news</span>
            </div>
          </div>

          <div className="lineup-notes-grid">
            <div className="card lineup-logic">
              <div className="eyebrow">Selection logic</div>
              <h3>Why this XI?</h3>
              <p>{data.notes}</p>
              <div className="lineup-logic__chips">
                <span className="is-natural">{naturalCount} natural</span>
                <span>{adaptedCount} adapted</span>
                <span className={outCount > 0 ? 'is-warn' : ''}>{outCount} out of role</span>
                {data.complete === false && <span className="is-warn">{data.missing} unfilled</span>}
                <span>Recommended: {data.recommendedFormation}</span>
              </div>
            </div>

            <div className="card lineup-balance">
              <div className="eyebrow">Squad shape</div>
              <h3>Balance</h3>
              <div className="lineup-balance__rows">
                {roleCounts.map((item) => (
                  <div key={item.role}>
                    <span>{item.role}</span>
                    <i><b style={{ width: `${(item.count / Math.max(1, data.xi.length)) * 100}%` }} /></i>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
              <div className="lineup-balance__foot">
                <span>Bench avg <b>{fmtNum(benchRating, 1)}</b></span>
                <span>XI avg <b>{fmtNum(avgRating, 1)}</b></span>
              </div>
            </div>
          </div>
        </section>

        <aside className="lineup-side">
          <section className="card card--flush lineup-side-card">
            <div className="lineup-side__head">
              <div>
                <div className="eyebrow">Starting XI</div>
                <span className="lineup-side__sub">{data.xi.length} players · GK → FWD</span>
              </div>
              <span className="lineup-side__badge">{fmtNum(avgRating, 1)}</span>
            </div>
            {orderedXi.map((entry) => (
              <button className="xi-row" key={entry.slot} onClick={() => setPlayer(entry.player)} title={`${entry.player.name} · ${fitLabel(entry.fit)} · ${entry.roleFit}% broad role fit`}>
                <span className="xi-row__slot">{entry.label}</span>
                <span className="player-avatar player-avatar--sm">{entry.player.name.slice(0, 1)}</span>
                <span className="xi-row__name">
                  {entry.player.name}
                  <small>{entry.player.role} · {entry.player.goals}G {entry.player.assists}A</small>
                </span>
                <span className={`xi-row__fit is-${entry.fit}`} title={`${fitLabel(entry.fit)} role`}>
                  {entry.fit === 'natural' ? 'N' : entry.fit === 'adapted' ? 'A' : 'O'}
                </span>
                <span className="xi-row__rating">{fmtNum(entry.player.rating, 1)}</span>
              </button>
            ))}
          </section>

          <section className="card card--flush lineup-side-card">
            <div className="lineup-side__head">
              <div>
                <div className="eyebrow">Bench</div>
                <span className="lineup-side__sub">
                  {data.bench.length > 0 ? 'Next in line by impact' : 'No unused players in the data'}
                </span>
              </div>
              {data.bench.length > 0 && <span className="lineup-side__badge">{fmtNum(benchRating, 1)}</span>}
            </div>
            {data.bench.length === 0 && (
              <div className="empty">No unused players with minutes are available for this team-season.</div>
            )}
            {data.bench.map((item) => (
              <button className="xi-row" key={item.id} onClick={() => setPlayer(item)}>
                <span className="xi-row__slot">{item.role}</span>
                <span className="player-avatar player-avatar--sm">{item.name.slice(0, 1)}</span>
                <span className="xi-row__name">
                  {item.name}
                  <small>{item.minutes.toLocaleString()} min · {item.goals}G</small>
                </span>
                <span className="xi-row__fit is-muted" title="Role-fit score is shown for the starting XI">—</span>
                <span className="xi-row__rating">{fmtNum(item.rating, 1)}</span>
              </button>
            ))}
          </section>

          <div className="lineup-side__note">
            <ArrowUpRight size={14} />
            <span>
              "Natural", "Adapted" and "Out of role" use Understat's broad D/M/F position codes. Wide-versus-central
              defender assignment, wing-back versus winger, central-versus-attacking midfield roles and the recommended
              shape are model heuristics, not official team news.
            </span>
          </div>
        </aside>
      </div>

      <section className="section">
        <SectionHead
          eyebrow="Compare"
          title="Formation fit"
          action={<span className="muted small">The same players, different shapes</span>}
        />
        <div className="formation-grid">
          {formations.map((item) => {
            const meta = formationScores.find((score) => score.name === item.name);
            const active = item.name === activeFormation;
            return (
              <button
                key={item.name}
                className={active ? 'formation-card is-active' : 'formation-card'}
                onClick={() => chooseFormation(item.name)}
              >
                <MiniPitch formation={item.name} active={active} />
                <span className="formation-card__body">
                  <span className="formation-card__name">
                    {item.name}
                    {meta?.recommended && <span className="formation-card__rec">Recommended</span>}
                  </span>
                  <span className="formation-card__label">{item.label}</span>
                  <span className="formation-card__stats">
                    <span>Broad fit <b>{meta ? `${fmtNum(meta.fit, 0)}%` : '—'}</b></span>
                    <span>Shape score <b>{meta ? fmtNum(meta.score, 1) : '—'}</b></span>
                  </span>
                  <span className="formation-card__note">
                    {active ? 'Currently selected' : 'Click to rebuild the XI'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <PlayerDrawer player={player} onClose={() => setPlayer(null)} />
    </>
  );
}
