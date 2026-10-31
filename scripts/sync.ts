import { LEAGUES, SEASON_YEARS } from '../server/config.js';
import { syncAll } from '../server/understat.js';

const args = process.argv.slice(2);
const leagueArg = args.find((arg) => arg.startsWith('--league='))?.split('=')[1];
const seasonArg = args.find((arg) => arg.startsWith('--season='))?.split('=')[1];
const force = args.includes('--force');

const leagues = leagueArg ? LEAGUES.filter((league) => league.slug === leagueArg) : LEAGUES;
const years = seasonArg ? [Number(seasonArg)] : SEASON_YEARS;

if (leagues.length === 0) {
  console.error(`Unknown league "${leagueArg}". Options: ${LEAGUES.map((l) => l.slug).join(', ')}`);
  process.exit(1);
}

console.log(`HalfSpace sync · ${leagues.map((l) => l.name).join(', ')} · ${years.join(', ')}`);

try {
  const results = await syncAll(leagues, years, {
    force,
    onProgress: (message) => console.log(`→ ${message}`),
  });
  for (const result of results) {
    console.log(
      `✓ ${result.league} ${result.year}: ${result.matches} matches (${result.played} played), ${result.teams} teams, ${result.players} players`,
    );
  }
  console.log('Sync complete.');
} catch (error) {
  console.error('Sync failed:', (error as Error).message);
  process.exit(1);
}
