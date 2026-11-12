export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const ftInToCm = (ft: number, inches: number) => (ft * 12 + inches) * CM_PER_IN;

export function cmToFtIn(cm: number): { ft: number; in: number } {
  const total = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(total / 12), in: total % 12 };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export type WeightUnit = "lb" | "kg";
export const toDisplayWeight = (kg: number, unit: WeightUnit) => round1(unit === "lb" ? kgToLb(kg) : kg);
export const fromDisplayWeight = (v: number, unit: WeightUnit) => (unit === "lb" ? lbToKg(v) : v);
