import type { CSSProperties } from 'react';
import type { CalibrationBin, Lineup, Player, Scoreline } from '../types';

export function RadarChart({
  axes,
  color = 'var(--accent)',
  size = 300,
}: {
  axes: Array<{ label: string; value: number }>;
  color?: string;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const count = axes.length;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    const r = (Math.max(0, Math.min(100, value)) / 100) * radius;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };
  const polygon = axes.map((axis, index) => point(index, axis.value).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label="Percentile profile">
      {[25, 50, 75, 100].map((ring) => (
        <polygon
          key={ring}
          points={axes.map((_, index) => point(index, ring).join(',')).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth="0.8"
        />
      ))}
      {axes.map((_, index) => {
        const [x, y] = point(index, 100);
        return <line key={index} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />;
      })}
      <polygon points={polygon} fill={color} fillOpacity="0.16" stroke={color} strokeWidth="1.6" />
      {axes.map((axis, index) => {
        const [x, y] = point(index, axis.value);
        return <circle key={axis.label} cx={x} cy={y} r="2.4" fill={color} />;
      })}
      {axes.map((axis, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
        const x = cx + Math.cos(angle) * (radius + 28);
        const y = cy + Math.sin(angle) * (radius + 24);
        const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
        return (
          <text key={axis.label} x={x} y={y} textAnchor={anchor} className="radar__label">
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}

export function TrendChart({
  series,
  labels,
  height = 210,
}: {
  series: Array<{ label: string; values: number[]; color: string; dashed?: boolean }>;
  labels: string[];
  height?: number;
}) {
  const width = 620;
  const padding = { top: 18, right: 16, bottom: 28, left: 34 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const all = series.flatMap((item) => item.values);
  const min = Math.min(0, ...all);
  const max = Math.max(1, ...all);
  const stepX = labels.length > 1 ? plotW / (labels.length - 1) : plotW;
  const yFor = (value: number) => padding.top + plotH - ((value - min) / (max - min || 1)) * plotH;
  const ticks = 4;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="trend" role="img" aria-label="xG trend">
      {Array.from({ length: ticks + 1 }).map((_, index) => {
        const value = min + ((max - min) / ticks) * index;
        const y = yFor(value);
        return (
          <g key={index}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={padding.left - 7} y={y + 3} textAnchor="end" className="chart__tick">
              {value.toFixed(1)}
            </text>
          </g>
        );
      })}
      {labels.map((label, index) => {
        if (labels.length > 8 && index % 2 !== 0 && index !== labels.length - 1) return null;
        return (
          <text key={`${label}-${index}`} x={padding.left + index * stepX} y={height - 8} textAnchor="middle" className="chart__tick">
            {label}
          </text>
        );
      })}
      {series.map((item) => {
        const points = item.values.map((value, index) => [padding.left + index * stepX, yFor(value)] as const);
        const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
        return (
          <g key={item.label}>
            <path
              d={path}
              fill="none"
              stroke={item.color}
              strokeWidth="1.8"
              strokeDasharray={item.dashed ? '4 4' : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.map(([x, y], index) => (
              <circle key={index} cx={x} cy={y} r="2.2" fill={item.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function ScatterChart({
  points,
  xLabel,
  yLabel,
  height = 360,
  quadrant = 'strong attack · strong defence',
}: {
  points: Array<{ x: number; y: number; label: string; name: string; highlight?: boolean }>;
  xLabel: string;
  yLabel: string;
  height?: number;
  quadrant?: string;
}) {
  const width = 620;
  const padding = { top: 20, right: 20, bottom: 40, left: 46 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs) - 0.15;
  const xMax = Math.max(...xs) + 0.15;
  const yMin = Math.min(...ys) - 0.15;
  const yMax = Math.max(...ys) + 0.15;
  const xFor = (value: number) => padding.left + ((value - xMin) / (xMax - xMin || 1)) * plotW;
  const yFor = (value: number) => padding.top + plotH - ((value - yMin) / (yMax - yMin || 1)) * plotH;
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="scatter" role="img" aria-label={`${xLabel} versus ${yLabel}`}>
      {Array.from({ length: 4 }).map((_, index) => {
        const x = padding.left + (plotW / 4) * index;
        const y = padding.top + (plotH / 4) * index;
        return (
          <g key={index}>
            <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="rgba(255,255,255,0.045)" />
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.045)" />
          </g>
        );
      })}
      <line
        x1={xFor(meanX)}
        y1={padding.top}
        x2={xFor(meanX)}
        y2={height - padding.bottom}
        stroke="rgba(255,255,255,0.16)"
        strokeDasharray="3 4"
      />
      <line
        x1={padding.left}
        y1={yFor(meanY)}
        x2={width - padding.right}
        y2={yFor(meanY)}
        stroke="rgba(255,255,255,0.16)"
        strokeDasharray="3 4"
      />
      {points.map((point) => (
        <g key={point.name}>
          <circle
            cx={xFor(point.x)}
            cy={yFor(point.y)}
            r={point.highlight ? 5.5 : 4}
            fill={point.highlight ? 'var(--accent)' : 'rgba(201,247,90,0.22)'}
            stroke={point.highlight ? 'var(--accent)' : 'rgba(201,247,90,0.8)'}
            strokeWidth="1.2"
          />
          <text x={xFor(point.x) + 7} y={yFor(point.y) + 3} className="chart__dot-label">
            {point.label}
          </text>
        </g>
      ))}
      <text x={padding.left + plotW / 2} y={height - 8} textAnchor="middle" className="chart__axis">
        {xLabel}
      </text>
      <text
        x={12}
        y={padding.top + plotH / 2}
        textAnchor="middle"
        transform={`rotate(-90 12 ${padding.top + plotH / 2})`}
        className="chart__axis"
      >
        {yLabel}
      </text>
      {quadrant && (
        <text x={width - padding.right} y={padding.top + 4} textAnchor="end" className="chart__quad">
          {quadrant}
        </text>
      )}
    </svg>
  );
}

const heatColor = (probability: number, max: number): string => {
  const ratio = Math.min(1, probability / (max * 0.55));
  return `rgba(var(--accent-rgb), ${0.06 + ratio * 0.4})`;
};

export function ScoreHeatmap({
  matrix,
  home,
  away,
}: {
  matrix: number[][];
  home: string;
  away: string;
}) {
  const size = Math.min(7, matrix.length);
  const rows = matrix.slice(0, size);
  const max = Math.max(...rows.flatMap((row) => row.slice(0, size)));
  return (
    <div className="heatmap">
      <div className="heatmap__grid" style={{ '--cols': size + 1 } as CSSProperties}>
        <div className="heatmap__corner" />
        {Array.from({ length: size }).map((_, index) => (
          <div className="heatmap__axis" key={`a-${index}`}>
            {index}
          </div>
        ))}
        {rows.map((row, homeGoals) => (
          <div className="heatmap__row" key={`h-${homeGoals}`} style={{ display: 'contents' }}>
            <div className="heatmap__axis heatmap__axis--row">{homeGoals}</div>
            {row.slice(0, size).map((probability, awayGoals) => (
              <div
                key={`${homeGoals}-${awayGoals}`}
                className={homeGoals === awayGoals ? 'heatmap__cell heatmap__cell--draw' : 'heatmap__cell'}
                style={{ background: heatColor(probability, max) }}
                title={`${home} ${homeGoals}–${awayGoals} ${away}: ${(probability * 100).toFixed(1)}%`}
              >
                {probability >= 0.02 ? `${(probability * 100).toFixed(0)}` : ''}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap__legend">
        <span>{home} goals ↓</span>
        <span>{away} goals →</span>
      </div>
    </div>
  );
}

function teamHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

export function Pitch({
  lineup,
  onPlayer,
  compact = false,
}: {
  lineup: Lineup;
  onPlayer?: (player: Player) => void;
  compact?: boolean;
}) {
  const hue = teamHue(lineup.team.name);
  return (
    <svg viewBox="0 0 100 132" className={compact ? 'pitch pitch--compact' : 'pitch'} role="img" aria-label={`${lineup.team.name} projected XI`}>
      <defs>
        <pattern id="pitch-grid" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M 8 0 L 0 0 0 8" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="0.3" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="100" height="132" rx="4" fill="#0a1510" />
      <rect x="0" y="0" width="100" height="132" rx="4" fill="url(#pitch-grid)" />
      <rect x="3" y="3" width="94" height="126" rx="1.5" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.6" />
      <line x1="3" y1="66" x2="97" y2="66" stroke="rgba(255,255,255,0.22)" strokeWidth="0.6" />
      <circle cx="50" cy="66" r="9" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.6" />
      <circle cx="50" cy="66" r="0.8" fill="rgba(255,255,255,0.4)" />
      <rect x="22" y="3" width="56" height="18" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.6" />
      <rect x="22" y="111" width="56" height="18" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.6" />
      <rect x="36" y="3" width="28" height="7" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
      <rect x="36" y="122" width="28" height="7" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
      <rect x="42" y="0.5" width="16" height="2.5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
      <rect x="42" y="129" width="16" height="2.5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
      {lineup.xi.map((entry) => {
        const x = entry.x;
        const y = 8 + (entry.y / 100) * 116;
        const parts = entry.player.name.split(' ').filter(Boolean);
        const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? '';
        const initials = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : lastName.slice(0, 2);
        const shortName = lastName.length > 10 ? `${lastName.slice(0, 9)}…` : lastName;
        const labelWidth = Math.max(8, shortName.length * 1.08 + 2.4);
        return (
          <g
            key={entry.slot}
            className="pitch__player"
            onClick={() => onPlayer?.(entry.player)}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && onPlayer) {
                event.preventDefault();
                onPlayer(entry.player);
              }
            }}
            role={onPlayer ? 'button' : undefined}
            tabIndex={onPlayer ? 0 : undefined}
            aria-label={onPlayer ? `${entry.player.name}, ${entry.label}. Open player profile.` : undefined}
            style={{ cursor: onPlayer ? 'pointer' : 'default' }}
          >
            <title>{`${entry.player.name} · ${entry.label}`}</title>
            <circle
              cx={x}
              cy={y}
              r={compact ? 4.6 : 5.1}
              fill={`hsl(${hue} 42% 15%)`}
              stroke="var(--accent)"
              strokeWidth="0.9"
            />
            <text x={x} y={y + 1.4} textAnchor="middle" className="pitch__initials">
              {initials}
            </text>
            {!compact && (
              <>
                <g className="pitch__label">
                  <rect
                    x={x - labelWidth / 2}
                    y={y + 6.1}
                    width={labelWidth}
                    height={4.4}
                    rx={1.4}
                    fill="rgba(6, 11, 9, 0.86)"
                  />
                  <text x={x} y={y + 9.2} textAnchor="middle" className="pitch__name">
                    {shortName}
                  </text>
                  <text x={x} y={y + 13.5} textAnchor="middle" className="pitch__slot">
                    {entry.label}
                  </text>
                </g>
                <text x={x} y={y + 8.6} textAnchor="middle" className="pitch__slot pitch__slot--mobile">
                  {entry.label}
                </text>
              </>
            )}
            {compact && (
              <text x={x} y={y + 8.2} textAnchor="middle" className="pitch__slot">
                {entry.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function CalibrationChart({ bins }: { bins: CalibrationBin[] }) {
  const width = 460;
  const height = 300;
  const padding = { top: 18, right: 18, bottom: 38, left: 42 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const xFor = (value: number) => padding.left + value * plotW;
  const yFor = (value: number) => padding.top + plotH - value * plotH;
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="calibration" role="img" aria-label="Calibration plot">
      {Array.from({ length: 5 }).map((_, index) => {
        const value = index / 4;
        return (
          <g key={index}>
            <line x1={xFor(0)} y1={yFor(value)} x2={xFor(1)} y2={yFor(value)} stroke="rgba(255,255,255,0.06)" />
            <line x1={xFor(value)} y1={yFor(0)} x2={xFor(value)} y2={yFor(1)} stroke="rgba(255,255,255,0.06)" />
            <text x={padding.left - 8} y={yFor(value) + 3} textAnchor="end" className="chart__tick">
              {Math.round(value * 100)}%
            </text>
            <text x={xFor(value)} y={height - 16} textAnchor="middle" className="chart__tick">
              {Math.round(value * 100)}%
            </text>
          </g>
        );
      })}
      <line x1={xFor(0)} y1={yFor(0)} x2={xFor(1)} y2={yFor(1)} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
      {bins.map((bin) => (
        <circle
          key={bin.bin}
          cx={xFor(bin.predicted)}
          cy={yFor(bin.observed)}
          r={3 + (bin.count / maxCount) * 7}
          fill="var(--accent)"
          fillOpacity="0.28"
          stroke="var(--accent)"
          strokeWidth="1.2"
        >
          <title>{`Predicted ${(bin.predicted * 100).toFixed(0)}% · observed ${(bin.observed * 100).toFixed(0)}% · n=${bin.count}`}</title>
        </circle>
      ))}
      <text x={padding.left + plotW / 2} y={height - 2} textAnchor="middle" className="chart__axis">
        Predicted probability
      </text>
      <text x={12} y={padding.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 12 ${padding.top + plotH / 2})`} className="chart__axis">
        Observed frequency
      </text>
    </svg>
  );
}

export function ProbabilityDonut({
  probabilities,
  labels,
  size = 132,
}: {
  probabilities: number[];
  labels: string[];
  size?: number;
}) {
  const total = probabilities.reduce((sum, value) => sum + value, 0) || 1;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const colors = ['var(--accent)', 'rgba(255,255,255,0.22)', '#ff8a5b'];
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Outcome probabilities">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        {probabilities.map((probability, index) => {
          const length = (probability / total) * circumference;
          const circle = (
            <circle
              key={labels[index]}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={colors[index]}
              strokeWidth="10"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            />
          );
          offset += length;
          return circle;
        })}
      </svg>
      <div className="donut__labels">
        {labels.map((label, index) => (
          <span key={label}>
            <i style={{ background: colors[index] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PositionBars({ counts }: { counts: number[] }) {
  const max = Math.max(...counts, 1);
  return (
    <div className="posbars">
      {counts.map((count, index) => (
        <span key={index} className="posbars__item">
          <i style={{ height: `${Math.max(3, (count / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

export function MiniScoreline({ scorelines }: { scorelines: Scoreline[] }) {
  return (
    <div className="scorelines">
      {scorelines.slice(0, 3).map((score) => (
        <span key={`${score.home}-${score.away}`} className="scorelines__item">
          <b>
            {score.home}–{score.away}
          </b>
          <span>{(score.probability * 100).toFixed(1)}%</span>
        </span>
      ))}
    </div>
  );
}
