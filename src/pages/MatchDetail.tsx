import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Check, Info, X } from 'lucide-react';
import { useApi, fmtDateTime, fmtNum, fmtPct, fmtSigned } from '../api';
import { useApp } from '../state';
import type { MatchDetail as MatchDetailType, Player, Team } from '../types';
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
import { Pitch, ScoreHeatmap } from '../components/charts';
import { PlayerDrawer } from '../components/PlayerDrawer';

function FactorRow({
  label,
  detail,
  value,
  favours,
}: {
  label: string;
  detail: string;
  value: string;
  favours: 'home' | 'away' | 'neutral';
}) {
  return (
    <div className="factor">
      <div className="factor__top">
        <span>{label}</span>
        <b className={favours === 'home' ? 'delta--up' : favours === 'away' ? 'delta--down' : ''}>{value}</b>
      </div>
      <div className="factor__detail">{detail}</div>
      <div className="factor__track">
        <span className={`factor__fill factor__fill--${favours}`} />
      </div>
    </div>
  );
}

function MarketRow({ label, probability, tone }: { label: string; probability: number; tone?: 'home' | 'away' }) {
  return (
    <div className="market">
      <span>{label}</span>
      <div className="market__bar">
        <i className={tone ? `market__fill market__fill--${tone}` : 'market__fill'} style={{ width: `${Math.min(100, probability * 100)}%` }} />
      </div>
      <b>{fmtPct(probability)}</b>
    </div>
  );
}

export function MatchDetail() {
  const { id } = useParams();
  const { leagueInfo, setLeague } = useApp();
  const { data, loading, error, reload } = useApi<MatchDetailType>(id ? `/api/matches/${id}` : null);
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (data && data.league.slug !== leagueInfo?.slug) setLeague(data.league.slug);
  }, [data, leagueInfo?.slug, setLeague]);

  if (loading && !data) return <Loading rows={8} />;
  if (error || !data) return <ErrorState message={error ?? 'Match not found'} onRetry={reload} />;

  const { match, teams, lineups, h2h, insights } = data;
  const home = teams.home;
  const away = teams.away;
  const matrix = match.prediction.matrix ?? [];
  const outcomeLabels = { H: home.shortName, D: 'Draw', A: away.shortName };
  const pick =
    match.prediction.homeWin >= match.prediction.draw && match.prediction.homeWin >= match.prediction.awayWin
      ? 'H'
      : match.prediction.draw >= match.prediction.awayWin
        ? 'D'
        : 'A';
  const pickProbability =
    pick === 'H' ? match.prediction.homeWin : pick === 'D' ? match.prediction.draw : match.prediction.awayWin;
  const top = match.prediction.topScorelines;
  const maxTop = Math.max(...top.map((score) => score.probability), 0.01);

  const sumMatrix = (predicate: (homeGoals: number, awayGoals: number) => boolean) =>
    matrix.reduce(
      (total, row, homeGoals) =>
        total + row.reduce((rowTotal, probability, awayGoals) => rowTotal + (predicate(homeGoals, awayGoals) ? probability : 0), 0),
      0,
    );
  const homeWinToNil = sumMatrix((h, a) => h > 0 && a === 0);
  const awayWinToNil = sumMatrix((h, a) => a > 0 && h === 0);
  const doubleChance1X = match.prediction.homeWin + match.prediction.draw;
  const doubleChance12 = match.prediction.homeWin + match.prediction.awayWin;
  const doubleChanceX2 = match.prediction.draw + match.prediction.awayWin;
  const over15 = match.prediction.over15 ?? sumMatrix((h, a) => h + a > 1.5);
  const over25 = match.prediction.over25 ?? sumMatrix((h, a) => h + a > 2.5);
  const over35 = match.prediction.over35 ?? sumMatrix((h, a) => h + a > 3.5);
  const under25 = 1 - over25;

  const attackEdge = home.rating.attack - away.rating.defence;
  const awayThreat = away.rating.attack - home.rating.defence;
  const eloGap = home.rating.elo - away.rating.elo;
  const formGap = home.rating.form - away.rating.form;

  const resultText =
    match.status === 'played' && match.score
      ? match.result?.correct
        ? 'Model pick landed'
        : 'Model pick missed'
      : `${fmtPct(pickProbability)} on ${outcomeLabels[pick]}`;

  return (
    <>
      <div className="back-row">
        <Link to="/fixtures" className="text-link">
          <ArrowLeft size={14} /> Fixtures
        </Link>
        <span className="mono-label">
          {leagueInfo?.name} · {data.season.label} · Round {match.round}
        </span>
      </div>

      <section className="match-hero">
        <div className="match-hero__meta">
          <span>{fmtDateTime(match.kickoff)}</span>
          <span className={`status-pill status-pill--${match.status}`}>{match.status === 'played' ? 'Full time' : 'Projection'}</span>
          <ConfidenceChip label={match.prediction.confidenceLabel} score={match.prediction.confidence} />
        </div>

        <div className="match-hero__grid">
          <div className="match-hero__side">
            <Link to={`/teams/${home.id}`} className="match-hero__team">
              <TeamBadge team={home} size="xl" />
              <h1>{home.name}</h1>
            </Link>
            <div className="match-hero__sub">
              #{home.rank} · power {fmtNum(home.rating.power, 0)} · Elo {fmtNum(home.rating.elo, 0)}
            </div>
            <FormPills form={home.form} count={5} />
          </div>

          <div className="match-hero__centre">
            <div className="match-hero__score">
              {match.score
                ? `${match.score.home}–${match.score.away}`
                : `${top[0].home}–${top[0].away}`}
            </div>
            <div className="match-hero__score-label">
              {match.score ? 'final score' : `most likely · ${fmtPct(top[0].probability, 1)}`}
            </div>
            <ProbBar prediction={match.prediction} height={10} showLabels />
            <div className="match-hero__pick">{resultText}</div>
          </div>

          <div className="match-hero__side match-hero__side--away">
            <Link to={`/teams/${away.id}`} className="match-hero__team">
              <TeamBadge team={away} size="xl" />
              <h1>{away.name}</h1>
            </Link>
            <div className="match-hero__sub">
              #{away.rank} · power {fmtNum(away.rating.power, 0)} · Elo {fmtNum(away.rating.elo, 0)}
            </div>
            <FormPills form={away.form} count={5} />
          </div>
        </div>

        <div className="match-hero__facts">
          <span><small>Expected goals</small><b>{fmtNum(match.prediction.homeXg, 2)} – {fmtNum(match.prediction.awayXg, 2)}</b></span>
          <span><small>Actual xG</small><b>{match.xg ? `${fmtNum(match.xg.home, 2)} – ${fmtNum(match.xg.away, 2)}` : '—'}</b></span>
          <span><small>BTTS</small><b>{fmtPct(match.prediction.btts)}</b></span>
          <span><small>Over 2.5</small><b>{fmtPct(over25)}</b></span>
          <span><small>Top score</small><b>{top[0].home}–{top[0].away} · {fmtPct(top[0].probability, 1)}</b></span>
          {match.status === 'played' && (
            <span>
              <small>Model result</small>
              <b className={match.result?.correct ? 'delta--up' : 'delta--down'}>
                {match.result?.correct ? <Check size={13} /> : <X size={13} />} {match.result?.correct ? 'Correct' : 'Missed'}
              </b>
            </span>
          )}
        </div>
      </section>

      <div className="split split--wide">
        <section className="section">
          <SectionHead eyebrow="Distribution" title="Scoreline matrix" />
          <div className="card">
            <div className="scoreline-layout">
              <ScoreHeatmap matrix={matrix} home={home.shortName} away={away.shortName} />
              <div className="scoreline-list">
                <div className="eyebrow">Most likely</div>
                {top.slice(0, 7).map((score) => (
                  <div className="scoreline-list__row" key={`${score.home}-${score.away}`}>
                    <span>{score.home}–{score.away}</span>
                    <div className="scoreline-list__bar">
                      <i style={{ width: `${(score.probability / maxTop) * 100}%` }} />
                    </div>
                    <b>{fmtPct(score.probability, 1)}</b>
                  </div>
                ))}
              </div>
            </div>
            <p className="chart-note">
              Cell values are probabilities (%). The Dixon-Coles correction lifts 0–0 and 1–1 and trims 1–0 / 0–1.
            </p>
          </div>
        </section>

        <section className="section">
          <SectionHead eyebrow="Prices" title="Derived markets" />
          <div className="card markets">
            <div className="eyebrow">Match result</div>
            <MarketRow label={home.shortName} probability={match.prediction.homeWin} tone="home" />
            <MarketRow label="Draw" probability={match.prediction.draw} />
            <MarketRow label={away.shortName} probability={match.prediction.awayWin} tone="away" />

            <div className="eyebrow">Double chance</div>
            <MarketRow label={`${home.shortName} or draw`} probability={doubleChance1X} tone="home" />
            <MarketRow label="Either team" probability={doubleChance12} />
            <MarketRow label={`Draw or ${away.shortName}`} probability={doubleChanceX2} tone="away" />

            <div className="eyebrow">Goals</div>
            <MarketRow label="Over 1.5" probability={over15} />
            <MarketRow label="Over 2.5" probability={over25} />
            <MarketRow label="Over 3.5" probability={over35} />
            <MarketRow label="Under 2.5" probability={under25} />

            <div className="eyebrow">Both teams</div>
            <MarketRow label="BTTS — yes" probability={match.prediction.btts} />
            <MarketRow label="BTTS — no" probability={1 - match.prediction.btts} />

            <div className="eyebrow">Clean sheets</div>
            <MarketRow label={`${home.shortName} clean sheet`} probability={match.prediction.homeCleanSheet} tone="home" />
            <MarketRow label={`${away.shortName} clean sheet`} probability={match.prediction.awayCleanSheet} tone="away" />
            <MarketRow label={`${home.shortName} win to nil`} probability={homeWinToNil} tone="home" />
            <MarketRow label={`${away.shortName} win to nil`} probability={awayWinToNil} tone="away" />
          </div>
        </section>
      </div>

      <div className="split">
        <section className="section">
          <SectionHead eyebrow="Explainability" title="Why the model leans this way" />
          <div className="card factor-card">
            <FactorRow
              label="Home attack × away defence"
              detail={`${home.shortName} attack ${fmtNum(home.rating.attack, 2)} · ${away.shortName} defence ${fmtNum(away.rating.defence, 2)}`}
              value={fmtSigned(attackEdge, 2)}
              favours={attackEdge > 0.02 ? 'home' : attackEdge < -0.02 ? 'away' : 'neutral'}
            />
            <FactorRow
              label="Away attack × home defence"
              detail={`${away.shortName} attack ${fmtNum(away.rating.attack, 2)} · ${home.shortName} defence ${fmtNum(home.rating.defence, 2)}`}
              value={fmtSigned(awayThreat, 2)}
              favours={awayThreat > 0.02 ? 'away' : awayThreat < -0.02 ? 'home' : 'neutral'}
            />
            <FactorRow
              label="Elo gap"
              detail={`${home.shortName} ${fmtNum(home.rating.elo, 0)} · ${away.shortName} ${fmtNum(away.rating.elo, 0)}`}
              value={fmtSigned(eloGap, 0)}
              favours={eloGap > 10 ? 'home' : eloGap < -10 ? 'away' : 'neutral'}
            />
            <FactorRow
              label="Recent xG difference"
              detail="Five-match rolling expected-goal difference, per game"
              value={fmtSigned(formGap, 2)}
              favours={formGap > 0.1 ? 'home' : formGap < -0.1 ? 'away' : 'neutral'}
            />
            <div className="factor-note">
              <Info size={14} />
              <span>
                The forecast is a blend: 82% Dixon-Coles xG model, 18% Elo win expectancy. Home advantage is estimated
                from the league's home/away xG split; this fixture is priced at {fmtNum(data.match.prediction.homeXg, 2)} –
                {fmtNum(data.match.prediction.awayXg, 2)} expected goals.
              </span>
            </div>
          </div>
        </section>

        <section className="section">
          <SectionHead eyebrow="Form" title="Last five, with underlying numbers" />
          <div className="card form-compare">
            {[home, away].map((team) => (
              <div className="form-compare__team" key={team.id}>
                <div className="form-compare__head">
                  <TeamBadge team={team} size="sm" />
                  <span>{team.name}</span>
                  <FormPills form={team.form} count={5} />
                </div>
                <div className="form-compare__rows">
                  {team.form.slice(-4).reverse().map((match) => (
                    <div className="form-compare__row" key={match.matchId}>
                      <span className="form-compare__opp">
                        {match.home ? 'vs' : 'at'} {match.opponent.shortName}
                      </span>
                      <b>{match.goalsFor}–{match.goalsAgainst}</b>
                      <span className="mono-label">
                        xG {fmtNum(match.xgFor, 2)}–{fmtNum(match.xgAgainst, 2)}
                      </span>
                      <span className={`form__pill form__pill--${match.outcome.toLowerCase()}`}>{match.outcome}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="section">
        <SectionHead eyebrow="Projected XIs" title="How the teams might line up" />
        <div className="lineup-duo">
          {[lineups.home, lineups.away].map((lineup) => (
            <div className="lineup-card" key={lineup.team.id}>
              <div className="lineup-card__head">
                <TeamBadge team={lineup.team} size="sm" />
                <div>
                  <b>{lineup.team.name}</b>
                  <span className="mono-label">{lineup.formationLabel}</span>
                </div>
                <Link to={`/lineups?team=${lineup.team.id}`} className="text-link">
                  Open lab <ArrowUpRight size={13} />
                </Link>
              </div>
              <Pitch lineup={lineup} compact onPlayer={setPlayer} />
              {lineup.complete === false && (
                <p className="chart-note">
                  Partial XI: {lineup.xi.length} of 11 slots filled from the available player data. Unfilled slots are
                  intentional, not invented.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="split">
        <section className="section">
          <SectionHead eyebrow="History" title="Head to head" />
          <div className="card card--flush">
            {h2h.length === 0 && <div className="empty">No previous meetings in the data window.</div>}
            {h2h.map((meeting) => (
              <div className="h2h-row" key={meeting.id}>
                <span className="mono-label">{meeting.season}</span>
                <span className="h2h-row__team">{meeting.home.shortName}</span>
                <b>{meeting.homeGoals}–{meeting.awayGoals}</b>
                <span className="h2h-row__team h2h-row__team--away">{meeting.away.shortName}</span>
                <span className="mono-label">{meeting.kickoff.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <SectionHead eyebrow="Signals" title="Match insights" />
          <div className="insight-stack">
            {insights.length === 0 && <div className="empty">No match-specific signals clear the threshold.</div>}
            {insights.slice(0, 3).map((insight) => (
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
          </div>
        </section>
      </div>

      <div className="callout">
        <div>
          <div className="eyebrow">Availability note</div>
          <h3>Lineups are projections</h3>
          <p>
            XIs are selected from season minutes, role fit and impact rating. They are not official team sheets and do not
            account for late fitness news or suspensions.
          </p>
        </div>
        <Link to={`/lineups?team=${home.id}`} className="btn btn--ghost">
          Lineup lab <ArrowUpRight size={14} />
        </Link>
      </div>

      <PlayerDrawer player={player} onClose={() => setPlayer(null)} />
    </>
  );
}
