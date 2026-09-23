// Shared contracts used by both workstreams. Change only with a heads-up to the other person.

export type Lang = 'en' | 'hi' | 'ta' | 'kn';
export type Skill = 'Beginner' | 'Intermediate' | 'Expert';
export type Weather = 'Sunny' | 'Cloudy' | 'Windy' | 'Rainy';
export type Source = 'provided' | 'synthetic' | 'live';

export interface Operator { id: string; name: string; skill: Skill; lang: Lang }
export interface Machine { id: string; type: 'Excavator' | 'Wheel Loader'; model: string; ageYrs: number }

/** One row of the organisers' telemetry sheet (2-hourly aggregates). */
export interface TelemetryRow {
  timestamp: string; machineId: string; operatorId: string;
  engineHours: number; fuelUsed: number; loadCycles: number; idleMin: number;
  seatbelt: 'Fastened' | 'Unfastened'; safetyAlert: boolean; source: Source;
}

/** One row of the organisers' task sheet. */
export interface TaskRecord {
  id: string; type: string; weather: Weather; skill: Skill; machineAge: number;
  estimated: number; actual: number; source: Source;
}

/** 5-minute telemetry window used by the state engine (simulated from the 2-hourly rows). */
export interface Window {
  t: string; machineId: string; operatorId: string;
  cycles: number; idleMin: number; fuelL: number; seatbelt: boolean; engineOn: boolean;
  truckEtaMin: number | null; tempC: number; humidity: number; hoursIntoShift: number;
}

export type TaskStatus = 'scheduled' | 'active' | 'done';
export interface ScheduledTask {
  id: string; time: string; type: string; site: string;
  plannedMin: number; totalCycles: number; doneCycles: number; startedAt: number | null;
  status: TaskStatus;
}

export type Severity = 'low' | 'medium' | 'high';
export type IncidentType = 'near_miss' | 'seatbelt' | 'proximity' | 'damage' | 'injury' | 'other';
export interface Incident {
  id: string; at: string; operatorId: string; machineId: string;
  type: IncidentType; severity: Severity; description: string;
  auto: boolean; snapshot?: Partial<Window> & { risk?: number; state?: string };
  synced?: boolean;
}

/** Alert priority for the voice/alert layer. */
export type Priority = 'critical' | 'warning' | 'info';
export interface Alert { id: string; priority: Priority; key: string; params?: Record<string, string | number>; at: number }
