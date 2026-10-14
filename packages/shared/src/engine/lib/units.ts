// Owns: the lb → kg conversion (SPEC §2: the app stores kg; Evolt sheets print lb).

/** kg per lb, as the spec converts the Evolt sheet (SPEC §2). */
export const KG_PER_LB = 0.4536

/** kg = lb × 0.4536 */
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}
