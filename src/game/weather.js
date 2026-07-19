// Daily weather: rolled once per morning (in sleep()), stored on state.weather.
export const WEATHERS = [
  { id: 'sunny', name: 'Sunny', emoji: '☀️', color: '#f1c40f', energyMod: 0, flavor: "Sun's out. A decent day to hustle." },
  { id: 'rainy', name: 'Rainy', emoji: '🌧️', color: '#3498db', energyMod: 2, flavor: 'Rain streaks the windows. Outdoor work will be a slog.' },
  { id: 'hot', name: 'Hot', emoji: '🔥', color: '#e74c3c', energyMod: 3, flavor: 'Heat shimmers off the pavement already. Pace yourself.' },
  { id: 'cold', name: 'Cold', emoji: '❄️', color: '#85c1e9', energyMod: 2, flavor: 'Frost on the glass. Bundle up out there.' },
  { id: 'perfect', name: 'Perfect', emoji: '✨', color: '#2ecc71', energyMod: -2, flavor: 'Crisp air, clear sky. The city feels generous today.' },
];

export function rollWeather() {
  const r = Math.random();
  if (r < 0.30) return WEATHERS[0];  // sunny (30%)
  if (r < 0.50) return WEATHERS[1];  // rainy (20%)
  if (r < 0.65) return WEATHERS[2];  // hot (15%)
  if (r < 0.80) return WEATHERS[3];  // cold (15%)
  if (r < 0.90) return WEATHERS[4];  // perfect (10%)
  return WEATHERS[0];                // fallback
}
