import { Drawer } from './ui';
import { RadarChart } from './charts';
import { fmtNum, fmtPct, fmtSigned } from '../api';
import type { Player } from '../types';

export function PlayerDrawer({ player, onClose }: { player: Player | null; onClose: () => void }) {
  return (
    <Drawer
      open={Boolean(player)}
      onClose={onClose}
      title={player?.name ?? ''}
      subtitle={player ? `${player.teamName} · ${player.role}` : ''}
    >
      {player && (
        <div className="player-detail">
          <div className="player-detail__hero">
            <div className="player-detail__rating">
              <span>{fmtNum(player.rating, 1)}</span>
              <small>impact rating</small>
            </div>
            <div className="player-detail__id">
              <div className="player-detail__meta">
                <span>{player.position || player.role}</span>
                <span>{player.games} apps</span>
                <span>{player.minutes.toLocaleString()} min</span>
              </div>
              <div className="rating-bar">
                <span style={{ width: `${player.rating}%` }} />
              </div>
              <p className="muted small">
                League rank #{player.rank} · confidence {fmtPct(player.confidence)}
              </p>
            </div>
          </div>

          <div className="player-detail__radar">
            <RadarChart
              axes={[
                { label: 'Attack', value: player.percentiles.attack },
                { label: 'Creation', value: player.percentiles.creation },
                { label: 'Progression', value: player.percentiles.progression },
                { label: 'Defence', value: player.percentiles.defence },
                { label: 'Finishing', value: player.percentiles.finishing },
                { label: 'Minutes', value: player.percentiles.minutes },
              ]}
              size={290}
            />
          </div>

          <div className="detail-grid">
            <div><span>Goals</span><b>{player.goals}</b></div>
            <div><span>Assists</span><b>{player.assists}</b></div>
            <div><span>xG</span><b>{fmtNum(player.xg, 2)}</b></div>
            <div><span>xA</span><b>{fmtNum(player.xa, 2)}</b></div>
            <div><span>G − xG</span><b>{fmtSigned(player.goalOverperformance, 1)}</b></div>
            <div><span>xG+xA / 90</span><b>{fmtNum(player.per90.xgxa, 2)}</b></div>
          </div>

          <div className="drawer-section">
            <div className="eyebrow">Per 90</div>
            <div className="per90-grid">
              <div><span>Goals</span><b>{fmtNum(player.per90.goals, 2)}</b></div>
              <div><span>Assists</span><b>{fmtNum(player.per90.assists, 2)}</b></div>
              <div><span>xG</span><b>{fmtNum(player.per90.xg, 2)}</b></div>
              <div><span>xA</span><b>{fmtNum(player.per90.xa, 2)}</b></div>
              <div><span>Shots</span><b>{fmtNum(player.per90.shots, 2)}</b></div>
              <div><span>Key passes</span><b>{fmtNum(player.per90.keyPasses, 2)}</b></div>
              <div><span>xG chain</span><b>{fmtNum(player.per90.xgChain, 2)}</b></div>
              <div><span>xG buildup</span><b>{fmtNum(player.per90.xgBuildup, 2)}</b></div>
            </div>
          </div>

          <div className="drawer-section">
            <div className="eyebrow">Percentile profile</div>
            {Object.entries({
              Attack: player.percentiles.attack,
              Creation: player.percentiles.creation,
              Progression: player.percentiles.progression,
              Defence: player.percentiles.defence,
              Finishing: player.percentiles.finishing,
              Minutes: player.percentiles.minutes,
            }).map(([label, value]) => (
              <div className="pct-row" key={label}>
                <span>{label}</span>
                <div className="pct-row__bar"><i style={{ width: `${value}%` }} /></div>
                <b>{value}</b>
              </div>
            ))}
          </div>

          <p className="drawer-note">
            Impact is position-weighted: attackers weight xG+xA and finishing; defenders weight team xGA, build-up and
            minutes; goalkeepers use team defence as a proxy. Percentiles compare players in the same role with 180+
            minutes.
          </p>
        </div>
      )}
    </Drawer>
  );
}
