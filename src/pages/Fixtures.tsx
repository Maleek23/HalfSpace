import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Check, Clock3, X } from 'lucide-react';
import { useApi, fmtDateTime, fmtNum, fmtPct } from '../api';
import { useApp } from '../state';
import type { MatchesResponse, Match } from '../types';
import {
  ConfidenceChip,
  ErrorState,
  FormPills,
  Loading,
  PageHeader,
  ProbBar,
  TeamBadge,
} from '../components/ui';

type Status = 'upcoming' | 'results';

function FixtureRow({ match }: { match: Match }) {
  const pick =
    match.prediction.homeWin >= match.prediction.draw && match.prediction.homeWin >= match.prediction.awayWin
      ? 'home'
      : match.prediction.draw >= match.prediction.awayWin
        ? 'draw'
        : 'away';
  const pickTeam = pick === 'home' ? match.home.shortName : pick === 'away' ? match.away.shortName : 'Draw';
  const score = match.score ?? match.prediction.topScorelines[0];
  const isPlayed = match.status === 'played';

  return (
    <Link to={`/matches/${match.id}`} className="fixture-row">
      <div className="fixture-row__time">
        <span>{fmtDateTime(match.kickoff).split(' · ')[0]}</span>
        <small>{isPlayed ? 'FT' : fmtDateTime(match.kickoff).split(' · ')[1]}</small>
      </div>
      <div className="fixture-row__team fixture-row__team--home">
        <span>{match.home.name}</span>
        <TeamBadge team={match.home} size="xs" />
      </div>
      <div className="fixture-row__centre">
        <span className={isPlayed ? 'fixture-row__score' : 'fixture-row__score fixture-row__score--predicted'}>
          {score.home}–{score.away}
        </span>
        <span className="mono-label">{isPlayed ? 'result' : 'model score'}</span>
      </div>
      <div className="fixture-row__team fixture-row__team--away">
        <TeamBadge team={match.away} size="xs" />
        <span>{match.away.name}</span>
      </div>
      <div className="fixture-row__prob">
        <ProbBar prediction={match.prediction} height={6} />
        <div className="fixture-row__probs">
          <span>{fmtPct(match.prediction.homeWin)}</span>
          <span>{fmtPct(match.prediction.draw)}</span>
          <span>{fmtPct(match.prediction.awayWin)}</span>
        </div>
      </div>
      <div className="fixture-row__meta">
        {isPlayed ? (
          <span className={match.result?.correct ? 'pick pick--hit' : 'pick pick--miss'}>
            {match.result?.correct ? <Check size={12} /> : <X size={12} />} {pickTeam}
          </span>
        ) : (
          <ConfidenceChip label={match.prediction.confidenceLabel} score={match.prediction.confidence} />
        )}
        <span className="mono-label">
          xG {fmtNum(match.prediction.homeXg, 2)}–{fmtNum(match.prediction.awayXg, 2)}
        </span>
      </div>
    </Link>
  );
}

export function Fixtures() {
  const { league, season, leagueInfo } = useApp();
  const [params, setParams] = useSearchParams();
  const initial = params.get('status') === 'results' ? 'results' : 'upcoming';
  const [status, setStatus] = useState<Status>(initial);
  const { data, loading, error, reload } = useApi<MatchesResponse>(
    `/api/leagues/${league}/matches?season=${season}&status=${status}`,
  );

  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<number, Match[]>();
    for (const match of data.matches) {
      const list = map.get(match.round) ?? [];
      list.push(match);
      map.set(match.round, list);
    }
    return [...map.entries()].sort((a, b) => (status === 'upcoming' ? a[0] - b[0] : b[0] - a[0]));
  }, [data, status]);

  if (loading && !data) return <Loading rows={8} />;
  if (error || !data) return <ErrorState message={error ?? 'No fixtures'} onRetry={reload} />;

  return (
    <>
      <PageHeader
        eyebrow={<><CalendarDays size={12} /> {leagueInfo?.name} · {data.season.label}</>}
        title="Fixture model"
        subtitle="Every match, every probability. Open a fixture for the scoreline matrix, market prices, team form and projected XIs."
        actions={
          <span className="status-chip">
            <Clock3 size={13} /> {data.counts.upcoming} upcoming · {data.counts.results} played
          </span>
        }
      />

      <div className="toolbar">
        <div className="tabs">
          <button
            className={status === 'upcoming' ? 'tab is-active' : 'tab'}
            onClick={() => {
              setStatus('upcoming');
              params.set('status', 'upcoming');
              setParams(params, { replace: true });
            }}
          >
            Upcoming <span>{data.counts.upcoming}</span>
          </button>
          <button
            className={status === 'results' ? 'tab is-active' : 'tab'}
            onClick={() => {
              setStatus('results');
              params.set('status', 'results');
              setParams(params, { replace: true });
            }}
          >
            Results <span>{data.counts.results}</span>
          </button>
        </div>
        <div className="toolbar__legend">
          <span><i className="legend-dot legend-dot--home" /> Home</span>
          <span><i className="legend-dot legend-dot--draw" /> Draw</span>
          <span><i className="legend-dot legend-dot--away" /> Away</span>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="empty">No matches in this view. Switch season or status.</div>
      ) : (
        <div className="round-list">
          {grouped.map(([round, matches]) => (
            <section className="round-block" key={round}>
              <header className="round-head">
                <div>
                  <span className="eyebrow">Matchweek</span>
                  <h2>Round {round}</h2>
                </div>
                <span className="mono-label">
                  {matches.length} fixtures · {fmtDateTime(matches[0].kickoff).split(' · ')[0]}
                </span>
              </header>
              <div className="fixture-table">
                {matches.map((match) => (
                  <FixtureRow key={match.id} match={match} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="callout">
        <div>
          <div className="eyebrow">How to read this</div>
          <h3>Probabilities are not certainties</h3>
          <p>
            The model blends opponent-adjusted xG attack/defence with Elo and home advantage, then applies a Dixon-Coles
            correction to low scorelines. A 40% favourite loses 60% of the time.
          </p>
        </div>
        <Link to="/model" className="btn btn--ghost">
          Model methodology <ArrowUpRight size={14} />
        </Link>
      </div>
    </>
  );
}
