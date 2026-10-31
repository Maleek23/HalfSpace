import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  ChevronDown,
  Database,
  LayoutDashboard,
  Lightbulb,
  Menu,
  Network,
  Search,
  Shirt,
  UsersRound,
  X,
} from 'lucide-react';
import { apiGet, timeAgo } from '../api';
import { useApp } from '../state';
import { TeamBadge } from './ui';
import type { Bootstrap } from '../types';

const NAV = [
  {
    group: 'Matchday',
    items: [
      { to: '/overview', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/fixtures', label: 'Fixtures', icon: CalendarDays },
      { to: '/ratings', label: 'Power ratings', icon: BarChart3 },
    ],
  },
  {
    group: 'Analysis',
    items: [
      { to: '/players', label: 'Player intelligence', icon: UsersRound },
      { to: '/compare', label: 'Finishing lab', icon: ArrowLeftRight },
      { to: '/lineups', label: 'Lineup lab', icon: Shirt },
      { to: '/tactics', label: 'Tactics lab', icon: Network },
      { to: '/insights', label: 'Insights', icon: Lightbulb },
    ],
  },
  {
    group: 'Model',
    items: [
      { to: '/model', label: 'Model card', icon: BrainCircuit },
      { to: '/data', label: 'Data & pipeline', icon: Database },
    ],
  },
];

const TITLES: Record<string, string> = {
  overview: 'Overview',
  fixtures: 'Fixtures',
  ratings: 'Power ratings',
  players: 'Player intelligence',
  compare: 'Finishing lab',
  lineups: 'Lineup lab',
  tactics: 'Tactics lab',
  insights: 'Insights',
  model: 'Model card',
  data: 'Data & pipeline',
  teams: 'Team',
  matches: 'Match',
};

interface SearchTeam {
  id: string;
  name: string;
  short_name: string;
  slug: string;
}
interface SearchPlayer {
  id: string;
  name: string;
  team_name: string;
  slug: string;
  season: number;
}
interface SearchResults {
  teams: SearchTeam[];
  players: SearchPlayer[];
}

function GlobalSearch() {
  const { setLeague, setSeason, season } = useApp();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [raw, setRaw] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [scope, setScope] = useState<'all' | 'season'>('all');

  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', focus);
    return () => window.removeEventListener('keydown', focus);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setRaw(null);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      apiGet<SearchResults>(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then((data) => {
          if (active) {
            setRaw(data);
            setSearching(false);
          }
        })
        .catch(() => {
          if (active) {
            setRaw(null);
            setSearching(false);
          }
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const results = useMemo<SearchResults | null>(() => {
    if (!raw) return null;
    if (scope === 'all') return raw;
    return {
      teams: raw.teams,
      players: raw.players.filter((player) => player.season === season),
    };
  }, [raw, scope, season]);

  const hasResults = Boolean(results && (results.teams.length > 0 || results.players.length > 0));
  const seasonLabel = `${season}/${String(season + 1).slice(-2)}`;

  return (
    <div className="search">
      <Search size={16} className="search__icon" />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        placeholder="Search players, teams"
        aria-label="Search players and teams across seasons"
      />
      <kbd className="search__kbd">⌘K</kbd>
      {open && query.trim().length >= 2 && (
        <div className="search__panel">
          <div className="search__panel-head">
            <span>Global search</span>
            <div className="search__scope" role="group" aria-label="Search scope">
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
                {seasonLabel}
              </button>
            </div>
          </div>
          {searching && !hasResults && <div className="search__empty">Searching…</div>}
          {!searching && !hasResults && <div className="search__empty">No matches for “{query}” in {scope === 'all' ? 'any loaded season' : seasonLabel}.</div>}
          {results && results.teams.length > 0 && (
            <>
              <div className="search__group">Teams</div>
              {results.teams.map((team) => (
                <button
                  key={team.id}
                  className="search__row"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setLeague(team.slug);
                    navigate(`/teams/${team.id}`);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <TeamBadge team={{ name: team.name, shortName: team.short_name }} size="xs" />
                  <span>{team.name}</span>
                  <span className="search__meta">Team</span>
                </button>
              ))}
            </>
          )}
          {results && results.players.length > 0 && (
            <>
              <div className="search__group">Players {scope === 'all' ? '· all seasons' : `· ${seasonLabel}`}</div>
              {results.players.map((player) => (
                <button
                  key={player.id}
                  className="search__row"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setLeague(player.slug);
                    setSeason(player.season);
                    navigate(`/players?focus=${player.id}`);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <span className="search__avatar">{player.name.slice(0, 1)}</span>
                  <span>{player.name}</span>
                  <span className="search__meta">{player.team_name} · {player.season}/{String(player.season + 1).slice(-2)}</span>
                </button>
              ))}
            </>
          )}
          <div className="search__foot">
            <span>Selecting a season creates context, not a filter.</span>
            <span>{scope === 'all' ? 'Universal' : 'Scoped'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function Shell() {
  const { bootstrap, league, leagueInfo, season, setLeague, setSeason, loading, error } = useApp();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const segment = location.pathname.split('/').filter(Boolean)[0] ?? '';

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const seasonOptions = bootstrap?.seasons ?? [2026, 2025, 2024];

  const seasonLabel = `${season}/${String(season + 1).slice(-2)}`;

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className={mobileOpen ? 'sidebar-backdrop is-open' : 'sidebar-backdrop'} onClick={() => setMobileOpen(false)} />
      <aside className={mobileOpen ? 'sidebar is-open' : 'sidebar'}>
        <div className="sidebar__brand">
          <Link to="/overview" className="brand" title="HalfSpace overview">
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 28 28" width="28" height="28">
                <rect x="1" y="1" width="26" height="26" rx="7" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
                <path d="M7 21V13h6V7h8v8h-6v6H7Z" fill="currentColor" />
              </svg>
            </span>
            <span>
              <span className="brand__name">HALFSPACE</span>
              <span className="brand__sub">Football intelligence</span>
            </span>
          </Link>
          <button className="icon-btn sidebar__close" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="sidebar__context">
          <div className="sidebar__label">Competition</div>
          <label
            className="league-switcher"
            style={{ '--league-accent': leagueInfo?.accent ?? 'var(--accent)' } as React.CSSProperties}
          >
            <span className="league-switcher__dot" aria-hidden="true" />
            <select
              value={league}
              onChange={(event) => setLeague(event.target.value)}
              aria-label="Select competition"
            >
              {(bootstrap?.leagues ?? []).map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="league-switcher__chevron" aria-hidden="true" />
          </label>
          <div className="league-switcher__meta">
            <span>{leagueInfo?.country ?? 'Europe'}</span>
            <span>{seasonLabel}</span>
          </div>
        </div>

        <nav className="nav" aria-label="Primary">
          {NAV.map((section) => (
            <div className="nav__group" key={section.group}>
              <div className="sidebar__label">{section.group}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? 'nav__link is-active' : 'nav__link')}
                >
                  <item.icon size={17} strokeWidth={1.7} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__foot">
          <div className="source-card">
            <div className="source-card__row">
              <span className="live-dot" />
              <span>Understat feed</span>
              <span className="source-card__tag">LIVE</span>
            </div>
            <div className="source-card__meta">
              {bootstrap?.modelVersion ?? 'dc-xg'} · synced {timeAgo(bootstrap?.lastSync ?? null)}
            </div>
          </div>
          <div className="sidebar__note">xG data is provider-supplied. Projections are model estimates, not predictions of certainty.</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__left">
            <button className="icon-btn topbar__menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu size={20} />
            </button>
            <div className="crumbs">
              <Link to="/overview" className="crumbs__root">
                {leagueInfo?.name ?? 'HalfSpace'}
              </Link>
              <span className="crumbs__sep">/</span>
              <span className="crumbs__current">{TITLES[segment] ?? 'Overview'}</span>
            </div>
          </div>
          <div className="topbar__right">
            <GlobalSearch />
            <label className="season-select">
              <span className="season-select__label">Season</span>
              <select
                value={season}
                onChange={(event) => setSeason(Number(event.target.value))}
                aria-label="Select season"
              >
                {[...seasonOptions]
                  .sort((a, b) => b - a)
                  .map((year) => (
                    <option key={year} value={year}>
                      {`${year}/${String(year + 1).slice(-2)}`}
                    </option>
                  ))}
              </select>
            </label>
            <div className="topbar__status" title={error ?? 'Connected'}>
              <Activity size={15} />
              <span>{loading ? 'Syncing' : error ? 'Offline' : 'Model live'}</span>
            </div>
          </div>
        </header>

        <main className="content" id="main-content">
          <div className="page" key={location.pathname}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export type { Bootstrap };
