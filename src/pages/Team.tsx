import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Shirt, UsersRound } from 'lucide-react';
import { useApi, fmtDate, fmtNum, fmtPct, fmtSigned } from '../api';
import { useApp } from '../state';
import type { Player, TeamDetail } from '../types';
import {
  ConfidenceChip,
  ErrorState,
  FormPills,
  Loading,
  ProbBar,
  SectionHead,
  Stat,
  TeamBadge,
} from '../components/ui';
import { Pitch, RadarChart, TrendChart } from '../components/charts';
import { PlayerDrawer } from '../components/PlayerDrawer';

export function Team() {
  const { id } = useParams();
  const { leagueInfo, season, setLeague } = useApp();
  const { data, loading, error, reload } = useApi<TeamDetail>(
    id ? `/api/teams/${id}?season=${season}` : null,
  );
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (data && data.league.slug !== leagueInfo?.slug) setLeague(data.league.slug);
  }, [data, leagueInfo?.slug, setLeague]);

  if (loading && !data) return <Loading rows={9} />;
  if (error || !data) return <ErrorState message={error ?? 'Team not found'} onRetry={reload} />;

  const { team, squad, lineup, insights } = data;
  const played = Math.max(1, team.stats.played);
  const recent = [...team.results].reverse();
  const xgFor = recent.map((match) => (match.home.id === team.id ? match.xg?.home ?? 0 : match.xg?.away ?? 0));
  const xgAgainst = recent.map((match) => (match.home.id === team.id ? match.xg?.away ?? 0 : match.xg?.home ?? 0));
  const labels = recent.map((match) => (match.home.id === team.id ? match.away.shortName : match.home.shortName));

  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  const radar = [
    { label: 'Attack', value: clamp(((team.rating.attack - 0.65) / 0.9) * 100) },
    { label: 'Defence', value: clamp(((1.55 - team.rating.defence) / 0.9) * 100) },
    { label: 'Press', value: clamp(((18 - (team.stats.ppda ?? 14)) / 10) * 100) },
    { label: 'Deep', value: clamp((team.stats.deep / played / 18) * 100) },
    { label: 'Form', value: clamp(((team.rating.form + 1.6) / 3.2) * 100) },
    { label: 'PPG', value: clamp((team.stats.points / played / 2.5) * 100) },
  ];

  return (
    <>
      <div className="back-row">
        <Link to="/ratings" className="text-link">
          <ArrowLeft size={14} /> Power ratings
        </Link>
        <span className="mono-label">
          {leagueInfo?.name} · {data.season.label}
        </span>
      </div>

      <section className="team-hero">
        <div className="team-hero__identity">
          <TeamBadge team={team} size="xl" />
          <div>
            <div className="eyebrow">Rank #{team.rank} · Power {fmtNum(team.rating.power, 0)}</div>
            <h1 className="page-title">{team.name}</h1>
            <div className="team-hero__form">
              <FormPills form={team.form} count={5} />
              <span className="muted small">
                {team.stats.wins}W {team.stats.draws}D {team.stats.losses}L · {team.stats.points} pts
              </span>
            </div>
          </div>
        </div>
        <div className="team-hero__actions">
          <Link to={`/lineups?team=${team.id}`} className="btn btn--primary">
            <Shirt size={15} /> Lineup lab
          </Link>
          <Link to="/players" className="btn btn--ghost">
            <UsersRound size={15} /> Players
          </Link>
        </div>
      </section>

      <div className="stat-strip">
        <Stat label="Points" value={team.stats.points} hint={`${fmtNum(team.stats.points / played, 2)} per game`} />
        <Stat label="xG difference" value={fmtSigned(team.stats.xgd, 1)} hint={`${fmtSigned(team.rating.xgDiff90, 2)} per game`} tone={team.stats.xgd > 0 ? 'accent' : 'danger'} />
        <Stat label="xG created" value={fmtNum(team.stats.xg, 1)} hint={`${fmtNum(team.stats.xgPerGame, 2)} per match`} />
        <Stat label="xG conceded" value={fmtNum(team.stats.xga, 1)} hint={`${fmtNum(team.stats.xgaPerGame, 2)} per match`} />
        <Stat label="PPDA" value={team.stats.ppda ? fmtNum(team.stats.ppda, 1) : '—'} hint="lower = more press" />
        <Stat label="Elo" value={fmtNum(team.rating.elo, 0)} hint="results-based" />
      </div>

      <div className="split">
        <section className="section">
          <SectionHead eyebrow="Profile" title="Team shape, in six axes" />
          <div className="card radar-card">
            <RadarChart axes={radar} size={310} />
            <div className="radar-notes">
              <p>All axes are normalised to a 0–100 scale. Press uses the inverse of PPDA; deep counts progressive completions into the final third.</p>
              <div className="radar-axis-list">
                {radar.map((axis) => (
                  <span key={axis.label}>
                    <b>{axis.label}</b>
                    <i><span style={{ width: `${axis.value}%` }} /></i>
                    <strong>{Math.round(axis.value)}</strong>
                  </span>
                ))}
              </div>
              <div className="radar-key">
                <span><i />Attack / creation</span>
                <span><i />Defence / control</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <SectionHead eyebrow="Trend" title="Expected goals, match by match" />
          <div className="card chart-card">
            <TrendChart
              series={[
                { label: 'xG for', values: xgFor, color: 'var(--accent)' },
                { label: 'xG against', values: xgAgainst, color: '#ff8a5b', dashed: true },
              ]}
              labels={labels}
              height={245}
            />
            <div className="chart-legend">
              <span><i className="legend-dot legend-dot--home" /> xG for</span>
              <span><i className="legend-dot legend-dot--away" /> xG against</span>
              <span className="muted small">Last {recent.length} matches · chronological</span>
            </div>
          </div>
        </section>
      </div>

      <div className="split split--wide">
        <section className="section">
          <SectionHead eyebrow="Projection" title="Projected XI" action={<Link to={`/lineups?team=${team.id}`} className="text-link">Open lab <ArrowUpRight size={13} /></Link>} />
          <div className="card">
            <div className="lineup-card__head">
              <TeamBadge team={lineup.team} size="sm" />
              <div>
                <b>{lineup.team.name}</b>
                <span className="mono-label">{lineup.formationLabel}</span>
              </div>
            </div>
            <Pitch lineup={lineup} onPlayer={setPlayer} />
            <div className="pitch-mobile-list">
              {[...lineup.xi]
                .sort((a, b) => {
                  const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;
                  return order[a.group] - order[b.group] || a.x - b.x;
                })
                .map((entry) => (
                  <button key={entry.slot} onClick={() => setPlayer(entry.player)}>
                    <span>{entry.label}</span>
                    <b>{entry.player.name}</b>
                    <small>{entry.player.role}</small>
                  </button>
                ))}
            </div>
            <p className="chart-note">{lineup.notes}</p>
          </div>
        </section>

        <section className="section">
          <SectionHead eyebrow="Reading" title="Strengths & weaknesses" />
          <div className="insight-stack">
            {insights.filter((insight) => insight.type === 'team').slice(0, 4).map((insight) => (
              <article className="insight-mini" key={insight.id}>
                <div className="insight-mini__top">
                  <span className={`tag tag--${insight.type}`}>{insight.category}</span>
                  <span className={`conf-dot conf-dot--${insight.confidence.toLowerCase()}`} />
                </div>
                <h3>{insight.headline}</h3>
                <p>{insight.body}</p>
                <div className="insight-mini__evidence">
                  {insight.evidence.slice(0, 3).map((item) => (
                    <span key={item.label}>
                      <small>{item.label}</small>
                      <b>{item.value}</b>
                    </span>
                  ))}
                </div>
              </article>
            ))}
            {insights.filter((insight) => insight.type === 'team').length === 0 && (
              <div className="empty">No team signals clear the threshold yet.</div>
            )}
          </div>
        </section>
      </div>

      <div className="split">
        <section className="section">
          <SectionHead eyebrow="Fixtures" title="Next up" />
          <div className="card card--flush">
            {team.upcoming.length === 0 && <div className="empty">No remaining fixtures.</div>}
            {team.upcoming.map((match) => {
              const isHome = match.home.id === team.id;
              const opponent = isHome ? match.away : match.home;
              const winProb = isHome ? match.prediction.homeWin : match.prediction.awayWin;
              return (
                <Link to={`/matches/${match.id}`} key={match.id} className="next-fixture">
                  <span className="next-fixture__date">{fmtDate(match.kickoff)}</span>
                  <TeamBadge team={opponent} size="xs" />
                  <span className="next-fixture__team">
                    {isHome ? 'vs' : 'at'} {opponent.name}
                  </span>
                  <span className="next-fixture__prob">{fmtPct(winProb)} win</span>
                  <ConfidenceChip label={match.prediction.confidenceLabel} score={match.prediction.confidence} />
                  <ArrowUpRight size={14} />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="section">
          <SectionHead eyebrow="Results" title="Recent matches" />
          <div className="card card--flush">
            {team.results.map((match) => {
              const isHome = match.home.id === team.id;
              const opponent = isHome ? match.away : match.home;
              const gf = isHome ? match.score?.home ?? 0 : match.score?.away ?? 0;
              const ga = isHome ? match.score?.away ?? 0 : match.score?.home ?? 0;
              return (
                <Link to={`/matches/${match.id}`} key={match.id} className="result-row">
                  <span className={`form__pill form__pill--${gf > ga ? 'w' : gf === ga ? 'd' : 'l'}`}>
                    {gf > ga ? 'W' : gf === ga ? 'D' : 'L'}
                  </span>
                  <TeamBadge team={opponent} size="xs" />
                  <span className="result-row__team">{isHome ? 'vs' : 'at'} {opponent.name}</span>
                  <b>{gf}–{ga}</b>
                  <span className="mono-label">xG {fmtNum(isHome ? match.xg?.home ?? 0 : match.xg?.away ?? 0, 2)}–{fmtNum(isHome ? match.xg?.away ?? 0 : match.xg?.home ?? 0, 2)}</span>
                  <span className="mono-label">{fmtDate(match.kickoff)}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <section className="section">
        <SectionHead
          eyebrow="Squad"
          title={`${squad.length} players`}
          action={<span className="muted small">Click a player for the full profile</span>}
        />
        <div className="card card--flush table-wrap squad-table-wrap">
          <table className="table squad-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Role</th>
                <th className="num">Min</th>
                <th className="num">G</th>
                <th className="num">A</th>
                <th className="num">xG</th>
                <th className="num">xA</th>
                <th className="num">xG+xA/90</th>
                <th className="num">Rating</th>
              </tr>
            </thead>
            <tbody>
              {squad.map((item) => (
                <tr key={item.id} onClick={() => setPlayer(item)} className="clickable">
                  <td>
                    <span className="player-link">
                      <span className="player-avatar player-avatar--sm">{item.name.slice(0, 1)}</span>
                      {item.name}
                    </span>
                  </td>
                  <td><span className={`role role--${item.role.toLowerCase()}`}>{item.role}</span></td>
                  <td className="num">{item.minutes.toLocaleString()}</td>
                  <td className="num">{item.goals}</td>
                  <td className="num">{item.assists}</td>
                  <td className="num">{fmtNum(item.xg, 1)}</td>
                  <td className="num">{fmtNum(item.xa, 1)}</td>
                  <td className="num">{fmtNum(item.per90.xgxa, 2)}</td>
                  <td className="num">
                    <span className="rating-pill">{fmtNum(item.rating, 1)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="squad-mobile">
          {squad.map((item) => (
            <button className="squad-mobile__row" key={item.id} onClick={() => setPlayer(item)}>
              <span className="player-avatar player-avatar--sm">{item.name.slice(0, 1)}</span>
              <span className="squad-mobile__name">
                {item.name}
                <small>{item.role} · {item.minutes.toLocaleString()} min</small>
              </span>
              <span className="squad-mobile__stats">
                <b>{fmtNum(item.rating, 1)}</b>
                <small>{item.goals}G {item.assists}A · {fmtNum(item.per90.xgxa, 2)} xG+xA/90</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <PlayerDrawer player={player} onClose={() => setPlayer(null)} />
    </>
  );
}
