import { describe, expect, it } from 'vitest';
import { personDistance } from './distance';

// Frame 640×360 (16:9), as from a 720p webcam scaled down.
const W = 640, H = 360;

describe('personDistance', () => {
  it('close person cut off at the bottom (head + shoulders) reads under 1 m', () => {
    // The screenshot case: box ~73% of frame width, touching the bottom edge. Old logic said 3.4 m.
    expect(personDistance([230, 170, 467, 190], W, H)).toBeLessThan(1);
  });
  it('full standing person filling the frame height reads about 2 m', () => {
    const d = personDistance([280, 10, 90, 340], W, H);
    expect(d).toBeGreaterThan(1.5);
    expect(d).toBeLessThan(3);
  });
  it('small person far away reads several metres', () => {
    expect(personDistance([300, 150, 20, 60], W, H)).toBeGreaterThan(5);
  });
  it('closer person always reads nearer than a farther one', () => {
    expect(personDistance([200, 100, 200, 200], W, H)).toBeLessThan(personDistance([280, 150, 60, 80], W, H));
  });
});
