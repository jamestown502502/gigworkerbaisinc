// Daily weather: rolled once per morning (in sleep()), stored on state.weather.
export const WEATHERS = [
  { id: 'sunny', name: 'Sunny', emoji: '☀️', color: '#f1c40f', energyMod: 0, flavor: "Sun's out. A decent day to hustle." },
  { id: 'rainy', name: 'Rainy', emoji: '🌧️', color: '#5dade2', energyMod: 2, flavor: 'Rain streaks the windows. Outdoor work will be a slog.' },
  { id: 'hot', name: 'Hot', emoji: '🔥', color: '#ff8a7e', energyMod: 3, flavor: 'Heat shimmers off the pavement already. Pace yourself.' },
  { id: 'cold', name: 'Cold', emoji: '❄️', color: '#85c1e9', energyMod: 2, flavor: 'Frost on the glass. Bundle up out there.' },
  { id: 'perfect', name: 'Perfect', emoji: '✨', color: '#2ecc71', energyMod: -2, flavor: 'Crisp air, clear sky. The city feels generous today.' },
];

import { weatherWeights } from './twists.js';

/** `twistId` is the run's month twist (src/game/twists.js); a heat wave or rainy season doubles
 *  its weather's weight. With no twist the odds are the original table below. */
export function rollWeather(twistId = null) {
  if (twistId) {
    const w = weatherWeights(twistId);
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return WEATHERS[i]; }
    return WEATHERS[0];
  }
  const r = Math.random();
  if (r < 0.30) return WEATHERS[0];  // sunny (30%)
  if (r < 0.50) return WEATHERS[1];  // rainy (20%)
  if (r < 0.65) return WEATHERS[2];  // hot (15%)
  if (r < 0.80) return WEATHERS[3];  // cold (15%)
  if (r < 0.90) return WEATHERS[4];  // perfect (10%)
  return WEATHERS[0];                // fallback
}
