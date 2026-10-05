// Owns: unit conversions (SPEC §2: the app stores kg and cm; Evolt sheets print lb, tape can be read in inches).

/** kg per lb, as the spec converts the Evolt sheet (SPEC §2). */
export const KG_PER_LB = 0.4536
/** cm per inch (exact). */
export const CM_PER_IN = 2.54

/** kg = lb × 0.4536 */
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}

/** lb = kg / 0.4536 */
export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}

/** cm = in × 2.54 */
export function inToCm(inches: number): number {
  return inches * CM_PER_IN
}

/** in = cm / 2.54 */
export function cmToIn(cm: number): number {
  return cm / CM_PER_IN
}
