import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Lightbulb, Search, ShieldCheck } from 'lucide-react';
import { useApi } from '../api';
import { useApp } from '../state';
import type { Insight, InsightsResponse, Overview } from '../types';
import {
  ErrorState,
  Loading,
  PageHeader,
  SectionHead,
  TeamBadge,
} from '../components/ui';

const TYPES = [
  { key: 'ALL', label: 'All signals' },
  { key: 'league', label: 'League' },
  { key: 'team', label: 'Teams' },
  { key: 'player', label: 'Players' },
  { key: 'match', label: 'Matches' },
  { key: 'model', label: 'Model' },
];

const CONFIDENCE = ['ALL', 'High', 'Medium', 'Low'];

export function Insights() {
  const { league, season, leagueInfo } = useApp();
  const { data, loading, error, reload } = useApi<InsightsResponse>(
    `/api/leagues/${league}/insights?season=${season}`,
  );
  const overview = useApi<Overview>(`/api/leagues/${league}/overview?season=${season}`);
  const [type, setType] = useState('ALL');
  const [confidence, setConfidence] = useState('ALL');
  const [query, setQuery] = useState('');

  const teamById = useMemo(
    () => new Map((overview.data?.teams ?? []).map((team) => [team.id, team])),
    [overview.data],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = query.trim().toLowerCase();
    return data.insights
      .filter((insight) => (type === 'ALL' ? true : insight.type === type))
      .filter((insight) => (confidence === 'ALL' ? true : insight.confidence === confidence))
      .filter((insight) =>
        term
          ? insight.headline.toLowerCase().includes(term) ||
            insight.body.toLowerCase().includes(term) ||
            insight.category.toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => b.score - a.score);
  }, [data, type, confidence, query]);

  if (loading && !data) return <Loading rows={8} />;
  if (error || !data) return <ErrorState message={error ?? 'No insights'} onRetry={reload} />;

  const featured = filtered[0];

  const renderTarget = (insight: Insight) => {
    if (insight.matchId) {
      return (
        <Link to={`/matches/${insight.matchId}`} className="text-link">
          Match breakdown <ArrowUpRight size={13} />
        </Link>
      );
    }
    if (insight.playerId) {
      return (
        <Link to={`/players?focus=${insight.playerId}`} className="text-link">
          Player profile <ArrowUpRight size={13} />
        </Link>
      );
    }
    if (insight.teamIds.length > 0) {
      return (
        <Link to={`/teams/${insight.teamIds[0]}`} className="text-link">
          Team profile <ArrowUpRight size={13} />
        </Link>
      );
    }
    return (
      <Link to="/model" className="text-link">
        Model card <ArrowUpRight size={13} />
      </Link>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow={<><Lightbulb size={12} /> {leagueInfo?.name} · {data.season.label}</>}
        title="Insights"
        subtitle="Conclusions with receipts. Every signal below is generated from the data, carries its evidence and states its confidence."
        actions={<span className="status-chip"><ShieldCheck size={13} /> {data.counts.all} signals</span>}
      />

      <div className="insight-summary">
        {[
          { label: 'Team signals', value: data.counts.team ?? 0 },
          { label: 'Player signals', value: data.counts.player ?? 0 },
          { label: 'Match signals', value: data.counts.match ?? 0 },
          { label: 'Model signals', value: data.counts.model ?? 0 },
        ].map((item) => (
          <div className="insight-summary__item" key={item.label}>
            <b>{item.value}</b>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {featured && (
        <article className="featured-insight">
          <div className="featured-insight__copy">
            <div className="eyebrow">Signal of the day · {featured.category}</div>
            <h2>{featured.headline}</h2>
            <p>{featured.body}</p>
            <div className="featured-insight__evidence">
              {featured.evidence.map((item) => (
                <span key={item.label}>
                  <small>{item.label}</small>
                  <b>{item.value}</b>
                  {item.note && <em>{item.note}</em>}
                </span>
              ))}
            </div>
            <div className="featured-insight__foot">
              <span className={`confidence confidence--${featured.confidence.toLowerCase()}`}>
                <span className="confidence__dot" /> {featured.confidence} confidence
              </span>
              {renderTarget(featured)}
            </div>
          </div>
          <div className="featured-insight__visual">
            <span className={`tag tag--${featured.type}`}>{featured.type}</span>
            <div className="featured-insight__score">{featured.score.toFixed(1)}</div>
            <span className="mono-label">signal strength</span>
            <div className="featured-insight__teams">
              {featured.teamIds.map((id) => {
                const team = teamById.get(id);
                return team ? (
                  <Link to={`/teams/${id}`} key={id} className="featured-insight__team">
                    <TeamBadge team={team} size="sm" />
                    <span>{team.name}</span>
                  </Link>
                ) : null;
              })}
            </div>
          </div>
        </article>
      )}

      <div className="toolbar toolbar--wrap">
        <div className="tabs tabs--scroll">
          {TYPES.map((item) => (
            <button key={item.key} className={type === item.key ? 'tab is-active' : 'tab'} onClick={() => setType(item.key)}>
              {item.label}
              <span>{item.key === 'ALL' ? data.counts.all : data.counts[item.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="toolbar__controls">
          <div className="role-filter">
            {CONFIDENCE.map((item) => (
              <button
                key={item}
                className={confidence === item ? 'role-chip is-active' : 'role-chip'}
                onClick={() => setConfidence(item)}
              >
                {item === 'ALL' ? 'Any confidence' : item}
              </button>
            ))}
          </div>
          <label className="input-wrap">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search signals"
              aria-label="Search insights"
            />
          </label>
        </div>
      </div>

      <section className="section">
        <SectionHead
          eyebrow="Feed"
          title={`${filtered.length} signals`}
          action={<span className="muted small">Sorted by signal strength</span>}
        />
        <div className="insight-grid">
          {filtered.map((insight) => (
            <article className="insight-card" key={insight.id}>
              <div className="insight-card__top">
                <span className={`tag tag--${insight.type}`}>{insight.category}</span>
                <span className={`conf-dot conf-dot--${insight.confidence.toLowerCase()}`} title={`${insight.confidence} confidence`} />
              </div>
              <h3>{insight.headline}</h3>
              <p>{insight.body}</p>
              <div className="insight-card__evidence">
                {insight.evidence.map((item) => (
                  <span key={item.label}>
                    <small>{item.label}</small>
                    <b>{item.value}</b>
                  </span>
                ))}
              </div>
              <div className="insight-card__foot">
                <div className="insight-card__teams">
                  {insight.teamIds.slice(0, 2).map((id) => {
                    const team = teamById.get(id);
                    return team ? (
                      <Link to={`/teams/${id}`} key={id} className="mini-team">
                        <TeamBadge team={team} size="xs" />
                        <span>{team.shortName}</span>
                      </Link>
                    ) : null;
                  })}
                </div>
                {renderTarget(insight)}
              </div>
            </article>
          ))}
        </div>
        {filtered.length === 0 && <div className="empty">No signals match these filters.</div>}
      </section>

      <div className="callout">
        <div>
          <div className="eyebrow">Confidence</div>
          <h3>What High, Medium and Low mean</h3>
          <p>
            Confidence combines sample size and effect size. A large overperformance over 30 matches is stronger evidence
            than a dramatic one over 6. Low confidence is still a signal — just one that deserves patience.
          </p>
        </div>
        <Link to="/model" className="btn btn--ghost">
          Model methodology <ArrowUpRight size={14} />
        </Link>
      </div>
    </>
  );
}
