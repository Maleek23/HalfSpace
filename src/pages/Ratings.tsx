import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BarChart3, Info } from 'lucide-react';
import { useApi, fmtNum, fmtPct, fmtSigned } from '../api';
import { useApp } from '../state';
import type { RatingsResponse } from '../types';
import {
  Delta,
  ErrorState,
  FormPills,
  Loading,
  PageHeader,
  SectionHead,
  TeamBadge,
} from '../components/ui';
import { ScatterChart } from '../components/charts';

type SortKey = 'position' | 'power' | 'elo' | 'xgd' | 'attack' | 'defence' | 'ppda';

const LABELS: Record<SortKey, string> = {
  position: 'Table',
  power: 'Power',
  elo: 'Elo',
  xgd: 'xGD / 90',
  attack: 'Attack',
  defence: 'Defence',
  ppda: 'PPDA',
};

export function Ratings() {
  const { league, season, leagueInfo } = useApp();
  const { data, loading, error, reload } = useApi<RatingsResponse>(
    `/api/leagues/${league}/ratings?season=${season}`,
  );
  const [sort, setSort] = useState<SortKey>('position');

  const rows = useMemo(() => {
    if (!data) return [];
    const list = [...data.table];
    const value = (row: (typeof list)[number]) => {
      switch (sort) {
        case 'power':
          return row.power;
        case 'elo':
          return row.elo;
        case 'xgd':
          return row.xgDifference;
        case 'attack':
          return row.xg;
        case 'defence':
          return -row.xga;
        case 'ppda':
          return row.ppda ?? 99;
        default:
          return row.position;
      }
    };
    return list.sort((a, b) => (sort === 'position' ? value(a) - value(b) : value(b) - value(a)));
  }, [data, sort]);

  if (loading && !data) return <Loading rows={10} />;
  if (error || !data) return <ErrorState message={error ?? 'No ratings'} onRetry={reload} />;

  const scatterPoints = data.table.map((row) => ({
    x: row.played ? row.xg / row.played : 0,
    y: row.played ? row.xga / row.played : 0,
    label: row.shortName,
    name: row.name,
  }));
  const simulations = [...data.simulations.outcomes].sort((a, b) => b.title - a.title);
  const champion = data.table[0];

  return (
    <>
      <PageHeader
        eyebrow={<><BarChart3 size={12} /> {leagueInfo?.name} · {data.season.label}</>}
        title="Power ratings"
        subtitle="Opponent-adjusted, xG-led and recency-weighted. The table tells you what happened; the ratings tell you what is likely to keep happening."
        actions={
          data.backtest ? (
            <span className="status-chip">
              Log loss {fmtNum(data.backtest.logLoss, 3)} · {fmtPct(data.backtest.accuracy, 1)} accuracy
            </span>
          ) : undefined
        }
      />

      <div className="explain-strip">
        <div className="explain-card">
          <span className="explain-card__num">01</span>
          <h3>xG, not goals</h3>
          <p>Attack and defence start from expected goals, adjusted for the strength of each opponent faced.</p>
        </div>
        <div className="explain-card">
          <span className="explain-card__num">02</span>
          <h3>Recency-weighted</h3>
          <p>Each match decays with a six-game half-life. A team is judged on its current process, not its reputation.</p>
        </div>
        <div className="explain-card">
          <span className="explain-card__num">03</span>
          <h3>Shrunk, then blended</h3>
          <p>Small samples pull toward the league mean; previous-season ratings carry weight until the new season earns trust.</p>
        </div>
      </div>

      <section className="section">
        <SectionHead
          eyebrow="Board"
          title="The ratings table"
          action={
            <div className="sort-tabs">
              {(Object.keys(LABELS) as SortKey[]).map((key) => (
                <button key={key} className={sort === key ? 'sort-tab is-active' : 'sort-tab'} onClick={() => setSort(key)}>
                  {LABELS[key]}
                </button>
              ))}
            </div>
          }
        />
        <div className="card card--flush table-wrap">
          <table className="table ratings-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th className="num">Power</th>
                <th className="num">Elo</th>
                <th className="num">xGD/90</th>
                <th className="num">Attack</th>
                <th className="num">Defence</th>
                <th className="num">PPDA</th>
                <th className="num">Pts</th>
                <th>Form</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.teamId}>
                  <td className="rank-cell">{row.position}</td>
                  <td>
                    <Link to={`/teams/${row.teamId}`} className="team-link">
                      <TeamBadge team={{ name: row.name, shortName: row.shortName }} size="xs" />
                      {row.name}
                    </Link>
                  </td>
                  <td className="num">
                    <div className="inline-meter">
                      <span>{fmtNum(row.power, 0)}</span>
                      <i><b style={{ width: `${row.power}%` }} /></i>
                    </div>
                  </td>
                  <td className="num">{fmtNum(row.elo, 0)}</td>
                  <td className="num">
                    <Delta value={row.xgDifference / Math.max(1, row.played)} digits={2} />
                  </td>
                  <td className="num">{fmtNum(row.xg / Math.max(1, row.played), 2)}</td>
                  <td className="num">{fmtNum(row.xga / Math.max(1, row.played), 2)}</td>
                  <td className="num">{row.ppda ? fmtNum(row.ppda, 1) : '—'}</td>
                  <td className="num strong">{row.points}</td>
                  <td><FormPills form={row.form} count={5} /></td>
                  <td>
                    <Link to={`/teams/${row.teamId}`} className="icon-btn" aria-label={`Open ${row.name}`}>
                      <ArrowUpRight size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-legend">
          <span><b>Power</b> 0–99 composite of Elo, xG difference, points and form.</span>
          <span><b>Attack / Defence</b> 1.00 = league average; higher attack is better, lower defence is better.</span>
          <span><b>PPDA</b> passes allowed per defensive action; lower = more aggressive press.</span>
        </div>
      </section>

      <div className="split">
        <section className="section">
          <SectionHead eyebrow="Landscape" title="Creation vs concession" />
          <div className="card chart-card">
            <ScatterChart points={scatterPoints} xLabel="xG created per match" yLabel="xG conceded per match" height={350} />
            <p className="chart-note">
              The strongest teams live bottom-right: they create more than average and concede less. Dashed lines are
              league means.
            </p>
          </div>
        </section>

        <section className="section">
          <SectionHead
            eyebrow="Projection"
            title={data.simulations.completed ? 'Final standings' : 'Season simulation'}
          />
          <div className="card card--flush sim-table">
            {(data.simulations.completed ? data.table.slice(0, 8) : simulations.slice(0, 8)).map((row, index) => {
              const isOutcome = 'title' in row;
              const outcome = row as (typeof simulations)[number];
              return (
                <div className="sim-row" key={isOutcome ? outcome.teamId : row.teamId}>
                  <span className="sim-row__rank">{index + 1}</span>
                  {isOutcome ? (
                    <>
                      <span className="sim-row__team">{outcome.name}</span>
                      <div className="sim-row__bar">
                        <i style={{ width: `${outcome.title * 100}%` }} />
                      </div>
                      <span className="sim-row__pct">{fmtPct(outcome.title)}</span>
                      <span className="sim-row__meta">{fmtNum(outcome.avgPoints, 0)} pts</span>
                      <span className="sim-row__meta">{fmtPct(outcome.top4)} top 4</span>
                    </>
                  ) : (
                    <>
                      <span className="sim-row__team">{(row as (typeof data.table)[number]).name}</span>
                      <div className="sim-row__bar">
                        <i style={{ width: `${((row as (typeof data.table)[number]).points / Math.max(1, data.table[0].points)) * 100}%` }} />
                      </div>
                      <span className="sim-row__pct">{(row as (typeof data.table)[number]).points} pts</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="sim-note">
            {data.simulations.completed
              ? `${champion.name} finished top. Switch to the current season for live title probabilities.`
              : `${data.simulations.sims.toLocaleString()} simulations · remaining fixtures sampled from the same model.`}
          </div>
        </section>
      </div>

      <div className="callout">
        <div>
          <div className="eyebrow">Model honesty</div>
          <h3>Ratings are a lens, not a verdict</h3>
          <p>
            xG is not a perfect measure of chance quality. It ignores goalkeeper positioning, defensive pressure and game
            state. Use the ratings to ask better questions, not to end arguments.
          </p>
        </div>
        <Link to="/model" className="btn btn--ghost">
          <Info size={14} /> Methodology
        </Link>
      </div>
    </>
  );
}
