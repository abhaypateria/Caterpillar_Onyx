/**
 * Distance to a detected person from one camera frame (no depth sensor).
 *
 * Pinhole model for a typical 720p laptop/phone camera (~70° horizontal, ~43° vertical field of view):
 * the frame is ≈1.40·d metres wide and ≈0.79·d metres tall at distance d.
 * - Height estimate assumes a full standing person (1.7 m). Wrong when the box is cut off by the
 *   frame edge (someone close to the camera shows only head and shoulders → looks "short" → too far).
 * - Width estimate assumes shoulder width (~0.5 m). Works for close, cut-off people.
 * We take the nearer of the two (safety-conservative), and only the width estimate when clipped.
 */
export const CAMERA = { widthPerMetre: 1.4, heightPerMetre: 0.79, personHeightM: 1.7, shoulderWidthM: 0.5 };

export function personDistance(bbox: [number, number, number, number], frameW: number, frameH: number): number {
  const [, y, w, h] = bbox;
  const wr = Math.max(0.02, w / frameW), hr = Math.max(0.02, h / frameH);
  const byWidth = CAMERA.shoulderWidthM / (wr * CAMERA.widthPerMetre);
  const byHeight = CAMERA.personHeightM / (hr * CAMERA.heightPerMetre);
  const clipped = y <= frameH * 0.02 || y + h >= frameH * 0.98;
  const d = clipped ? byWidth : Math.min(byWidth, byHeight);
  return Math.round(Math.max(0.2, d) * 10) / 10;
}
