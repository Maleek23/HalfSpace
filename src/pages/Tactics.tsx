import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  CircleHelp,
  Film,
  Network,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useApi, fmtNum, fmtPct, fmtSigned, timeAgo } from '../api';
import { useApp } from '../state';
import type { TacticsResponse, TacticAxisKey } from '../types';
import {
  ErrorState,
  Loading,
  PageHeader,
  SectionHead,
  TeamBadge,
} from '../components/ui';
import { RadarChart, ScatterChart } from '../components/charts';

interface ReferenceModel {
  id: string;
  title: string;
  shape: string;
  reference: string;
  principles: string[];
  proxies: TacticAxisKey[];
  video: string;
  reading: string;
}

const REFERENCE_MODELS: ReferenceModel[] = [
  {
    id: 'inverted-full-backs',
    title: 'Inverted full-backs',
    shape: '4-3-3 → 3-2-4-1 in possession',
    reference: 'Guardiola / Arteta reference eras · historical example, not live attribution',
    principles: [
      'A full-back steps into the half-space or next to the pivot to create a stable rest-defence structure.',
      'The extra central body lets the team attack with five lanes while keeping three defenders behind the ball.',
      'The trade-off is isolation for the winger and a high demand on the inverted full-back’s receiving and scanning.',
    ],
    proxies: ['buildup', 'territory', 'control'],
    video: 'https://www.youtube.com/results?search_query=inverted+full+backs+tactical+analysis',
    reading: 'https://en.wikipedia.org/wiki/Full-back_(association_football)',
  },
  {
    id: 'amorim-343',
    title: '3-4-3 with split centre-backs',
    shape: '3-4-3 · wide centre-backs, aggressive wing-backs',
    reference: 'Rúben Amorim · Sporting CP era · historical example, not live attribution',
    principles: [
      'Wide centre-backs carry the ball into midfield while the wing-backs hold the width.',
      'The front three pin the last line; the two central midfielders cover the space behind the wing-backs.',
      'The shape is designed to press forward and recover the ball high, not to sit in a passive back five.',
    ],
    proxies: ['press', 'territory', 'control'],
    video: 'https://www.youtube.com/results?search_query=Ruben+Amorim+3-4-3+tactical+analysis',
    reading: 'https://en.wikipedia.org/wiki/R%C3%BAben_Amorim',
  },
  {
    id: 'alonso-3421',
    title: '3-4-2-1 with wing-backs',
    shape: '3-4-2-1 · two tens behind a striker',
    reference: 'Xabi Alonso · Bayer Leverkusen era · historical example, not live attribution',
    principles: [
      'Three centre-backs support build-up; the wing-backs provide the width and arrive late in the box.',
      'Two attacking midfielders occupy the half-spaces between the opposition lines.',
      'The system can become a 3-2-5 or 3-4-3 in possession depending on the wing-back and ten rotations.',
    ],
    proxies: ['buildup', 'chanceQuality', 'control'],
    video: 'https://www.youtube.com/results?search_query=Xabi+Alonso+3-4-2-1+tactical+analysis',
    reading: 'https://en.wikipedia.org/wiki/Xabi_Alonso',
  },
  {
    id: 'double-pivot',
    title: '4-2-3-1 double pivot',
    shape: '4-2-3-1 · two holding midfielders',
    reference: 'General reference model · not attributed to a current manager',
    principles: [
      'Two midfielders protect the centre and allow the full-backs to advance.',
      'The number ten receives between the lines; the wingers attack the half-spaces and the striker pins the centre-backs.',
      'The shape is balanced by design, but it can become passive if the pivot is outnumbered.',
    ],
    proxies: ['control', 'chanceQuality', 'press'],
    video: 'https://www.youtube.com/results?search_query=4-2-3-1+double+pivot+tactical+analysis',
    reading: 'https://en.wikipedia.org/wiki/Formation_(association_football)',
  },
  {
    id: 'high-press-433',
    title: 'High-press 4-3-3',
    shape: '4-3-3 · front three press, midfield jumps',
    reference: 'General reference model · not attributed to a current manager',
    principles: [
      'The front three curve their press to force the ball to one side.',
      'The midfield steps up to cover the second pass, compressing the space between the lines.',
      'The risk is a long ball into the space behind a high back line.',
    ],
    proxies: ['press', 'territory', 'control'],
    video: 'https://www.youtube.com/results?search_query=high+press+4-3-3+tactical+analysis',
    reading: 'https://en.wikipedia.org/wiki/Pressing_(association_football)',
  },
  {
    id: 'low-block',
    title: 'Low block and counter',
    shape: '4-4-2 / 5-4-1 out of possession',
    reference: 'General reference model · not attributed to a current manager',
    principles: [
      'The team concedes territory and protects the central lane rather than chasing the ball.',
      'The counter targets the space vacated by the opponent’s full-backs or the channel beside the centre-backs.',
      'Chance quality and set pieces can matter more than possession or shot volume.',
    ],
    proxies: ['territory', 'chanceQuality', 'finishing'],
    video: 'https://www.youtube.com/results?search_query=low+block+counter+attack+tactical+analysis',
    reading: 'https://en.wikipedia.org/wiki/Counter-attack',
  },
];

const axisValue = (team: TacticsResponse['teams'][number], key: TacticAxisKey) => team.style[key];

export function Tactics() {
  const { league, season, leagueInfo } = useApp();
  const { data, loading, error, reload } = useApi<TacticsResponse>(
    `/api/leagues/${league}/tactics?season=${season}`,
  );
  const [teamId, setTeamId] = useState('');

  useEffect(() => {
    if (!data) return;
    if (!teamId || !data.teams.some((item) => item.team.id === teamId)) {
      setTeamId(data.teams[0]?.team.id ?? '');
    }
  }, [data, teamId]);

  const team = useMemo(
    () => data?.teams.find((item) => item.team.id === teamId) ?? data?.teams[0] ?? null,
    [data, teamId],
  );

  if (loading && !data) return <Loading rows={9} />;
  if (error || !data || !team) {
    return <ErrorState message={error ?? 'No tactical profile available'} onRetry={reload} />;
  }

  const radar = data.axes.map((axis) => ({ label: axis.label, value: axisValue(team, axis.key) }));
  const scatter = data.teams.map((item) => ({
    x: item.style.press,
    y: item.style.control,
    label: item.team.shortName,
    name: item.team.name,
    highlight: item.team.id === team.team.id,
  }));
  const strongest = [...data.axes].sort((a, b) => axisValue(team, b.key) - axisValue(team, a.key)).slice(0, 2);

  return (
    <>
      <PageHeader
        eyebrow={<><Network size={12} /> {leagueInfo?.name} · {data.season.label}</>}
        title="Tactics lab"
        subtitle="Read a team’s style fingerprint from aggregate xG, pressing and territory data — then place it against reference manager models without pretending the data knows the coach."
        actions={
          <div className="page-head__actions">
            <span className="status-chip"><Sparkles size={13} /> Data-derived · reference models</span>
            <span className="status-chip"><span className="live-dot" /> {timeAgo(data.updatedAt)}</span>
          </div>
        }
      />

      <div className="tactics-toolbar">
        <label className="select-wrap select-wrap--lg tactics-team-select">
          <TeamBadge team={team.team} size="sm" />
          <select
            value={team.team.id}
            onChange={(event) => setTeamId(event.target.value)}
            aria-label="Select team for tactical profile"
          >
            {data.teams.map((item) => (
              <option key={item.team.id} value={item.team.id}>
                {item.team.name} · #{item.rank}
              </option>
            ))}
          </select>
        </label>
        <span className="tactics-toolbar__note">
          Percentiles within {leagueInfo?.name} {data.season.label}. Style is descriptive, not a prediction.
        </span>
      </div>

      <div className="tactics-layout">
        <section className="card tactics-profile">
          <div className="tactics-profile__head">
            <div className="tactics-profile__identity">
              <TeamBadge team={team.team} size="lg" />
              <div>
                <div className="eyebrow">Style fingerprint</div>
                <h2>{team.team.name}</h2>
                <span className="tactics-archetype">{team.archetype.label}</span>
              </div>
            </div>
            <div className="tactics-profile__standing">
              <span><small>League rank</small><b>#{team.rank}</b></span>
              <span><small>Points</small><b>{team.points}</b></span>
              <span><small>xGD</small><b>{fmtSigned(team.xgd, 1)}</b></span>
            </div>
          </div>

          <div className="tactics-profile__grid">
            <div className="tactics-radar">
              <RadarChart axes={radar} size={320} />
              <span className="tactics-radar__note">Higher percentile = more of the trait</span>
            </div>
            <div className="tactics-axes">
              {data.axes.map((axis) => {
                const value = axisValue(team, axis.key);
                return (
                  <div className="tactics-axis" key={axis.key}>
                    <div className="tactics-axis__top">
                      <span>{axis.label}</span>
                      <b>{value}</b>
                    </div>
                    <div className="tactics-axis__bar">
                      <i style={{ width: `${value}%` }} />
                    </div>
                    <span className="tactics-axis__note">{axis.note}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tactics-raw">
            <span><small>PPDA</small><b>{team.ppda === null ? '—' : fmtNum(team.ppda, 2)}</b></span>
            <span><small>Deep / match</small><b>{fmtNum(team.deepPerGame, 1)}</b></span>
            <span><small>Deep allowed / match</small><b>{fmtNum(team.deepAllowedPerGame, 1)}</b></span>
            <span><small>xG / shot</small><b>{fmtNum(team.xgPerShot, 3)}</b></span>
            <span><small>Build-up share</small><b>{fmtPct(team.buildupShare, 1)}</b></span>
            <span><small>Goals − xG</small><b>{fmtSigned(team.finishingSignal, 1)}</b></span>
          </div>
        </section>

        <aside className="tactics-side">
          <div className="card tactics-read">
            <div className="eyebrow">Profile readout</div>
            <h2>{team.archetype.label}</h2>
            <p>{team.archetype.description}</p>
            <div className="tactics-read__signals">
              {strongest.map((axis) => (
                <span key={axis.key}>
                  <b>{axis.label}</b>
                  <small>{axisValue(team, axis.key)}th percentile</small>
                </span>
              ))}
            </div>
            <div className="tactics-read__note">
              <CircleHelp size={14} />
              <span>
                This is a style description, not a verdict on coaching quality. A team can be well coached in more
                than one style.
              </span>
            </div>
          </div>

          <div className="card tactics-caveats">
            <div className="eyebrow">What it cannot settle</div>
            <ul>
              <li>Who the manager is, or whether a coach is responsible for the profile.</li>
              <li>Actual shape, role instructions or in-possession structure without event and tracking data.</li>
              <li>Whether pressing numbers reflect intent, game state or opponent quality.</li>
              <li>Set-piece design, player instructions, or clips — none of those are in this dataset.</li>
            </ul>
            <div className="tactics-caveats__foot">
              <ShieldAlert size={14} />
              <span>
                Understat provides team and player aggregates only. HalfSpace does not ingest manager data, event
                data, tracking data or video.
              </span>
            </div>
          </div>
        </aside>
      </div>

      <section className="section">
        <SectionHead
          eyebrow="League map"
          title="The style landscape"
          action={<span className="muted small">Press vs control · percentile axes</span>}
        />
        <div className="card tactics-scatter">
          <ScatterChart
            points={scatter}
            xLabel="Press percentile (higher = more aggressive)"
            yLabel="Control percentile (xGD / match)"
            quadrant=""
            height={380}
          />
          <div className="tactics-scatter__legend">
            <span><i className="legend-dot legend-dot--accent" /> Selected team</span>
            <span>Dashed lines mark league means</span>
            <span>Each dot is one team in {data.season.label}</span>
          </div>
          <div className="tactics-style-table" aria-label="Teams ranked by pressing and control">
            <div className="tactics-style-table__head">
              <span>Team</span>
              <span>Press</span>
              <span>Control</span>
            </div>
            {data.teams.map((item) => (
              <button
                key={item.team.id}
                className={item.team.id === team.team.id ? 'tactics-style-row is-active' : 'tactics-style-row'}
                onClick={() => setTeamId(item.team.id)}
              >
                <span className="tactics-style-row__team">
                  <TeamBadge team={item.team} size="xs" />
                  <span>
                    <b>{item.team.name}</b>
                    <small>#{item.rank} · {item.archetype.label}</small>
                  </span>
                </span>
                <span className="tactics-style-row__bar">
                  <span className="tactics-style-row__track"><i style={{ width: `${item.style.press}%` }} /></span>
                  <b>{item.style.press}</b>
                </span>
                <span className="tactics-style-row__bar">
                  <span className="tactics-style-row__track"><i style={{ width: `${item.style.control}%` }} /></span>
                  <b>{item.style.control}</b>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead
          eyebrow="Reference library"
          title="Manager models"
          action={<span className="status-chip"><BookOpen size={13} /> Curated study, not live attribution</span>}
        />
        <div className="callout tactics-ref-banner">
          <div>
            <div className="eyebrow">How to use this library</div>
            <h3>Systems, not current job titles</h3>
            <p>
              These cards are reference archetypes for reading the data. They are not a claim about who manages a
              club in {data.season.label}, and they are not generated from manager data. Use the data profile to ask
              better questions, then watch the system in context.
            </p>
          </div>
          <span className="data-source-tag">Reference · not live</span>
        </div>

        <div className="tactics-models">
          {REFERENCE_MODELS.map((model) => (
            <article className="tactics-model" key={model.id}>
              <div className="tactics-model__top">
                <span className="tactics-model__tag">Reference model</span>
                <span className="tactics-model__shape">{model.shape}</span>
              </div>
              <h3>{model.title}</h3>
              <p className="tactics-model__ref">{model.reference}</p>
              <ul>
                {model.principles.map((principle) => (
                  <li key={principle}>{principle}</li>
                ))}
              </ul>
              <div className="tactics-model__proxies">
                <span>Read with</span>
                {model.proxies.map((key) => {
                  const axis = data.axes.find((item) => item.key === key);
                  return <b key={key}>{axis?.label ?? key}</b>;
                })}
              </div>
              <div className="tactics-model__links">
                <a href={model.video} target="_blank" rel="noreferrer noopener">
                  <Film size={13} /> Video study search <ArrowUpRight size={12} />
                </a>
                <a href={model.reading} target="_blank" rel="noreferrer noopener">
                  <BookOpen size={13} /> Background <ArrowUpRight size={12} />
                </a>
              </div>
            </article>
          ))}
        </div>
        <p className="tactics-footnote">
          Video links open external public search pages; HalfSpace does not host or embed copyrighted clips.
        </p>
      </section>
    </>
  );
}
