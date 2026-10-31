import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Search, SlidersHorizontal, UsersRound } from 'lucide-react';
import { useApi, fmtNum, fmtSigned } from '../api';
import { useApp } from '../state';
import type { Player, PlayerDetail, PlayersResponse } from '../types';
import {
  ErrorState,
  Loading,
  PageHeader,
  SectionHead,
  TeamBadge,
} from '../components/ui';
import { PlayerDrawer } from '../components/PlayerDrawer';

const SORTS = [
  { key: 'rating', label: 'Impact' },
  { key: 'attack', label: 'xG+xA / 90' },
  { key: 'goals', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
  { key: 'finishing', label: 'G − xG' },
  { key: 'creativity', label: 'xA / 90' },
  { key: 'progression', label: 'Progression' },
  { key: 'minutes', label: 'Minutes' },
];

const ROLES = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];
const MINUTES = [0, 300, 600, 900, 1200, 1800];

export function Players() {
  const { league, season, leagueInfo } = useApp();
  const [params, setParams] = useSearchParams();
  const focus = params.get('focus');
  const [sort, setSort] = useState(params.get('sort') ?? 'rating');
  const [role, setRole] = useState(params.get('role') ?? 'ALL');
  const [minMinutes, setMinMinutes] = useState(Number(params.get('minMinutes') ?? 300));
  const [query, setQuery] = useState('');
  const [player, setPlayer] = useState<Player | null>(null);
  const [expanded, setExpanded] = useState(false);
  const autoOpened = useRef<string | null>(null);

  const updateFilter = (key: string, value: string | number, fallback: string | number) => {
    const next = new URLSearchParams(params);
    if (String(value) === String(fallback)) next.delete(key);
    else next.set(key, String(value));
    setParams(next, { replace: true });
  };

  const { data, loading, error, reload } = useApi<PlayersResponse>(
    `/api/leagues/${league}/players?season=${season}&sort=${sort}&role=${role}&minMinutes=${minMinutes}&limit=400`,
  );
  const focusRequest = useApi<PlayerDetail>(
    focus && autoOpened.current !== focus ? `/api/players/${focus}?season=${season}` : null,
  );

  useEffect(() => {
    if (focusRequest.data && focus && autoOpened.current !== focus) {
      autoOpened.current = focus;
      setPlayer(focusRequest.data.player);
    }
  }, [focusRequest.data, focus]);

  useEffect(() => {
    setSort(params.get('sort') ?? 'rating');
    setRole(params.get('role') ?? 'ALL');
    setMinMinutes(Number(params.get('minMinutes') ?? 300));
  }, [params]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = query.trim().toLowerCase();
    if (!term) return data.players;
    return data.players.filter(
      (item) => item.name.toLowerCase().includes(term) || item.teamName.toLowerCase().includes(term),
    );
  }, [data, query]);

  useEffect(() => {
    setExpanded(false);
  }, [sort, role, minMinutes, query]);

  if (loading && !data) return <Loading rows={10} />;
  if (error || !data) return <ErrorState message={error ?? 'No players'} onRetry={reload} />;

  const top = data.players.slice(0, 3);
  const visible = expanded ? filtered : filtered.slice(0, 50);

  const closePlayer = () => {
    setPlayer(null);
    if (focus) {
      params.delete('focus');
      setParams(params, { replace: true });
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={<><UsersRound size={12} /> {leagueInfo?.name} · {data.season.label}</>}
        title="Player intelligence"
        subtitle="Impact ratings built from xG, xA, progression and minutes — position-aware, sample-shrunk and comparable within role."
        actions={
          <div className="page-head__actions">
            <span className="status-chip">Season context · {data.season.label}</span>
            <span className="status-chip">{data.total} qualified players</span>
          </div>
        }
      />

      <div className="podium">
        {top.map((item, index) => (
          <button className={`podium__card podium__card--${index + 1}`} key={item.id} onClick={() => setPlayer(item)}>
            <span className="podium__rank">0{index + 1}</span>
            <span className="player-avatar">{item.name.slice(0, 1)}</span>
            <span className="podium__name">{item.name}</span>
            <span className="podium__team">{item.teamName}</span>
            <span className="podium__rating">{fmtNum(item.rating, 1)}</span>
            <span className="podium__meta">
              {item.goals}G {item.assists}A · {fmtNum(item.per90.xgxa, 2)} xG+xA/90
            </span>
          </button>
        ))}
      </div>

      <div className="players-scope">
        <span><b>Scoped leaderboard.</b> Filters apply to {leagueInfo?.name} · {data.season.label} only.</span>
        <span>Use global search to jump to a player in any loaded season.</span>
      </div>

      <div className="toolbar toolbar--wrap">
        <div className="tabs tabs--scroll">
          {SORTS.map((item) => (
            <button
              key={item.key}
              className={sort === item.key ? 'tab is-active' : 'tab'}
              onClick={() => {
                setSort(item.key);
                updateFilter('sort', item.key, 'rating');
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="toolbar__controls">
          <div className="role-filter">
            {ROLES.map((item) => (
              <button
                key={item}
                className={role === item ? 'role-chip is-active' : 'role-chip'}
                onClick={() => {
                  setRole(item);
                  updateFilter('role', item, 'ALL');
                }}
              >
                {item === 'ALL' ? 'All roles' : item}
              </button>
            ))}
          </div>
          <label className="select-wrap">
            <SlidersHorizontal size={14} />
            <select
              value={minMinutes}
              aria-label="Minimum minutes"
              onChange={(event) => {
                const value = Number(event.target.value);
                setMinMinutes(value);
                updateFilter('minMinutes', value, 300);
              }}
            >
              {MINUTES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? 'Any minutes' : `${minutes}+ min`}
                </option>
              ))}
            </select>
          </label>
          <label className="input-wrap">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter players"
              aria-label="Filter players"
            />
          </label>
        </div>
      </div>

      <section className="section">
        <SectionHead
          eyebrow="Leaderboard"
          title={SORTS.find((item) => item.key === sort)?.label ?? 'Impact'}
          action={
            <span className="muted small">
              {visible.length} of {filtered.length} shown · click for profile
            </span>
          }
        />
        <div className="card card--flush table-wrap players-table-wrap">
          <table className="table players-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Team</th>
                <th>Role</th>
                <th className="num">Min</th>
                <th className="num">G</th>
                <th className="num">A</th>
                <th className="num">xG</th>
                <th className="num">xA</th>
                <th className="num">xG+xA/90</th>
                <th className="num">G−xG</th>
                <th className="num">Rating</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} onClick={() => setPlayer(item)} className="clickable">
                  <td className="rank-cell">{item.rank}</td>
                  <td>
                    <span className="player-link">
                      <span className="player-avatar player-avatar--sm">{item.name.slice(0, 1)}</span>
                      <span>
                        {item.name}
                        {item.confidence < 0.45 && <small className="low-sample">low sample</small>}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="team-inline">
                      <TeamBadge team={{ name: item.teamName, shortName: item.teamName.slice(0, 3).toUpperCase() }} size="xs" />
                      {item.teamName}
                    </span>
                  </td>
                  <td><span className={`role role--${item.role.toLowerCase()}`}>{item.role}</span></td>
                  <td className="num">{item.minutes.toLocaleString()}</td>
                  <td className="num">{item.goals}</td>
                  <td className="num">{item.assists}</td>
                  <td className="num">{fmtNum(item.xg, 1)}</td>
                  <td className="num">{fmtNum(item.xa, 1)}</td>
                  <td className="num strong">{fmtNum(item.per90.xgxa, 2)}</td>
                  <td className="num">
                    <span className={item.goalOverperformance >= 0 ? 'delta delta--up' : 'delta delta--down'}>
                      {fmtSigned(item.goalOverperformance, 1)}
                    </span>
                  </td>
                  <td className="num">
                    <span className="rating-pill">{fmtNum(item.rating, 1)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="empty">No players match these filters.</div>}
        </div>
        <div className="players-mobile">
          {visible.map((item) => (
            <button className="players-mobile__row" key={item.id} onClick={() => setPlayer(item)}>
              <span className="players-mobile__rank">{item.rank}</span>
              <span className="player-avatar player-avatar--sm">{item.name.slice(0, 1)}</span>
              <span className="players-mobile__name">
                {item.name}
                <small>{item.teamName} · {item.role}</small>
              </span>
              <span className="players-mobile__meta">
                <b>{fmtNum(item.rating, 1)}</b>
                <small>{item.goals}G {item.assists}A · {fmtNum(item.per90.xgxa, 2)} xG+xA/90</small>
              </span>
            </button>
          ))}
          {filtered.length === 0 && <div className="empty">No players match these filters.</div>}
        </div>
        {filtered.length > 50 && (
          <div className="table-more">
            <span className="muted small">
              Showing {visible.length} of {filtered.length} qualified players.
            </span>
            <button className="btn btn--ghost btn--sm" onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Show top 50' : `Show all ${filtered.length}`}
            </button>
          </div>
        )}
      </section>

      <div className="callout">
        <div>
          <div className="eyebrow">Method</div>
          <h3>What the rating is — and is not</h3>
          <p>
            Impact is a position-weighted percentile composite. It rewards on-ball production and availability, not
            defensive duels or off-ball movement. Use it as a first filter, then read the profile.
          </p>
        </div>
        <button className="btn btn--ghost" onClick={() => setPlayer(data.players[0])}>
          Open top player <ArrowUpRight size={14} />
        </button>
      </div>

      <PlayerDrawer player={player} onClose={closePlayer} />
    </>
  );
}
