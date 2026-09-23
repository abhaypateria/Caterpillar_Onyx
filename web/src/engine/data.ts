import type { Machine, Operator, TaskRecord, TelemetryRow } from '../types';

// Exact rows from the problem statement. Never modify; synthetic data lives in synthetic.ts.
export const PROVIDED_TELEMETRY: TelemetryRow[] = [
  { timestamp: '2025-05-01T08:00:00', machineId: 'EXC001', operatorId: 'OP1001', engineHours: 1523.5, fuelUsed: 5.2, loadCycles: 12, idleMin: 30, seatbelt: 'Fastened', safetyAlert: false, source: 'provided' },
  { timestamp: '2025-05-01T10:00:00', machineId: 'EXC001', operatorId: 'OP1001', engineHours: 1524.8, fuelUsed: 3.8, loadCycles: 2, idleMin: 55, seatbelt: 'Unfastened', safetyAlert: true, source: 'provided' },
  { timestamp: '2025-05-01T14:00:00', machineId: 'EXC001', operatorId: 'OP1001', engineHours: 1526.5, fuelUsed: 6.1, loadCycles: 10, idleMin: 15, seatbelt: 'Fastened', safetyAlert: false, source: 'provided' },
  { timestamp: '2025-05-02T09:00:00', machineId: 'EXC001', operatorId: 'OP1001', engineHours: 1530.2, fuelUsed: 2.0, loadCycles: 1, idleMin: 60, seatbelt: 'Unfastened', safetyAlert: true, source: 'provided' },
];

export const PROVIDED_TASKS: TaskRecord[] = [
  { id: 'T001', type: 'Earth Excavation', weather: 'Sunny', skill: 'Expert', machineAge: 2, estimated: 60, actual: 58, source: 'provided' },
  { id: 'T002', type: 'Trenching', weather: 'Rainy', skill: 'Intermediate', machineAge: 4, estimated: 45, actual: 52, source: 'provided' },
  { id: 'T003', type: 'Material Loading', weather: 'Cloudy', skill: 'Beginner', machineAge: 3, estimated: 30, actual: 42, source: 'provided' },
  { id: 'T004', type: 'Grading', weather: 'Sunny', skill: 'Expert', machineAge: 5, estimated: 35, actual: 33, source: 'provided' },
  { id: 'T005', type: 'Demolition', weather: 'Windy', skill: 'Intermediate', machineAge: 6, estimated: 90, actual: 105, source: 'provided' },
];

export const TASK_TYPES = ['Earth Excavation', 'Trenching', 'Material Loading', 'Grading', 'Demolition'] as const;

export const OPERATORS: Operator[] = [
  { id: 'OP1001', name: 'Ravi', skill: 'Beginner', lang: 'hi' },
  { id: 'OP1002', name: 'Murugan', skill: 'Intermediate', lang: 'ta' },
  { id: 'OP1003', name: 'Manjunath', skill: 'Expert', lang: 'kn' },
];

export const MACHINES: Machine[] = [
  { id: 'EXC001', type: 'Excavator', model: 'CAT 320', ageYrs: 3 },
  { id: 'EXC002', type: 'Excavator', model: 'CAT 336', ageYrs: 6 },
  { id: 'LDR001', type: 'Wheel Loader', model: 'CAT 950 GC', ageYrs: 4 },
];

/** Benchmarks from public sources (see PLAN.md §1). */
export const BENCH = {
  idleBurnLph: 3.5,        // excavator idle burn ~3–5 L/h
  idleTargetPct: 25,       // good fleets 20–25% of engine hours
  fleetIdlePct: 39,        // industry average ~38–40%
  co2KgPerL: 2.68,         // diesel
  dieselInrPerL: 90,       // approx. India pump price
};
