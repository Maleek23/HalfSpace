import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import type { FormMatch, Prediction, TeamRef } from '../types';
import { fmtPct, fmtSigned } from '../api';

export const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function TeamBadge({
  team,
  size = 'md',
  showName = false,
}: {
  team: Pick<TeamRef, 'name' | 'shortName'>;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
}) {
  const hue = hashCode(team.name) % 360;
  const style = {
    '--badge-h': hue,
    '--badge-size': size,
  } as CSSProperties;
  return (
    <span className={cx('team', showName && 'team--named')}>
      <span className={cx('team-badge', `team-badge--${size}`)} style={style} aria-hidden="true">
        {team.shortName.slice(0, 3).toUpperCase()}
      </span>
      {showName && <span className="team__name">{team.name}</span>}
    </span>
  );
}

export function ProbBar({
  prediction,
  height = 8,
  showLabels = false,
  labels = true,
}: {
  prediction: Pick<Prediction, 'homeWin' | 'draw' | 'awayWin'>;
  height?: number;
  showLabels?: boolean;
  labels?: boolean;
}) {
  const home = Math.max(0, prediction.homeWin);
  const draw = Math.max(0, prediction.draw);
  const away = Math.max(0, prediction.awayWin);
  const total = home + draw + away || 1;
  return (
    <div className="prob">
      <div className="prob__track" style={{ height }}>
        <span className="prob__seg prob__seg--home" style={{ width: `${(home / total) * 100}%` }} />
        <span className="prob__seg prob__seg--draw" style={{ width: `${(draw / total) * 100}%` }} />
        <span className="prob__seg prob__seg--away" style={{ width: `${(away / total) * 100}%` }} />
      </div>
      {showLabels && (
        <div className="prob__labels">
          <span>
            <b>{fmtPct(home)}</b> {labels && 'Home'}
          </span>
          <span>
            <b>{fmtPct(draw)}</b> {labels && 'Draw'}
          </span>
          <span>
            <b>{fmtPct(away)}</b> {labels && 'Away'}
          </span>
        </div>
      )}
    </div>
  );
}

export function ProbLegend({
  home,
  away,
}: {
  home: Pick<TeamRef, 'shortName'>;
  away: Pick<TeamRef, 'shortName'>;
}) {
  return (
    <div className="prob__legend">
      <span className="prob__key prob__key--home">{home.shortName}</span>
      <span className="prob__key prob__key--draw">Draw</span>
      <span className="prob__key prob__key--away">{away.shortName}</span>
    </div>
  );
}

export function ConfidenceChip({ label, score }: { label: string; score: number }) {
  return (
    <span className={cx('confidence', `confidence--${label.toLowerCase()}`)} title={`Model confidence ${fmtPct(score)}`}>
      <span className="confidence__dot" />
      {label} confidence
    </span>
  );
}

export function FormPills({ form, count = 5 }: { form: FormMatch[]; count?: number }) {
  const rows = form.slice(-count);
  if (rows.length === 0) return <span className="muted">No matches</span>;
  return (
    <span className="form">
      {rows.map((match) => (
        <span
          key={match.matchId}
          className={cx('form__pill', `form__pill--${match.outcome.toLowerCase()}`)}
          title={`${match.home ? 'vs' : 'at'} ${match.opponent.shortName} ${match.goalsFor}-${match.goalsAgainst} · xG ${match.xgFor.toFixed(2)}-${match.xgAgainst.toFixed(2)}`}
        >
          {match.outcome}
        </span>
      ))}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head__copy">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  );
}

export function SectionHead({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2 className="section-title">{title}</h2>
      </div>
      {action}
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'accent' | 'danger' | 'muted';
}) {
  return (
    <div className={cx('stat', tone && `stat--${tone}`)}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

export function Delta({ value, digits = 1, suffix = '' }: { value: number; digits?: number; suffix?: string }) {
  return (
    <span className={cx('delta', value > 0 ? 'delta--up' : value < 0 ? 'delta--down' : '')}>
      {fmtSigned(value, digits)}
      {suffix}
    </span>
  );
}

export function Sparkline({
  values,
  width = 120,
  height = 34,
  color = 'var(--accent)',
  fill = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  if (values.length === 0) return <span className="muted">—</span>;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - 3 - ((value - min) / range) * (height - 6);
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {fill && <path d={area} fill={color} opacity="0.1" />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx={points.at(-1)?.[0]} cy={points.at(-1)?.[1]} r="2.2" fill={color} />
    </svg>
  );
}

export function Loading({ rows = 5 }: { rows?: number }) {
  return (
    <div className="loading">
      <div className="skeleton skeleton--head" />
      {Array.from({ length: rows }).map((_, index) => (
        <div className="skeleton skeleton--row" key={index} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <AlertTriangle size={22} />
      <div>
        <div className="error-state__title">Could not load this view</div>
        <p className="muted">{message}</p>
      </div>
      {onRetry && (
        <button className="btn btn--ghost btn--sm" onClick={onRetry}>
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {body && <p className="muted">{body}</p>}
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="drawer">
      <button className="drawer__backdrop" aria-label="Close panel" onClick={onClose} />
      <aside className="drawer__panel" role="dialog" aria-modal="true">
        <header className="drawer__head">
          <div>
            <div className="eyebrow">{subtitle}</div>
            <h2 className="drawer__title">{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </div>
  );
}

export function CrumbLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="crumb-link">
      {children}
    </Link>
  );
}
