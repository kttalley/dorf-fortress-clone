/**
 * Day/season clock — single source of truth for calendar math (audit P5)
 *
 * Extracted from updateSeasonalWeather (weatherScenarios.js): 1200-tick
 * in-game days, 30-day seasons, 4 seasons per year.
 *
 * `getCalendar(tick)` is pure arithmetic (no state, never throws), cheap
 * enough to refresh every tick. The simulation stores the result on
 * `state.clock` (src/sim/world.js) so every consumer — weather director,
 * chronicle, prompts — reads one shared calendar instead of re-deriving it.
 */

export const TICKS_PER_DAY = 1200;   // Ticks per in-game day
export const DAYS_PER_SEASON = 30;   // 30 days per season

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

// Day-phase boundaries as fractions of the day (deterministic)
const PHASES = [
  { name: 'dawn', until: 0.15 },  // 0.00–0.15
  { name: 'day', until: 0.55 },   // 0.15–0.55
  { name: 'dusk', until: 0.70 },  // 0.55–0.70
  { name: 'night', until: 1.0 },  // 0.70–1.00
];

/**
 * Derive the calendar from a tick count.
 * @param {number} tick - Absolute simulation tick (>= 0)
 * @returns {{
 *   day: number,          // 1-based absolute day number
 *   dayOfSeason: number,  // 1-based day within the current season (1..30)
 *   season: string,       // 'spring' | 'summer' | 'autumn' | 'winter'
 *   seasonIndex: number,  // 0..3 (index into SEASONS)
 *   phase: string,        // 'dawn' | 'day' | 'dusk' | 'night'
 *   tickOfDay: number,    // 0..TICKS_PER_DAY-1
 * }}
 */
export function getCalendar(tick) {
  const t = Math.max(0, tick | 0);
  const dayIndex = Math.floor(t / TICKS_PER_DAY);              // 0-based
  const seasonIndex = Math.floor(dayIndex / DAYS_PER_SEASON) % SEASONS.length;
  const tickOfDay = t % TICKS_PER_DAY;

  const dayFraction = tickOfDay / TICKS_PER_DAY;
  let phase = PHASES[PHASES.length - 1].name;
  for (const p of PHASES) {
    if (dayFraction < p.until) {
      phase = p.name;
      break;
    }
  }

  return {
    day: dayIndex + 1,
    dayOfSeason: (dayIndex % DAYS_PER_SEASON) + 1,
    season: SEASONS[seasonIndex],
    seasonIndex,
    phase,
    tickOfDay,
  };
}

/**
 * Describe where in the season a day falls ("early spring", "mid-autumn").
 * Deterministic — changes only at day boundaries.
 * @param {number} dayOfSeason - 1..DAYS_PER_SEASON
 * @returns {string} 'early' | 'mid' | 'late'
 */
export function getSeasonStage(dayOfSeason) {
  if (dayOfSeason <= DAYS_PER_SEASON / 3) return 'early';
  if (dayOfSeason <= (DAYS_PER_SEASON * 2) / 3) return 'mid';
  return 'late';
}
