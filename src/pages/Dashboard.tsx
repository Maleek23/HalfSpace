import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, ChevronRight, Radio, Sparkles } from 'lucide-react';
import { useApi, fmtDate, fmtNum, fmtPct, fmtSigned } from '../api';
import { useApp } from '../state';
import type { Overview, Match, Insight, SimulationOutcome, TeamSummary } from '../types';
import {
  ConfidenceChip,
  ErrorState,
  FormPills,
  Loading,
  PageHeader,
  ProbBar,
  SectionHead,
  Stat,
  TeamBadge,
  Delta,
} from '../components/ui';
import { MiniScoreline, ScatterChart } from '../components/charts';

function MatchCard({ match }: { match: Match }) {
  const score = match.prediction.topScorelines[0];
  return (
    <Link to={`/matches/${match.id}`} className="match-card">
      <div className="match-card__top">
        <span className="mono-label">R{match.round}</span>
        <span className="mono-label">{fmtDate(match.kickoff)}</span>
        <ConfidenceChip label={match.prediction.confidenceLabel} score={match.prediction.confidence} />
      </div>
      <div className="match-card__teams">
        <div className="match-card__team">
          <TeamBadge team={match.home} size="sm" />
          <span>{match.home.name}</span>
          <b>{fmtPct(match.prediction.homeWin)}</b>
        </div>
        <div className="match-card__team">
          <TeamBadge team={match.away} size="sm" />
          <span>{match.away.name}</span>
          <b>{fmtPct(match.prediction.awayWin)}</b>
        </div>
      </div>
      <ProbBar prediction={match.prediction} height={6} />
      <div className="match-card__foot">
        <span className="mono-label">MODEL SCORE</span>
        <span className="match-card__score">
          {score.home}–{score.away}
        </span>
        <span className="mono-label">
          xG {fmtNum(match.prediction.homeXg, 2)}–{fmtNum(match.prediction.awayXg, 2)}
        </span>
      </div>
    </Link>
  );
}

function InsightMini({ insight }: { insight: Insight }) {
  return (
    <Link to={`/insights`} className="insight-mini">
      <div className="insight-mini__top">
        <span className={`tag tag--${insight.type}`}>{insight.category}</span>
        <span className={`conf-dot conf-dot--${insight.confidence.toLowerCase()}`} title={`${insight.confidence} confidence`} />
      </div>
      <h3>{insight.headline}</h3>
      <div className="insight-mini__evidence">
        {insight.evidence.slice(0, 3).map((item) => (
          <span key={item.label}>
            <small>{item.label}</small>
            <b>{item.value}</b>
          </span>
        ))}
      </div>
      <span className="text-link">
        Evidence <ArrowUpRight size={13} />
      </span>
    </Link>
  );
}

export function Dashboard() {
  const { league, season, leagueInfo, bootstrap } = useApp();
  const { data, loading, error, reload } = useApi<Overview>(
    `/api/leagues/${league}/overview?season=${season}`,
  );

  if (loading && !data) return <Loading rows={8} />;
  if (error || !data) return <ErrorState message={error ?? 'No data'} onRetry={reload} />;

  const teamById = new Map(data.teams.map((team) => [team.id, team]));
  const feature = data.upcoming[0] ?? data.results[0];
  const featureHome = feature ? teamById.get(feature.home.id) : undefined;
  const featureAway = feature ? teamById.get(feature.away.id) : undefined;
  const leader = data.simulations.completed
    ? data.table[0]
    : [...data.simulations.outcomes].sort((a, b) => b.title - a.title)[0];
  const titleRows: SimulationOutcome[] = data.simulations.completed
    ? data.table.slice(0, 8).map((row, index) => ({
        teamId: row.teamId,
        name: row.name,
        shortName: row.shortName,
        title: index === 0 ? 1 : 0,
        top4: index < 4 ? 1 : 0,
        relegation: index >= data.table.length - 3 ? 1 : 0,
        avgPoints: row.points,
        positionCounts: [],
      }))
    : [...data.simulations.outcomes].sort((a, b) => b.title - a.title).slice(0, 8);
  const maxTitle = Math.max(...titleRows.map((row) => row.title), 0.01);
  const topPlayers = data.topPlayers;
  const powerTeams = [...data.teams].sort((a, b) => b.rating.power - a.rating.power).slice(0, 6);
  const scatterPoints = data.table.map((row) => ({
    x: row.played ? row.xg / row.played : 0,
    y: row.played ? row.xga / row.played : 0,
    label: row.shortName,
    name: row.name,
  }));
  const seasonLabel = data.season.label;

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Radio size={12} /> {leagueInfo?.name} · {seasonLabel} · {data.completed ? 'Final' : `Round ${feature?.round ?? 1}`}
          </>
        }
        title="The model board"
        subtitle={
          data.completed
            ? 'A complete season, read through expected goals, opponent-adjusted ratings and a walk-forward backtest.'
            : 'Every fixture priced by the same model: xG-driven attack and defence, opponent adjustment, Elo and home advantage.'
        }
        actions={
          <>
            <span className="status-chip">
              <span className="live-dot" /> {data.coverage.played} matches processed
            </span>
            <Link to="/model" className="btn btn--ghost">
              Model card <ArrowUpRight size={14} />
            </Link>
          </>
        }
      />

      {feature && (
        <div className="hero-grid">
          <article className="feature-card">
            <div className="feature-card__top">
              <div>
                <div className="eyebrow">
                  {data.completed ? 'Last match' : 'Next fixture'} · Round {feature.round}
                </div>
                <div className="feature-card__date">
                  {fmtDate(feature.kickoff)} · {feature.status === 'upcoming' ? 'Projection' : 'Result'}
                </div>
              </div>
              <ConfidenceChip
                label={feature.prediction.confidenceLabel}
                score={feature.prediction.confidence}
              />
            </div>

            <div className="feature-card__match">
              <div className="feature-card__side">
                <TeamBadge team={feature.home} size="xl" />
                <h2>{feature.home.name}</h2>
                <div className="feature-card__rank">
                  {featureHome ? `#${featureHome.rank} · power ${fmtNum(featureHome.rating.power, 0)}` : '—'}
                </div>
              </div>
              <div className="feature-card__centre">
                <div className="feature-card__score">
                  {feature.score
                    ? `${feature.score.home}–${feature.score.away}`
                    : `${feature.prediction.topScorelines[0].home}–${feature.prediction.topScorelines[0].away}`}
                </div>
                <div className="feature-card__score-label">
                  {feature.score ? 'final score' : 'most likely score'}
                </div>
                <ProbBar prediction={feature.prediction} height={9} showLabels />
              </div>
              <div className="feature-card__side feature-card__side--away">
                <TeamBadge team={feature.away} size="xl" />
                <h2>{feature.away.name}</h2>
                <div className="feature-card__rank">
                  {featureAway ? `#${featureAway.rank} · power ${fmtNum(featureAway.rating.power, 0)}` : '—'}
                </div>
              </div>
            </div>

            <div className="feature-card__bottom">
              <div className="feature-card__metrics">
                <span>
                  <small>Expected goals</small>
                  <b>
                    {fmtNum(feature.prediction.homeXg, 2)} – {fmtNum(feature.prediction.awayXg, 2)}
                  </b>
                </span>
                <span>
                  <small>Both teams score</small>
                  <b>{fmtPct(feature.prediction.btts)}</b>
                </span>
                <span>
                  <small>Over 2.5</small>
                  <b>{fmtPct(feature.prediction.over25)}</b>
                </span>
                <span>
                  <small>Top scorelines</small>
                  <b className="feature-card__scorelines">
                    {feature.prediction.topScorelines.slice(0, 2).map((score) => `${score.home}-${score.away}`).join(' · ')}
                  </b>
                </span>
              </div>
              <Link to={`/matches/${feature.id}`} className="btn btn--primary">
                Full breakdown <ChevronRight size={15} />
              </Link>
            </div>
          </article>

          <aside className="pulse-card">
            <div className="pulse-card__head">
              <div>
                <div className="eyebrow">Model pulse</div>
                <h2>Measured, not promised</h2>
              </div>
              <Sparkles size={18} className="pulse-card__icon" />
            </div>
            {data.backtest ? (
              <>
                <div className="pulse-grid">
                  <Stat label="Walk-forward" value={data.backtest.matches} hint="matches scored" />
                  <Stat label="Accuracy" value={fmtPct(data.backtest.accuracy, 1)} hint="outcome hit rate" tone="accent" />
                  <Stat label="Log loss" value={fmtNum(data.backtest.logLoss, 3)} hint="lower is better" />
                  <Stat label="Calibration" value={fmtPct(data.backtest.ece, 1)} hint="ECE" />
                </div>
                <div className="pulse-benchmark">
                  <div>
                    <span>vs base rate</span>
                    <b className={data.backtest.baselineLogLoss > data.backtest.logLoss ? 'delta delta--up' : 'delta delta--down'}>
                      {fmtSigned(((data.backtest.baselineLogLoss - data.backtest.logLoss) / data.backtest.baselineLogLoss) * 100)}%
                    </b>
                  </div>
                  <div>
                    <span>vs Understat</span>
                    <b>
                      {data.backtest.understatLogLoss
                        ? `${fmtNum(data.backtest.understatLogLoss, 3)}`
                        : '—'}
                    </b>
                  </div>
                  <div>
                    <span>simulations</span>
                    <b>{data.simulations.sims ? data.simulations.sims.toLocaleString() : 'season complete'}</b>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">Backtest will appear once enough matches have been played.</p>
            )}
            <div className="pulse-card__foot">
              <span>
                <span className="live-dot" /> {bootstrap?.modelVersion ?? 'dc-xg-1.0'}
              </span>
              <Link to="/model" className="text-link">
                Read the model card <ArrowUpRight size={13} />
              </Link>
            </div>
          </aside>
        </div>
      )}

      <section className="section">
        <SectionHead
          eyebrow="Fixtures"
          title={data.completed ? 'Recent results' : 'Next up'}
          action={
            <Link to="/fixtures" className="text-link">
              All fixtures <ArrowUpRight size={13} />
            </Link>
          }
        />
        <div className="match-grid">
          {(data.completed ? data.results : data.upcoming).slice(0, 4).map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
          {data.upcoming.length === 0 && data.completed && (
            <div className="empty">Season complete. Switch season to see live projections.</div>
          )}
        </div>
      </section>

      <div className="split split--wide">
        <section className="section">
          <SectionHead
            eyebrow={data.completed ? 'Final table' : 'Monte Carlo'}
            title={data.completed ? 'Season outcome' : 'Projected finish'}
            action={
              <Link to="/ratings" className="text-link">
                Ratings <ArrowUpRight size={13} />
              </Link>
            }
          />
          <div className="card card--flush">
            <div className="projection">
              {titleRows.map((row, index) => {
                const team = teamById.get(row.teamId);
                return (
                  <div className="projection__row" key={row.teamId}>
                    <span className="projection__rank">{index + 1}</span>
                    <TeamBadge team={{ name: row.name, shortName: row.shortName }} size="xs" />
                    <Link to={`/teams/${row.teamId}`} className="projection__team">
                      {row.name}
                    </Link>
                    <div className="projection__bar">
                      <span style={{ width: `${(row.title / maxTitle) * 100}%` }} />
                    </div>
                    <span className="projection__pct">{fmtPct(row.title, 0)}</span>
                    <span className="projection__pts">{fmtNum(row.avgPoints, 0)} pts</span>
                    <span className="projection__top4">{fmtPct(row.top4, 0)} top 4</span>
                    {team && <FormPills form={team.form} count={3} />}
                  </div>
                );
              })}
            </div>
            <div className="projection__note">
              {data.simulations.completed
                ? 'Completed season. Positions reflect the final table.'
                : `${data.simulations.sims.toLocaleString()} simulated seasons on current ratings and remaining fixtures.`}
            </div>
          </div>
        </section>

        <section className="section">
          <SectionHead
            eyebrow="Signals"
            title="What the data is saying"
            action={
              <Link to="/insights" className="text-link">
                All insights <ArrowUpRight size={13} />
              </Link>
            }
          />
          <div className="insight-stack">
            {data.insights.slice(0, 3).map((insight) => (
              <InsightMini key={insight.id} insight={insight} />
            ))}
          </div>
        </section>
      </div>

      <div className="split">
        <section className="section">
          <SectionHead
            eyebrow="Standings"
            title="The table, with context"
            action={
              <Link to="/ratings" className="text-link">
                Full table <ArrowUpRight size={13} />
              </Link>
            }
          />
          <div className="card card--flush table-wrap">
            <table className="table table--compact table--standings">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th className="num">P</th>
                  <th className="num">GD</th>
                  <th className="num">xGD</th>
                  <th className="num">Pts</th>
                  <th>Form</th>
                </tr>
              </thead>
              <tbody>
                {data.table.slice(0, 8).map((row) => (
                  <tr key={row.teamId}>
                    <td className="rank-cell">{row.position}</td>
                    <td>
                      <Link to={`/teams/${row.teamId}`} className="team-link">
                        <TeamBadge team={{ name: row.name, shortName: row.shortName }} size="xs" />
                        {row.name}
                      </Link>
                    </td>
                    <td className="num">{row.played}</td>
                    <td className="num">{fmtSigned(row.goalDifference, 0)}</td>
                    <td className="num">{fmtSigned(row.xgDifference, 1)}</td>
                    <td className="num strong">{row.points}</td>
                    <td>
                      <FormPills form={row.form} count={5} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <SectionHead eyebrow="Landscape" title="xG for vs xG against" />
          <div className="card chart-card">
            <ScatterChart points={scatterPoints} xLabel="xG created per match" yLabel="xG conceded per match" height={330} />
            <p className="chart-note">
              Bottom-right is the strongest quadrant: high creation, low concession. Dashed lines are league means.
            </p>
          </div>
        </section>
      </div>

      <div className="split">
        <section className="section">
          <SectionHead
            eyebrow="Power index"
            title="The ratings board"
            action={
              <Link to="/ratings" className="text-link">
                Explain the ratings <ArrowUpRight size={13} />
              </Link>
            }
          />
          <div className="card card--flush">
            {powerTeams.map((team, index) => (
              <Link to={`/teams/${team.id}`} key={team.id} className="power-row">
                <span className="power-row__rank">{index + 1}</span>
                <TeamBadge team={team} size="xs" />
                <span className="power-row__team">{team.name}</span>
                <span className="power-row__elo">{fmtNum(team.rating.elo, 0)} Elo</span>
                <div className="power-row__bar">
                  <span style={{ width: `${team.rating.power}%` }} />
                </div>
                <span className="power-row__value">{fmtNum(team.rating.power, 0)}</span>
                <Delta value={team.rating.form} digits={2} />
              </Link>
            ))}
          </div>
        </section>

        <section className="section">
          <SectionHead
            eyebrow="Players"
            title="Impact leaders"
            action={
              <Link to="/players" className="text-link">
                Player board <ArrowUpRight size={13} />
              </Link>
            }
          />
          <div className="card card--flush">
            {topPlayers.map((player) => (
              <Link to={`/players?focus=${player.id}`} key={player.id} className="player-row">
                <span className="player-row__rank">{player.rank}</span>
                <span className="player-avatar">{player.name.slice(0, 1)}</span>
                <span className="player-row__name">
                  {player.name}
                  <small>{player.teamName}</small>
                </span>
                <span className="player-row__meta">
                  {player.goals}G {player.assists}A
                </span>
                <span className="player-row__meta">{fmtNum(player.per90.xgxa, 2)} xG+xA/90</span>
                <span className="player-row__rating">{fmtNum(player.rating, 1)}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <footer className="page-foot">
        <span>
          <CalendarDays size={13} /> {data.coverage.matches} fixtures · {data.coverage.players} players · {seasonLabel}
        </span>
        <span>Projections are probabilistic. Nothing here is betting advice.</span>
      </footer>
    </>
  );
}
