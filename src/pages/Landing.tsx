import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleDot,
  Database,
  LineChart,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { useApi, fmtNum, fmtPct } from '../api';
import { useApp } from '../state';
import type { Overview } from '../types';
import { ProbBar, TeamBadge } from '../components/ui';

function BrandMark() {
  return (
    <span className="brand__mark" aria-hidden="true">
      <svg viewBox="0 0 28 28" width="30" height="30">
        <rect x="1" y="1" width="26" height="26" rx="7" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
        <path d="M7 21V13h6V7h8v8h-6v6H7Z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const { bootstrap, setLeague } = useApp();
  const overview = useApi<Overview>('/api/leagues/premier-league/overview?season=2026');

  const data = overview.data;
  const next = data?.upcoming[0] ?? data?.results[0] ?? null;
  const backtest = data?.backtest;
  const totalMatches = bootstrap?.coverage.reduce((sum, item) => sum + item.matches, 0) ?? 0;
  const seasons = bootstrap?.seasons.length ?? 13;

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="landing-brand">
          <BrandMark />
          <span>
            <span className="brand__name">HALFSPACE</span>
            <span className="brand__sub">Football intelligence</span>
          </span>
        </Link>
        <nav className="landing-nav__links" aria-label="Landing navigation">
          <a href="#product">Product</a>
          <a href="#lab">Finishing lab</a>
          <a href="#method">Method</a>
          <a href="#data">Data</a>
        </nav>
        <div className="landing-nav__actions">
          <Link to="/overview" className="btn btn--ghost">Open the board <ArrowUpRight size={14} /></Link>
          <Link to="/compare" className="btn btn--primary">Compare players <ArrowRight size={14} /></Link>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <div className="landing-kicker">
              <span className="live-dot" />
              Premier League to Ligue 1 · 2014/15 — 2026/27
            </div>
            <h1>
              Argue with
              <span> evidence.</span>
            </h1>
            <p className="landing-lede">
              HalfSpace turns xG, ratings and projected lineups into probabilities you can inspect — then shows
              its work when two players, two teams or two arguments disagree.
            </p>
            <div className="landing-actions">
              <Link to="/overview" className="btn btn--primary btn--lg">
                Enter the model board <ArrowRight size={16} />
              </Link>
              <Link to="/compare" className="btn btn--ghost btn--lg">
                Try the finishing lab <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="landing-proof">
              <span><b>{bootstrap?.leagues.length ?? 5}</b> competitions</span>
              <span><b>{seasons}</b> seasons</span>
              <span><b>{totalMatches.toLocaleString()}</b> matches</span>
              <span><b>{fmtPct(backtest?.accuracy ?? 0.45, 0)}</b> walk-forward accuracy</span>
            </div>
          </div>

          <div className="landing-hero__visual">
            <div className="landing-board">
              <div className="landing-board__head">
                <span className="eyebrow">Live model board</span>
                <span className="status-chip"><CircleDot size={11} /> dc-xg-1.0</span>
              </div>
              {next ? (
                <>
                  <div className="landing-board__meta">
                    <span>{data?.league.name} · {data?.season.label}</span>
                    <span>Round {next.round}</span>
                  </div>
                  <div className="landing-board__teams">
                    <div className="landing-board__team">
                      <TeamBadge team={next.home} size="lg" />
                      <b>{next.home.name}</b>
                    </div>
                    <div className="landing-board__score">
                      <b>{next.score ? `${next.score.home}–${next.score.away}` : `${next.prediction.topScorelines[0].home}–${next.prediction.topScorelines[0].away}`}</b>
                      <small title="Most likely exact scoreline, with its probability">
                        {next.score
                          ? 'final score'
                          : `most likely · ${fmtPct(next.prediction.topScorelines[0].probability, 1)}`}
                      </small>
                    </div>
                    <div className="landing-board__team landing-board__team--away">
                      <TeamBadge team={next.away} size="lg" />
                      <b>{next.away.name}</b>
                    </div>
                  </div>
                  <ProbBar prediction={next.prediction} height={10} showLabels />
                  <div className="landing-board__metrics">
                    <span><small>Expected goals</small><b>{fmtNum(next.prediction.homeXg, 2)} – {fmtNum(next.prediction.awayXg, 2)}</b></span>
                    <span><small>BTTS</small><b>{fmtPct(next.prediction.btts)}</b></span>
                    <span><small>Over 2.5</small><b>{fmtPct(next.prediction.over25)}</b></span>
                  </div>
                  <Link to={`/matches/${next.id}`} className="landing-board__link">
                    Inspect the full forecast <ArrowUpRight size={14} />
                  </Link>
                  <div className="landing-board__signals">
                    <span><b>{fmtPct(backtest?.ece ?? 0.029, 1)}</b> ECE calibration</span>
                    <span><b>{(data?.simulations.sims ?? 3000).toLocaleString()}</b> season simulations</span>
                  </div>
                </>
              ) : (
                <div className="landing-board__loading">Loading the live board…</div>
              )}
            </div>
          </div>
        </section>

        <section className="landing-leagues" aria-label="Competitions">
          <span className="landing-leagues__label">Five leagues. One language.</span>
          <div className="landing-leagues__rail">
            {(bootstrap?.leagues ?? []).map((league) => (
              <button
                key={league.slug}
                className="landing-league"
                onClick={() => {
                  setLeague(league.slug);
                  navigate('/overview');
                }}
                style={{ '--item-accent': league.accent } as React.CSSProperties}
              >
                <span className="landing-league__dot" />
                <span>{league.name}</span>
                <span className="landing-league__code">{league.country.slice(0, 3).toUpperCase()}</span>
              </button>
            ))}
          </div>
        </section>

        <section id="product" className="landing-section">
          <div className="landing-section__head">
            <div>
              <div className="eyebrow">Three ways in</div>
              <h2>Prediction is the start. Explanation is the product.</h2>
            </div>
            <p>
              Every screen answers a question and shows the uncertainty around the answer. No black boxes, no
              certainty theatre.
            </p>
          </div>

          <div className="landing-pillars">
            <article className="landing-pillar">
              <span className="landing-pillar__icon"><Target size={20} /></span>
              <div className="eyebrow">01 · Predict</div>
              <h3>The model board</h3>
              <p>
                Opponent-adjusted xG, Dixon-Coles scorelines and Elo blended into match probabilities, then
                backtested walk-forward.
              </p>
              <Link to="/fixtures" className="text-link">Open the fixture model <ArrowUpRight size={13} /></Link>
            </article>

            <article className="landing-pillar">
              <span className="landing-pillar__icon"><UsersRound size={20} /></span>
              <div className="eyebrow">02 · Evaluate</div>
              <h3>Player intelligence</h3>
              <p>
                Impact ratings, role-adjusted percentiles and per-90 production. Read the profile, not just the
                goals column.
              </p>
              <Link to="/players" className="text-link">Explore the player index <ArrowUpRight size={13} /></Link>
            </article>

            <article className="landing-pillar">
              <span className="landing-pillar__icon"><ArrowLeftRight size={20} /></span>
              <div className="eyebrow">03 · Debate</div>
              <h3>The finishing lab</h3>
              <p>
                Separate volume, chance quality and execution. Compare two players across seasons without
                collapsing them into one misleading conversion rate.
              </p>
              <Link to="/compare" className="text-link">Settle a football argument <ArrowUpRight size={13} /></Link>
            </article>
          </div>
        </section>

        <section id="lab" className="landing-lab">
          <div className="landing-lab__copy">
            <div className="eyebrow">The signature feature</div>
            <h2>Not all goals are created equal.</h2>
            <p>
              A higher conversion rate can mean better finishing, better chances, a smaller sample, or all three.
              The finishing lab separates the dimensions and tells you when the evidence is inconclusive.
            </p>
            <ul className="landing-checklist">
              <li><span>01</span> Shot volume and opportunity, normalised per 90.</li>
              <li><span>02</span> Chance quality through xG per shot.</li>
              <li><span>03</span> Execution through goals minus xG — with caveats.</li>
              <li><span>04</span> Sample size, role and competition context.</li>
            </ul>
            <Link to="/compare" className="btn btn--primary">
              Open the finishing lab <ArrowUpRight size={15} />
            </Link>
            <p className="landing-lab__note">
              Current scope: aggregate season data from Understat. Shot-level PSxG and body-part splits require an
              event-data source and are marked as unavailable rather than invented.
            </p>
          </div>

          <div className="landing-compare">
            <div className="landing-compare__head">
              <span className="eyebrow">Exhibit A</span>
              <span className="mono-label">Hazard vs Salah · 2018/19</span>
            </div>
            <div className="landing-compare__players">
              <div>
                <span className="player-avatar">EH</span>
                <b>Eden Hazard</b>
                <small>Chelsea · 2018/19</small>
              </div>
              <span className="landing-compare__vs">vs</span>
              <div>
                <span className="player-avatar">MS</span>
                <b>Mohamed Salah</b>
                <small>Liverpool · 2018/19</small>
              </div>
            </div>
            <div className="landing-compare__rows">
              <div><span>Shot volume</span><i style={{ width: '72%' }} /><small>per 90</small></div>
              <div><span>Chance quality</span><i style={{ width: '58%' }} /><small>xG / shot</small></div>
              <div><span>Execution</span><i style={{ width: '44%' }} /><small>G − xG</small></div>
              <div><span>Sample strength</span><i style={{ width: '86%' }} /><small>minutes</small></div>
            </div>
            <div className="landing-compare__foot">
              <MessageCircle size={14} />
              <span>The lab sets the terms of the argument. You bring the claim.</span>
            </div>
          </div>
        </section>

        <section id="method" className="landing-section landing-section--method">
          <div className="landing-section__head">
            <div>
              <div className="eyebrow">The evidence layer</div>
              <h2>Calibrated, backtested, inspectable.</h2>
            </div>
            <Link to="/model" className="text-link">Read the model card <ArrowUpRight size={13} /></Link>
          </div>
          <div className="landing-method-grid">
            <article>
              <span className="landing-method__icon"><BarChart3 size={18} /></span>
              <b>{backtest ? fmtPct(backtest.accuracy, 1) : '—'}</b>
              <span>walk-forward accuracy</span>
              <p>Every played fixture is scored using only information available before kickoff.</p>
            </article>
            <article>
              <span className="landing-method__icon"><LineChart size={18} /></span>
              <b>{backtest ? fmtNum(backtest.logLoss, 3) : '—'}</b>
              <span>log loss</span>
              <p>Probabilities are judged on calibration, not just whether the favourite won.</p>
            </article>
            <article>
              <span className="landing-method__icon"><Sparkles size={18} /></span>
              <b>{(data?.simulations.sims ?? 3000).toLocaleString()}</b>
              <span>season simulations</span>
              <p>Title, top-four and relegation odds come from simulated remaining fixtures.</p>
            </article>
            <article>
              <span className="landing-method__icon"><ShieldCheck size={18} /></span>
              <b>{(backtest?.matches ?? 0).toLocaleString()}</b>
              <span>matches scored</span>
              <p>Walk-forward validation prevents the model from seeing the future it is predicting.</p>
            </article>
          </div>
        </section>

        <section id="data" className="landing-data">
          <div className="landing-data__copy">
            <div className="eyebrow">Data & provenance</div>
            <h2>Free-first. Explicit about what is missing.</h2>
            <p>
              The current build ingests Understat match and player-season data from 2014/15 onward. xG is
              provider-supplied; projections are model estimates. Shot-level post-shot xG, pressure and tracking
              data are not available in this source and are not fabricated.
            </p>
            <div className="landing-data__links">
              <Link to="/data" className="text-link"><Database size={14} /> View coverage and API</Link>
              <Link to="/model" className="text-link"><Trophy size={14} /> Model methodology</Link>
            </div>
          </div>
          <div className="landing-data__stats">
            <div><b>{bootstrap?.leagues.length ?? 5}</b><span>competitions</span></div>
            <div><b>{seasons}</b><span>seasons</span></div>
            <div><b>{totalMatches.toLocaleString()}</b><span>matches</span></div>
            <div><b>{(bootstrap?.coverage.reduce((sum, item) => sum + item.players, 0) ?? 0).toLocaleString()}</b><span>player-season rows</span></div>
          </div>
        </section>

        <section className="landing-final">
          <div className="eyebrow">Ready when the argument is</div>
          <h2>Stop arguing from memory.<br />Start arguing from evidence.</h2>
          <div className="landing-actions">
            <Link to="/overview" className="btn btn--primary btn--lg">Open the board <ArrowRight size={16} /></Link>
            <Link to="/compare" className="btn btn--ghost btn--lg">Compare two players <ArrowUpRight size={15} /></Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer__brand">
          <BrandMark />
          <span><b>HALFSPACE</b><small>Football intelligence</small></span>
        </div>
        <p>Built for arguments, not certainties. xG data from Understat; model estimates are not betting advice.</p>
        <div className="landing-footer__links">
          <Link to="/overview">Overview</Link>
          <Link to="/compare">Finishing lab</Link>
          <Link to="/model">Model</Link>
          <Link to="/data">Data</Link>
        </div>
      </footer>
    </div>
  );
}
