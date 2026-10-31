# HalfSpace

Football intelligence for Europe's top five leagues: opponent-adjusted power ratings, match forecasts, player evaluation, finishing comparisons, projected lineups, tactical style profiles and evidence-backed insights.

HalfSpace is a full-stack app, not a notebook. It ingests real Understat data into SQLite, derives ratings and forecasts, backtests them walk-forward, and serves the result through a React interface. Every number shown in the UI comes from the API.

![Stack](https://img.shields.io/badge/Node-24-3c873a) ![Stack](https://img.shields.io/badge/React-19-61dafb) ![Stack](https://img.shields.io/badge/SQLite-node%3Asqlite-9cf)

## What it does

- **Landing page** — a public front door that explains the product, the evidence standard and the active data coverage.
- **Power ratings** — time-decayed, opponent-adjusted xG attack/defence, shrunk toward the league mean and blended with the previous season.
- **Match forecasts** — a Dixon-Coles scoreline matrix (82%) blended with Elo (18%), plus derived markets: double chance, totals, BTTS, clean sheets, win-to-nil.
- **Season simulation** — 3,000 Monte Carlo runs over the remaining fixture list, producing title, top-four and relegation probabilities.
- **Player intelligence** — position-weighted impact ratings, per-90 rates, finishing overperformance and percentile profiles.
- **Finishing lab** — a two-player comparison that separates shot volume, chance quality, execution, overall attack and sample size instead of collapsing everything into one conversion rate.
- **Lineup lab** — formation-aware XI selection from minutes, broad role fit and impact rating, with an `Auto` shape that scores every available formation, a pitch view, bench and fit labels.
- **Tactics lab** — data-derived style fingerprints for every team, a league press/control landscape, and a curated reference library for manager systems such as inverted full-backs, Amorim's 3-4-3 and Alonso's 3-4-2-1.
- **Insights** — generated conclusions with explicit evidence, confidence labels and links to the underlying team, player or match.
- **Model card** — live calibration, log loss, Brier score, accuracy and benchmark comparisons, computed walk-forward.
- **Data & pipeline** — provenance, coverage and the sync/rebuild workflow.

## Quick start

Requires **Node 24+** (the server uses the built-in `node:sqlite` module).

```bash
cd halfspace
npm install
npm run sync        # ingest Understat data and build ratings/simulations
npm run dev         # API on :8787, web on :5173
```

Open <http://localhost:5173>. The repository can ship without a database; `npm run sync` creates `data/halfspace.db` and is required on first run.

On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd`:

```powershell
npm.cmd install
npm.cmd run sync
```

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run API and Vite together |
| `npm run dev:api` | API only (`tsx watch server/index.ts`) |
| `npm run dev:web` | Vite frontend only |
| `npm run sync` | Sync every league-season, then rebuild derived data |
| `npm run build` | Typecheck and produce `dist/` |
| `npm start` | Run the API without watch mode |
| `npm run typecheck` | `tsc --noEmit` |

Targeted syncs:

```bash
npm run sync -- --league=premier-league --season=2026
npm run sync -- --league=la-liga --season=2025 --force
```

`--force` bypasses the six-hour raw-response cache in `data/raw`.

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Public landing page |
| `/overview` | League dashboard, next fixtures, projected finish and signals |
| `/fixtures` | Fixture list with modelled markets |
| `/matches/:id` | Match card, scoreline matrix, markets and projected XIs |
| `/ratings` | Power ratings, simulation and backtest |
| `/players` | Scoped player leaderboard and profiles |
| `/compare` | Finishing lab |
| `/lineups` | Lineup lab with auto formation selection |
| `/tactics` | Tactics lab and manager reference library |
| `/insights` | Evidence-backed insight feed |
| `/model` | Model card and calibration |
| `/data` | Provenance and pipeline |
| `/teams/:id` | Team profile, squad and projected XI |

## Search and season context

The global search is **universal by default**. It searches players and teams across every loaded season, and shows an explicit `All seasons / 2026/27` scope control. Selecting a player switches the active league and season, then opens the player profile.

The Finishing Lab has its own universal picker. `All seasons` returns historical season rows, so a player can be compared with himself or another player in a different season. The selected season is context, not a hidden filter.

The Players page is deliberately explicit: its filters apply to the selected league and season only, and the page labels that scope.

## Scope

HalfSpace covers the top five European leagues from Understat's xG era, **2014/15 through 2026/27**:

| Competition | Seasons |
| --- | --- |
| Premier League | 2014/15 → 2026/27 |
| La Liga | 2014/15 → 2026/27 |
| Serie A | 2014/15 → 2026/27 |
| Bundesliga | 2014/15 → 2026/27 |
| Ligue 1 | 2014/15 → 2026/27 |

That is 65 league-seasons. The current season is in progress. Completed seasons are still fully modelled, backtested and simulated; the UI labels them as final.

Two coverage caveats are surfaced in the app:

- Ligue 1 2019/20 was curtailed by COVID-19 (279 played matches).
- Ligue 1 has used an 18-team, 306-match season since 2023/24.

## Data

**Primary source:** [Understat](https://understat.com/) league data, fetched from:

```text
https://understat.com/getLeagueData/{league}/{year}/
```

The endpoint requires browser-like headers and a trailing slash. Raw JSON is cached locally for six hours.

Understat provides match-level xG, xGA, PPDA, deep completions, results and player-season aggregates. It is a free, publicly accessible source, but it is **not** an official feed. Check Understat's terms before redistributing data or running frequent automated syncs.

**Storage:** SQLite via `node:sqlite`, at `data/halfspace.db`.

- `leagues`, `seasons`, `teams`, `players` — reference data
- `matches` — fixtures, scores, xG and tactical aggregates
- `team_seasons` — per-team-season totals
- `player_seasons` — player production and minutes
- `ratings`, `simulations`, `backtests` — derived outputs persisted for fast startup

Re-syncing a league-season replaces its rows rather than duplicating them.

## Finishing Lab

The comparison decomposes finishing into five readable dimensions:

1. **Sample size** — minutes and shots.
2. **Shot volume** — shots per 90.
3. **Chance quality** — non-penalty xG per shot.
4. **Execution** — non-penalty goals minus non-penalty xG, explicitly descriptive rather than proof of skill.
5. **Overall attack** — non-penalty xG plus xA per 90 and impact rating.

The verdict is generated from those dimensions. It can say the evidence is mixed, that one player had the better execution or chance-quality profile, or that the sample is too small to separate them. It cannot turn one season of overperformance into a claim about a repeatable finishing skill.

The lab also lists what the data cannot settle: shot placement, pressure, body part, goalkeeper positioning, the identity of the shooter's chance and competition effects without an explicit adjustment. PSxG is not in this dataset and is not invented.

## Lineup Lab

The XI is selected from season minutes, broad provider position codes and the HalfSpace impact rating. The model:

- filters to established players where possible;
- assigns natural, adapted and out-of-role labels;
- prioritises the most role-specific slots first;
- builds and scores every available shape (`4-3-3`, `4-2-3-1`, `3-4-2-1`, `4-4-2`);
- recommends the best-scoring formation, while still allowing an explicit override.

`Auto` uses the recommended shape. The lineup is a **model projection, not official team news**. Understat only exposes broad `D / M / F / S` codes, so wide-versus-central defender assignment, wing-back versus winger, and central-versus-attacking midfield roles are heuristics.

When the provider has too few players for a team-season, the lab returns a **partial XI** instead of a fabricated one. It fills only slots it can justify, never puts an outfield player in goal, and explains the missing slots in the UI. For example, the 2026/27 PSG feed currently lists only seven players with minutes, so the Lineup Lab shows `7 of 11 slots filled` and leaves the goalkeeper slot empty.

## Tactics Lab

The style fingerprint is built from league percentiles on six axes:

| Axis | Input |
| --- | --- |
| Press | PPDA, inverted |
| Territory | Deep completions per match |
| Build-up | Share of xG chain attributed to build-up |
| Chance quality | Team xG per shot |
| Control | xG difference per match |
| Finishing | Goals minus xG |

The profile describes style, not coaching quality. It does not know who the manager is, what shape the team used, what the instructions were, or whether pressing numbers reflect intent, game state or opponent quality.

The **manager models** are a curated reference library, clearly labelled **historical example, not live attribution**. They cover inverted full-backs, Amorim's Sporting-era 3-4-3, Alonso's Leverkusen-era 3-4-2-1, a 4-2-3-1 double pivot, a high-press 4-3-3 and a low block. Each card links to public video/study searches and background reading. HalfSpace does not host or embed copyrighted clips, and no manager data is ingested.

## Model

1. **Rate attack and defence.** Each match contributes xG for/against, weighted by an exponential time decay (six-match half-life) and adjusted for opponent strength. Small samples shrink toward the league mean.
2. **Blend prior season.** Previous-season ratings carry weight until the current season has enough evidence.
3. **Project goals.** League home/away baselines × attack × opposing defence, with an Elo supremacy adjustment.
4. **Build the matrix.** Independent Poisson goal distributions generate an 8×8 scoreline grid; a Dixon-Coles tau correction lifts 0–0 and 1–1 and trims 1–0 / 0–1.
5. **Blend outcomes.** Final 1X2 probabilities are 82% Dixon-Coles and 18% Elo.
6. **Test forward.** Every historical match is priced using only matches before it. Log loss, Brier score, accuracy and calibration (ECE) are scored out of sample.

The UI exposes the model version (`dc-xg-1.0`), training coverage, calibration bins and benchmark deltas.

### Honest limitations

- xG is a provider-supplied shot-quality model, not ground truth. It ignores pressure, goalkeeper positioning and game state.
- PSxG, shot-level pressure, body-part splits and tracking data are unavailable and are not fabricated.
- No injury, suspension or late team news. Projected XIs are **not** official lineups.
- Understat position codes are broad. Formation fit is a heuristic, not a scouting report.
- No manager data, event data, tracking data or clips are ingested. The Tactics Lab reference models are explicitly separated from the team style fingerprints.
- Newly promoted teams start from a league-average prior and gain confidence slowly.
- Probabilities are not betting advice.

## API

The Express server exposes:

| Method | Route | Returns |
| --- | --- | --- |
| GET | `/api/bootstrap` | Leagues, seasons, coverage, model version |
| GET | `/api/leagues/:slug/overview?season=` | Dashboard payload |
| GET | `/api/leagues/:slug/matches?season=&status=` | Fixture list with probabilities |
| GET | `/api/matches/:id` | Full match card, matrix, markets, XIs |
| GET | `/api/leagues/:slug/ratings?season=` | Ratings, simulation, backtest |
| GET | `/api/teams/:id?season=` | Team profile, squad, lineup, signals |
| GET | `/api/leagues/:slug/players?season=&sort=&role=&minMinutes=` | Player leaderboard |
| GET | `/api/players/:id?season=` | Player profile |
| GET | `/api/leagues/:slug/lineup?season=&team=&formation=auto` | Projected XI and formation scores |
| GET | `/api/leagues/:slug/tactics?season=` | Team style fingerprints and league axes |
| GET | `/api/leagues/:slug/insights?season=` | Insight feed |
| GET | `/api/leagues/:slug/model?season=` | Model card and calibration |
| GET | `/api/data` | Provenance and coverage |
| GET | `/api/search?q=` | Latest-season team and player search |
| GET | `/api/search?q=&history=1` | Player-season search for cross-season comparison |
| POST | `/api/sync` | Re-ingest and rebuild |

`/api/sync` accepts `{ "league": "premier-league", "year": 2026 }` or an empty body for a full sync.

## Project layout

```text
halfspace/
├─ server/
│  ├─ index.ts        Express routes
│  ├─ understat.ts    Fetch, parse and persist Understat data
│  ├─ model.ts        Ratings, Elo, Dixon-Coles, matrix maths
│  ├─ engine.ts       Snapshots, simulations, formations, tactical profiles
│  ├─ insights.ts     Evidence-backed signal generation
│  ├─ snapshot.ts     Shared API view types
│  ├─ db.ts           Schema, migrations and query helpers
│  └─ config.ts       Leagues, seasons, model version
├─ scripts/sync.ts    CLI sync entry point
├─ src/
│  ├─ pages/          Landing, Dashboard, Fixtures, Match, Ratings, Team,
│  │                  Players, Compare, Lineups, Tactics, Insights, Model, Data
│  ├─ components/     Shell, UI primitives, SVG charts, player drawer
│  ├─ api.ts          Fetch hooks and formatters
│  ├─ state.tsx       League/season context and league accent
│  └─ styles.css      Design system
└─ data/halfspace.db  Local database (gitignored)
```

## Design

- Dark green-black canvas, acid accent that changes per competition.
- Space Grotesk for editorial hierarchy; IBM Plex Mono for labels and numbers.
- Custom SVG charts only: radar, trend, scatter, heatmap, calibration, pitch, donut.
- Grouped navigation: **Matchday**, **Analysis** and **Model**, with a compact competition switcher and a universal search bar.
- Responsive: the sidebar becomes an off-canvas drawer, charts and tables become scrollable or condensed, and the pitch switches to slot labels on phones.
- Visible focus states, semantic controls, skip link and `prefers-reduced-motion` support.

## Licence

Application code is provided as-is for personal and research use. Understat data remains subject to Understat's terms. No betting advice is provided.
