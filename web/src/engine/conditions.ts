import type { Weather } from '../types';

/**
 * Heat stress (non-diagnostic). WBGT is estimated from air temperature and humidity
 * using the Australian BoM shade approximation: WBGT ≈ 0.567·T + 0.393·e + 3.94,
 * e = vapour pressure (hPa). Work/rest bands follow common WBGT tables for moderate work.
 */
export function vapourPressure(tempC: number, rh: number) {
  return (rh / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
}
export function wbgt(tempC: number, rh: number) {
  return 0.567 * tempC + 0.393 * vapourPressure(tempC, rh) + 3.94;
}
/** Simple heat index proxy in °C (apparent temperature) for the state engine. */
export function heatIndex(tempC: number, rh: number) {
  return tempC + 0.33 * vapourPressure(tempC, rh) - 4;
}

export interface WorkRest { level: 'ok' | 'caution' | 'high' | 'extreme'; workMin: number; restMin: number }
export function workRest(w: number): WorkRest {
  if (w < 28) return { level: 'ok', workMin: 60, restMin: 0 };
  if (w < 30) return { level: 'caution', workMin: 45, restMin: 15 };
  if (w < 32) return { level: 'high', workMin: 30, restMin: 30 };
  return { level: 'extreme', workMin: 15, restMin: 45 };
}

/** Is a break due? continuousMin = minutes since the last break. */
export function breakDue(tempC: number, rh: number, continuousMin: number) {
  const wr = workRest(wbgt(tempC, rh));
  const limit = wr.level === 'ok' ? 120 : wr.workMin;
  return { due: continuousMin >= limit, limitMin: limit, ...wr };
}

export type Ground = 'Firm' | 'Muddy' | 'Slope';
export type Light = 'Day' | 'Dusk' | 'Night';
export interface Conditions { weather: Weather; tempC: number; humidity: number; ground: Ground; light: Light; dust: boolean }

/** Proximity distances (m) widen with poor visibility or traction. */
export function proximityThresholds(c: Conditions) {
  let f = 1;
  if (c.weather === 'Rainy') f += 0.25;
  if (c.dust) f += 0.25;
  if (c.light === 'Dusk') f += 0.2;
  if (c.light === 'Night') f += 0.5;
  if (c.ground !== 'Firm') f += 0.15;
  return { warn: +(5 * f).toFixed(1), stop: +(2 * f).toFixed(1), factor: f };
}

/** Map an Open-Meteo WMO weather code to our four categories. */
export function weatherFromCode(code: number, windKmh: number): Weather {
  if (code >= 51) return 'Rainy';
  if (windKmh >= 30) return 'Windy';
  if (code >= 2) return 'Cloudy';
  return 'Sunny';
}
