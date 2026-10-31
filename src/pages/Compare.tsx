import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { apiGet, useApi, fmtNum, fmtPct, fmtSigned } from '../api';
import { useApp } from '../state';
import type { Player, PlayersResponse } from '../types';
import {
  ErrorState,
  Loading,
  PageHeader,
  SectionHead,
} from '../components/ui';

interface Side {
  league: string;
  season: number;
  playerId: string;
}

interface SearchPlayerResult {
  id: string;
  name: string;
  team_name: string;
  slug: string;
  season: number;
}

const DEFAULT_LEFT: Side = { league: 'premier-league', season: 2018, playerId: '701' };
const DEFAULT_RIGHT: Side = { league: 'premier-league', season: 2018, playerId: '1250' };

function npxgPerShot(player: Player) {
  return player.shots > 0 ? player.npxg / player.shots : 0;
}

function conversion(player: Player) {
  return player.shots > 0 ? player.goals / player.shots : 0;
}

function nonPenaltyOverperformance(player: Player) {
  return player.npg - player.npxg;
}

function attackValue(player: Player) {
  return player.per90.npxg + player.per90.xa;
}

function comparison(a: number, b: number): 'a' | 'b' | 'tie' {
  if (Math.abs(a - b) < 0.005) return 'tie';
  return a > b ? 'a' : 'b';
}

function PlayerPicker({
  side,
  value,
  onChange,
  data,
  loading,
  accent,
}: {
  side: 'A' | 'B';
  value: Side;
  onChange: (next: Side) => void;
  data: PlayersResponse | null;
  loading: boolean;
  accent: string;
}) {
  const { bootstrap } = useApp();
  const selected = data?.players.find((player) => player.id === value.playerId) ?? null;
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'all' | 'season'>('all');
  const [remote, setRemote] = useState<SearchPlayerResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (selected) setQuery(selected.name);
  }, [selected?.id, selected?.name]);

  useEffect(() => {
    if (!open || scope !== 'all') {
      setSearching(false);
      return;
    }
    const term = query.trim();
    if (term.length < 2) {
      setRemote([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      apiGet<{ players: SearchPlayerResult[] }>(`/api/search?q=${encodeURIComponent(term)}&history=1`)
        .then((result) => {
          if (active) {
            setRemote(result.players);
            setSearching(false);
          }
        })
        .catch(() => {
          if (active) {
            setRemote([]);
            setSearching(false);
          }
        });
    }, 160);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, open, scope]);

  const filtered = useMemo(() => {
    if (scope === 'all') {
      if (remote.length > 0) return remote;
      if (query.trim().length < 2 && data) {
        return data.players.slice(0, 8).map((player) => ({
          id: player.id,
          name: player.name,
          team_name: player.teamName,
          slug: value.league,
          season: value.season,
        }));
      }
      return remote;
    }
    if (!data) return [];
    const term = query.trim().toLowerCase();
    if (!term) return data.players.slice(0, 8);
    return data.players
      .filter((player) => player.name.toLowerCase().includes(term) || player.teamName.toLowerCase().includes(term))
      .slice(0, 10);
  }, [data, query, remote, scope, value.league, value.season]);

  const pick = (player: { id: string; name: string; slug?: string; season?: number }) => {
    onChange({
      league: player.slug ?? value.league,
      season: player.season ?? value.season,
      playerId: player.id,
    });
    setQuery(player.name);
    setOpen(false);
  };

  const seasonLabel = `${value.season}/${String(value.season + 1).slice(-2)}`;
  const seasonScopeLabel = `${value.season}/${String(value.season + 1).slice(-2)}`;

  return (
    <div className="compare-picker" style={{ '--picker-accent': accent } as React.CSSProperties}>
      <div className="compare-picker__head">
        <span className="compare-picker__side">{side}</span>
        <span className="eyebrow">Player</span>
        {selected && <span className="compare-picker__team">{selected.teamName}</span>}
      </div>

      <div className="compare-picker__selects">
        <label>
          <span>League context</span>
          <select
            value={value.league}
            onChange={(event) => onChange({ ...value, league: event.target.value, playerId: '' })}
          >
            {(bootstrap?.leagues ?? []).map((league) => (
              <option key={league.slug} value={league.slug}>{league.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Season context</span>
          <select
            value={value.season}
            onChange={(event) => onChange({ ...value, season: Number(event.target.value), playerId: '' })}
          >
            {[...(bootstrap?.seasons ?? [2026])].sort((a, b) => b - a).map((year) => (
              <option key={year} value={year}>{year}/{String(year + 1).slice(-2)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="player-search__scope">
        <span>Search scope</span>
        <div className="search__scope" role="group" aria-label={`Search scope for player ${side}`}>
          <button
            className={scope === 'all' ? 'is-active' : ''}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setScope('all')}
          >
            All seasons
          </button>
          <button
            className={scope === 'season' ? 'is-active' : ''}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setScope('season')}
          >
            {seasonScopeLabel}
          </button>
        </div>
      </div>

      <div className="player-search">
        <Search size={15} className="player-search__icon" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 130)}
          placeholder={
            loading && scope === 'season'
              ? 'Loading players…'
              : scope === 'all'
                ? 'Search any loaded season'
                : `Search ${seasonLabel}`
          }
          aria-label={`Search player ${side}`}
        />
        <ChevronDown size={14} className="player-search__chevron" />
        {open && !(loading && scope === 'season') && (
          <div className="player-search__panel">
            {searching && filtered.length === 0 && <div className="player-search__empty">Searching all seasons…</div>}
            {!searching && filtered.length === 0 && (
              <div className="player-search__empty">
                {scope === 'all' ? 'No player found across loaded seasons.' : `No player found in ${seasonLabel}.`}
              </div>
            )}
            {filtered.map((player) => {
              const seasonYear = 'season' in player ? player.season : value.season;
              const team = 'team_name' in player ? player.team_name : player.teamName;
              const role = 'role' in player ? player.role : null;
              const minutes = 'minutes' in player ? player.minutes : null;
              return (
                <button
                  key={`${player.id}-${seasonYear}`}
                  className={player.id === value.playerId && seasonYear === value.season ? 'player-search__row is-active' : 'player-search__row'}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(player)}
                >
                  <span className="player-avatar player-avatar--sm">{player.name.slice(0, 1)}</span>
                  <span className="player-search__name">
                    {player.name}
                    <small>
                      {team}
                      {role ? ` · ${role}` : ''}
                      {scope === 'all' ? ` · ${seasonYear}/${String(seasonYear + 1).slice(-2)}` : ''}
                    </small>
                  </span>
                  {minutes !== null && <span className="player-search__mins">{minutes.toLocaleString()}′</span>}
                  {player.id === value.playerId && seasonYear === value.season && <Check size={13} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {selected && (
        <div className="compare-picker__meta">
          <span>{selected.minutes.toLocaleString()} minutes</span>
          <span>{selected.shots} shots</span>
          <span>{selected.goals} goals</span>
        </div>
      )}
    </div>
  );
}

function MetricRow({
  label,
  hint,
  a,
  b,
  format,
  winner,
  signed = false,
}: {
  label: string;
  hint: string;
  a: number;
  b: number;
  format: (value: number) => string;
  winner?: 'a' | 'b' | 'tie';
  signed?: boolean;
}) {
  const max = Math.max(Math.abs(a), Math.abs(b), 0.001);
  const aWidth = Math.max(2, (Math.abs(a) / max) * 100);
  const bWidth = Math.max(2, (Math.abs(b) / max) * 100);
  return (
    <div className="compare-metric">
      <div className="compare-metric__values">
        <b className={winner === 'a' ? 'is-win' : undefined}>{format(a)}</b>
        <span>
          {label}
          <small>{hint}</small>
        </span>
        <b className={winner === 'b' ? 'is-win' : undefined}>{format(b)}</b>
      </div>
      <div className="compare-metric__bars">
        <span className={signed && a < 0 ? 'compare-bar compare-bar--left is-negative' : 'compare-bar compare-bar--left'}>
          <i style={{ width: `${aWidth}%` }} />
        </span>
        <span className={signed && b < 0 ? 'compare-bar compare-bar--right is-negative' : 'compare-bar compare-bar--right'}>
          <i style={{ width: `${bWidth}%` }} />
        </span>
      </div>
    </div>
  );
}

export function Compare() {
  const { bootstrap } = useApp();
  const [left, setLeft] = useState<Side>(DEFAULT_LEFT);
  const [right, setRight] = useState<Side>(DEFAULT_RIGHT);

  const leftList = useApi<PlayersResponse>(
    `/api/leagues/${left.league}/players?season=${left.season}&sort=minutes&minMinutes=0&limit=500`,
  );
  const rightList = useApi<PlayersResponse>(
    `/api/leagues/${right.league}/players?season=${right.season}&sort=minutes&minMinutes=0&limit=500`,
  );

  useEffect(() => {
    if (!leftList.data || left.playerId) return;
    const first = leftList.data.players[0];
    if (first) setLeft((current) => ({ ...current, playerId: first.id }));
  }, [leftList.data, left.playerId]);

  useEffect(() => {
    if (!rightList.data || right.playerId) return;
    const first = rightList.data.players[0];
    if (first) setRight((current) => ({ ...current, playerId: first.id }));
  }, [rightList.data, right.playerId]);

  const a = leftList.data?.players.find((player) => player.id === left.playerId) ?? null;
  const b = rightList.data?.players.find((player) => player.id === right.playerId) ?? null;

  if ((leftList.loading && !leftList.data) || (rightList.loading && !rightList.data)) {
    return <Loading rows={8} />;
  }
  if (leftList.error || rightList.error) {
    return (
      <ErrorState
        message={leftList.error ?? rightList.error ?? 'Could not load players'}
        onRetry={() => {
          leftList.reload();
          rightList.reload();
        }}
      />
    );
  }
  if (!a || !b) {
    return (
      <div className="empty">
        Pick two players from the loaded seasons to start the comparison.
      </div>
    );
  }

  const volume = comparison(a.per90.shots, b.per90.shots);
  const quality = comparison(npxgPerShot(a), npxgPerShot(b));
  const execution = comparison(nonPenaltyOverperformance(a), nonPenaltyOverperformance(b));
  const overall = comparison(attackValue(a), attackValue(b));
  const minShots = Math.min(a.shots, b.shots);
  const sampleConfidence = minShots < 50 ? 'Low' : minShots < 150 ? 'Moderate' : 'High';
  const bothSame = quality === execution && quality !== 'tie';
  const finisher = bothSame ? (quality === 'a' ? a : b) : null;
  const other = finisher?.id === a.id ? b : a;

  const verdict = finisher
    ? `${finisher.name} has the stronger finishing case in this sample — but ${other.name} may still have the better overall attacking profile.`
    : quality !== execution && quality !== 'tie' && execution !== 'tie'
      ? 'The evidence is mixed: chance quality and execution point in different directions. That is a difference in profile, not proof of a better finisher.'
      : 'This comparison is too close to call on aggregate. The differences are within the noise of one season.';

  const support = [
    {
      label: 'Shot volume',
      player: volume === 'a' ? a : volume === 'b' ? b : null,
      value: volume === 'a' ? `${fmtNum(a.per90.shots, 2)} shots/90 vs ${fmtNum(b.per90.shots, 2)}` : `${fmtNum(b.per90.shots, 2)} shots/90 vs ${fmtNum(a.per90.shots, 2)}`,
    },
    {
      label: 'Chance quality',
      player: quality === 'a' ? a : quality === 'b' ? b : null,
      value: quality === 'a' ? `${fmtNum(npxgPerShot(a), 3)} npxG/shot vs ${fmtNum(npxgPerShot(b), 3)}` : `${fmtNum(npxgPerShot(b), 3)} npxG/shot vs ${fmtNum(npxgPerShot(a), 3)}`,
    },
    {
      label: 'Execution',
      player: execution === 'a' ? a : execution === 'b' ? b : null,
      value: execution === 'a' ? `${fmtSigned(nonPenaltyOverperformance(a), 1)} vs ${fmtSigned(nonPenaltyOverperformance(b), 1)} non-penalty G − xG` : `${fmtSigned(nonPenaltyOverperformance(b), 1)} vs ${fmtSigned(nonPenaltyOverperformance(a), 1)} non-penalty G − xG`,
    },
    {
      label: 'Overall attack',
      player: overall === 'a' ? a : overall === 'b' ? b : null,
      value: overall === 'a' ? `${fmtNum(attackValue(a), 2)} vs ${fmtNum(attackValue(b), 2)} npxG + xA/90` : `${fmtNum(attackValue(b), 2)} vs ${fmtNum(attackValue(a), 2)} npxG + xA/90`,
    },
  ];

  const leagueName = (slug: string) => bootstrap?.leagues.find((league) => league.slug === slug)?.name ?? slug;
  const seasonLabel = (year: number) => `${year}/${String(year + 1).slice(-2)}`;

  return (
    <>
      <PageHeader
        eyebrow={<><ArrowLeftRight size={12} /> Player intelligence · finishing</>}
        title="Finishing lab"
        subtitle="Separate opportunity, chance quality and execution. Compare two players across seasons without collapsing them into a single conversion rate."
        actions={<span className="status-chip"><Sparkles size={13} /> Aggregate xG · 2014/15 → 2026/27</span>}
      />

      <div className="compare-controls">
        <PlayerPicker
          side="A"
          value={left}
          onChange={setLeft}
          data={leftList.data}
          loading={leftList.loading}
          accent={bootstrap?.leagues.find((league) => league.slug === left.league)?.accent ?? 'var(--accent)'}
        />
        <div className="compare-controls__vs"><ArrowLeftRight size={16} /><span>vs</span></div>
        <PlayerPicker
          side="B"
          value={right}
          onChange={setRight}
          data={rightList.data}
          loading={rightList.loading}
          accent={bootstrap?.leagues.find((league) => league.slug === right.league)?.accent ?? 'var(--accent)'}
        />
      </div>

      <section className="compare-hero">
        <div className="compare-hero__player">
          <span className="player-avatar player-avatar--lg">{a.name.slice(0, 1)}</span>
          <div>
            <div className="eyebrow">{a.teamName} · {seasonLabel(left.season)}</div>
            <h2>{a.name}</h2>
            <span className="compare-hero__role">{a.role} · {leagueName(left.league)}</span>
          </div>
          <span className="compare-hero__rating-wrap">
            <small>Impact</small>
            <b className="compare-hero__rating">{fmtNum(a.rating, 1)}</b>
          </span>
        </div>
        <div className="compare-hero__score">
          <span>Evidence confidence</span>
          <b>{sampleConfidence}</b>
          <small>≥{minShots} shots · ≥{Math.min(a.minutes, b.minutes).toLocaleString()} min</small>
        </div>
        <div className="compare-hero__player compare-hero__player--right">
          <span className="player-avatar player-avatar--lg">{b.name.slice(0, 1)}</span>
          <div>
            <div className="eyebrow">{b.teamName} · {seasonLabel(right.season)}</div>
            <h2>{b.name}</h2>
            <span className="compare-hero__role">{b.role} · {leagueName(right.league)}</span>
          </div>
          <span className="compare-hero__rating-wrap">
            <small>Impact</small>
            <b className="compare-hero__rating">{fmtNum(b.rating, 1)}</b>
          </span>
        </div>
      </section>

      <div className="compare-layout">
        <section className="card compare-card">
          <SectionHead eyebrow="Dimensions" title="The comparison, decomposed" />
          <MetricRow
            label="Minutes"
            hint="sample size"
            a={a.minutes}
            b={b.minutes}
            format={(value) => value.toLocaleString()}
          />
          <MetricRow
            label="Shots / 90"
            hint="opportunity volume"
            a={a.per90.shots}
            b={b.per90.shots}
            format={(value) => fmtNum(value, 2)}
            winner={volume}
          />
          <MetricRow
            label="npxG / shot"
            hint="chance quality"
            a={npxgPerShot(a)}
            b={npxgPerShot(b)}
            format={(value) => fmtNum(value, 3)}
            winner={quality}
          />
          <MetricRow
            label="Non-penalty G − xG"
            hint="execution, not proof"
            a={nonPenaltyOverperformance(a)}
            b={nonPenaltyOverperformance(b)}
            format={(value) => fmtSigned(value, 1)}
            winner={execution}
            signed
          />
          <MetricRow
            label="Conversion"
            hint="goals / shots"
            a={conversion(a)}
            b={conversion(b)}
            format={(value) => fmtPct(value, 1)}
          />
          <MetricRow
            label="npxG + xA / 90"
            hint="overall attack"
            a={attackValue(a)}
            b={attackValue(b)}
            format={(value) => fmtNum(value, 2)}
            winner={overall}
          />
          <MetricRow
            label="Impact rating"
            hint="role-weighted composite"
            a={a.rating}
            b={b.rating}
            format={(value) => fmtNum(value, 1)}
          />
        </section>

        <aside className="compare-verdict">
          <div className="card compare-verdict__card">
            <div className="eyebrow">Verdict</div>
            <h2>{verdict}</h2>
            <div className={`compare-confidence compare-confidence--${sampleConfidence.toLowerCase()}`}>
              <CircleHelp size={15} />
              <span>Evidence confidence: <b>{sampleConfidence}</b></span>
            </div>
            <p className="compare-verdict__note">
              A {sampleConfidence.toLowerCase()} confidence label reflects sample size, not a judgement about the
              players. One season is a short window for a low-frequency event like finishing.
            </p>
          </div>

          <div className="card compare-evidence">
            <div className="compare-evidence__head">
              <span className="eyebrow">What the data supports</span>
              <ShieldAlert size={15} />
            </div>
            {support.map((item) => (
              <div className="compare-evidence__row" key={item.label}>
                <span>{item.label}</span>
                <b>{item.player ? item.player.name.split(' ').slice(-1)[0] : 'Tie'}</b>
                <small>{item.value}</small>
              </div>
            ))}
          </div>

          <div className="card compare-caveats">
            <div className="eyebrow">What it cannot settle</div>
            <ul>
              <li>A repeatable finishing skill from one season of G − xG.</li>
              <li>Whether a low-volume player would hold the same efficiency at higher volume.</li>
              <li>Shot placement, pressure, body part or goalkeeper positioning.</li>
              <li>Penalty and competition effects without an explicit adjustment.</li>
            </ul>
            <div className="compare-caveats__foot">
              <ArrowUpRight size={13} />
              <span>Shot-level PSxG is not in this dataset. The lab states that limit rather than inventing a number.</span>
            </div>
          </div>
        </aside>
      </div>

      <div className="callout compare-method">
        <div>
          <div className="eyebrow">Method note</div>
          <h3>What this comparison is doing</h3>
          <p>
            Metrics are computed from provider-supplied season aggregates: minutes, shots, goals, non-penalty
            goals, npxG, xA and per-90 rates. “Execution” is non-penalty goals minus npxG. It is descriptive, not
            causal: a player who outperforms xG may be a skilled finisher, may have benefited from variance, or
            both. The lab deliberately refuses to turn that into a single “better finisher” score.
          </p>
        </div>
        <span className="data-source-tag">Understat · 2014/15 → 2026/27</span>
      </div>
    </>
  );
}
