import type { ScenarioInput } from "./types";
export const AIRPORTS = ["PNK", "PKN", "BPN", "TRK"] as const;
export const defaults: ScenarioInput = {
  name: "Baseline scenario",
  demand: { PNK: 60, PKN: 30, BPN: 90, TRK: 30 },
  conversion_yield: 0.2,
  horizon_years: 1,
  discount_rate: 0,
  distance_multiplier: 1,
  processing_opex: { small: 0, large: 0 },
  excluded_candidate_ids: [],
};
export function money(value: number | null | undefined, compact = true) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 2 : 0,
  }).format(value);
}
export function number(value: number, digits = 1) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}
export function totalDemand(input: ScenarioInput) {
  return AIRPORTS.reduce((sum, code) => sum + input.demand[code], 0);
}
export function validateScenario(input: ScenarioInput): string | null {
  if (!input.name.trim()) return "Give this scenario a name.";
  if (
    AIRPORTS.some(
      (code) => !Number.isFinite(input.demand[code]) || input.demand[code] <= 0,
    )
  )
    return "Airport demand must be a finite, positive number.";
  if (totalDemand(input) <= 0) return "Enter a positive total SAF demand.";
  if (
    !Number.isFinite(input.conversion_yield) ||
    input.conversion_yield <= 0 ||
    input.conversion_yield > 1
  )
    return "Conversion yield must be greater than 0 and at most 100%.";
  if (!Number.isInteger(input.horizon_years) || input.horizon_years < 1)
    return "Horizon must be a positive whole number of years.";
  if (!Number.isFinite(input.discount_rate) || input.discount_rate < 0)
    return "Discount rate cannot be negative.";
  if (
    !Number.isFinite(input.distance_multiplier) ||
    input.distance_multiplier <= 0
  )
    return "Distance multiplier must be greater than zero.";
  if (
    Object.values(input.processing_opex).some(
      (v) => !Number.isFinite(v) || v < 0,
    )
  )
    return "Processing OpEx must be a finite, nonnegative number.";
  return null;
}
