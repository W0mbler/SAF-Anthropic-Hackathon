import { describe, it, expect } from "vitest";
import { defaults, money, totalDemand, validateScenario } from "../lib/format";
describe("scenario input contract", () => {
  it("requires a meaningful yield and finite demand rather than serializing invalid numbers", () => {
    expect(validateScenario({ ...defaults, conversion_yield: 0 })).toMatch(
      /yield/,
    );
    expect(
      validateScenario({
        ...defaults,
        demand: { ...defaults.demand, PNK: Number.NaN },
      }),
    ).toMatch(/finite/);
    expect(
      validateScenario({
        ...defaults,
        demand: { PNK: 0, PKN: 0, BPN: 0, TRK: 0 },
      }),
    ).toMatch(/positive/);
  });
  it("keeps physical SAF demand separate from available biomass", () => {
    expect(totalDemand(defaults)).toBe(210);
    expect(totalDemand(defaults) / defaults.conversion_yield).toBe(1050);
    expect(validateScenario(defaults)).toBeNull();
  });
  it("does not display absent solver results as zero cost", () => {
    expect(money(null)).toBe("—");
    expect(money(800989000)).toContain("800.99");
  });
  it("rejects negative financial assumptions and fractional horizons", () => {
    expect(validateScenario({ ...defaults, horizon_years: 1.5 })).toMatch(
      /whole/,
    );
    expect(
      validateScenario({
        ...defaults,
        processing_opex: { small: -1, large: 0 },
      }),
    ).toMatch(/nonnegative/);
  });
});
