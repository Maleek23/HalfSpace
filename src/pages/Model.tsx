import { Link } from 'react-router-dom';
import { ArrowUpRight, BrainCircuit, CheckCircle2, Info, Layers3, Sigma } from 'lucide-react';
import { useApi, fmtNum, fmtPct, timeAgo } from '../api';
import { useApp } from '../state';
import type { ModelResponse } from '../types';
import {
  ErrorState,
  Loading,
  PageHeader,
  SectionHead,
  Stat,
} from '../components/ui';
import { CalibrationChart } from '../components/charts';

export function Model() {
  const { league, season, leagueInfo } = useApp();
  const { data, loading, error, reload } = useApi<ModelResponse>(
    `/api/leagues/${league}/model?season=${season}`,
  );

  if (loading && !data) return <Loading rows={8} />;
  if (error || !data) return <ErrorState message={error ?? 'No model data'} onRetry={reload} />;

  const backtest = data.backtest;
  const improvement = backtest
    ? ((backtest.baselineLogLoss - backtest.logLoss) / backtest.baselineLogLoss) * 100
    : null;
  const maxLoss = backtest
    ? Math.max(backtest.logLoss, backtest.baselineLogLoss, backtest.understatLogLoss ?? 0)
    : 1;
  const totalOutcomes = backtest ? backtest.confusion.home + backtest.confusion.draw + backtest.confusion.away : 1;

  return (
    <>
      <PageHeader
        eyebrow={<><BrainCircuit size={12} /> {leagueInfo?.name} · {data.season.label}</>}
        title="Model card"
        subtitle="A transparent, reproducible forecast: opponent-adjusted xG ratings, a Dixon-Coles scoreline model and an Elo blend."
        actions={<span className="status-chip">v{data.modelVersion} · synced {timeAgo(data.updatedAt)}</span>}
      />

      <section className="model-hero">
        <div className="model-hero__copy">
          <div className="eyebrow">The forecast engine</div>
          <h2>Dixon-Coles xG, with an Elo reality check.</h2>
          <p>
            Attack and defence are estimated from time-decayed, opponent-adjusted expected goals, shrunk toward the league
            mean and blended with the previous season. Those rates generate a bivariate Poisson scoreline matrix, corrected
            for the known dependency between low scores. Elo contributes 18% of the final 1X2 probability.
          </p>
          <div className="model-hero__tags">
            <span>Opponent-adjusted</span>
            <span>Time-decayed</span>
            <span>Shrinkage</span>
            <span>Walk-forward tested</span>
          </div>
        </div>
        <div className="model-hero__stamp">
          <span className="mono-label">MODEL</span>
          <strong>{data.modelVersion}</strong>
          <span>{data.coverage.played} matches trained</span>
          <span>{data.coverage.remaining} remaining</span>
          <span>{data.completed ? 'Season complete' : `${data.simulations.sims.toLocaleString()} sims`}</span>
        </div>
      </section>

      {backtest ? (
        <>
          <div className="stat-strip stat-strip--model">
            <Stat label="Walk-forward matches" value={backtest.matches} hint="scored out-of-sample" />
            <Stat label="Log loss" value={fmtNum(backtest.logLoss, 3)} hint="lower is better" tone="accent" />
            <Stat label="Base rate" value={fmtNum(backtest.baselineLogLoss, 3)} hint="benchmark" />
            <Stat label="Accuracy" value={fmtPct(backtest.accuracy, 1)} hint={`${backtest.correct} correct`} />
            <Stat label="Brier score" value={fmtNum(backtest.brier, 3)} hint="probability error" />
            <Stat label="Calibration" value={fmtPct(backtest.ece, 1)} hint="ECE" />
          </div>

          <div className="split">
            <section className="section">
              <SectionHead eyebrow="Reliability" title="Calibration plot" />
              <div className="card chart-card">
                <CalibrationChart bins={backtest.calibration} />
                <p className="chart-note">
                  Dots on the dashed line are perfectly calibrated. Dot size shows sample count. Predicted probabilities
                  are pooled across home, draw and away outcomes.
                </p>
              </div>
            </section>

            <section className="section">
              <SectionHead eyebrow="Benchmark" title="Against the alternatives" />
              <div className="card benchmark">
                <div className="benchmark__row">
                  <span>HalfSpace model</span>
                  <div className="benchmark__bar">
                    <i style={{ width: `${(backtest.logLoss / maxLoss) * 100}%` }} className="benchmark__fill" />
                  </div>
                  <b>{fmtNum(backtest.logLoss, 3)}</b>
                </div>
                <div className="benchmark__row">
                  <span>League base rates</span>
                  <div className="benchmark__bar">
                    <i style={{ width: `${(backtest.baselineLogLoss / maxLoss) * 100}%` }} className="benchmark__fill benchmark__fill--muted" />
                  </div>
                  <b>{fmtNum(backtest.baselineLogLoss, 3)}</b>
                </div>
                {backtest.understatLogLoss && (
                  <div className="benchmark__row">
                    <span>Understat forecast</span>
                    <div className="benchmark__bar">
                      <i style={{ width: `${(backtest.understatLogLoss / maxLoss) * 100}%` }} className="benchmark__fill benchmark__fill--away" />
                    </div>
                    <b>{fmtNum(backtest.understatLogLoss, 3)}</b>
                  </div>
                )}
                {improvement !== null && (
                  <div className="benchmark__verdict">
                    <CheckCircle2 size={16} />
                    <span>
                      The model improves log loss by <b>{fmtNum(improvement, 1)}%</b> over the base-rate benchmark
                      {backtest.understatLogLoss
                        ? ` and is ${backtest.logLoss < backtest.understatLogLoss ? 'better' : 'worse'} than Understat's pre-match forecast.`
                        : '.'}
                    </span>
                  </div>
                )}
                <div className="benchmark__distribution">
                  <span className="eyebrow">Actual outcome mix</span>
                  <div className="mixbar">
                    <span style={{ width: `${(backtest.confusion.home / totalOutcomes) * 100}%` }} className="mixbar__home">
                      {fmtPct(backtest.confusion.home / totalOutcomes)}
                    </span>
                    <span style={{ width: `${(backtest.confusion.draw / totalOutcomes) * 100}%` }} className="mixbar__draw">
                      {fmtPct(backtest.confusion.draw / totalOutcomes)}
                    </span>
                    <span style={{ width: `${(backtest.confusion.away / totalOutcomes) * 100}%` }} className="mixbar__away">
                      {fmtPct(backtest.confusion.away / totalOutcomes)}
                    </span>
                  </div>
                  <div className="chart-legend">
                    <span><i className="legend-dot legend-dot--home" /> Home</span>
                    <span><i className="legend-dot legend-dot--draw" /> Draw</span>
                    <span><i className="legend-dot legend-dot--away" /> Away</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : (
        <div className="empty">Not enough played matches for a walk-forward backtest yet.</div>
      )}

      <section className="section">
        <SectionHead eyebrow="Pipeline" title="How a forecast is built" />
        <div className="pipeline">
          {[
            {
              step: '01',
              icon: Layers3,
              title: 'Rate every team',
              body: 'Time-decayed xG for and against are adjusted for opponent strength, shrunk toward the mean and blended with last season.',
            },
            {
              step: '02',
              icon: Sigma,
              title: 'Project goals',
              body: 'League home/away baselines multiply by each side’s attack and the opponent’s defence, with an Elo supremacy adjustment.',
            },
            {
              step: '03',
              icon: BrainCircuit,
              title: 'Build the matrix',
              body: 'Independent Poisson distributions generate an 8×8 scoreline grid; the Dixon-Coles tau correction fixes low-score dependency.',
            },
            {
              step: '04',
              icon: CheckCircle2,
              title: 'Test forward',
              body: 'Every historical match is priced using only the matches before it. Log loss, Brier, accuracy and calibration are scored out-of-sample.',
            },
          ].map((item) => (
            <div className="pipeline__step" key={item.step}>
              <span className="pipeline__step-num">{item.step}</span>
              <item.icon size={20} />
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="split">
        <section className="section">
          <SectionHead eyebrow="Inputs" title="What goes in" />
          <div className="card card--flush">
            <table className="table table--compact">
              <thead>
                <tr>
                  <th>Input</th>
                  <th>Source</th>
                  <th>Use</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Expected goals (xG / xGA)</td><td>Understat</td><td>Attack &amp; defence</td></tr>
                <tr><td>Non-penalty xG</td><td>Understat</td><td>Shot-quality robustness</td></tr>
                <tr><td>PPDA / deep completions</td><td>Understat</td><td>Tactical profile</td></tr>
                <tr><td>Results &amp; goals</td><td>Understat</td><td>Elo, points, backtest</td></tr>
                <tr><td>Player minutes &amp; xG/xA</td><td>Understat</td><td>Impact ratings, lineups</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <SectionHead eyebrow="Caveats" title="What it cannot see" />
          <div className="card limitations">
            <div><Info size={15} /><span>No injury, suspension or late fitness news. Projected XIs are not official team sheets.</span></div>
            <div><Info size={15} /><span>xG is a shot-quality model, not a truth. It ignores pressure, goalkeeper positioning and game state.</span></div>
            <div><Info size={15} /><span>No event-level defensive actions or tracking data. Full-backs and centre-backs share broad role codes.</span></div>
            <div><Info size={15} /><span>Newly promoted teams start with a league-average prior and gain confidence slowly.</span></div>
            <div><Info size={15} /><span>Probabilities are not betting advice. A calibrated 60% favourite still loses four times in ten.</span></div>
          </div>
        </section>
      </div>

      <div className="callout">
        <div>
          <div className="eyebrow">Reproducibility</div>
          <h3>Every number has a version</h3>
          <p>
            Model {data.modelVersion} · {data.coverage.matches} fixtures · {data.coverage.players} player rows · synced{' '}
            {timeAgo(data.updatedAt)}. Re-run the sync to rebuild ratings, simulations, insights and the backtest.
          </p>
        </div>
        <Link to="/data" className="btn btn--ghost">
          Data &amp; sync <ArrowUpRight size={14} />
        </Link>
      </div>
    </>
  );
}
