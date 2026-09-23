/** Seeded PRNG so synthetic data is identical on every load. */
export function rng(seed: number) {
  let s = seed | 0;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = next();
    while (!v) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(next() * a.length)];
  return { next, gauss, pick };
}

/** Invert a small square matrix (Gauss–Jordan). */
export function invert(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c];
    for (let k = 0; k < 2 * n; k++) a[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k];
    }
  }
  return a.map((r) => r.slice(n));
}

export const matVec = (m: number[][], v: number[]) => m.map((r) => r.reduce((s, x, i) => s + x * v[i], 0));
export const vecMat = (v: number[], m: number[][]) => m[0].map((_, j) => v.reduce((s, x, i) => s + x * m[i][j], 0));
export const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const std = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
