export type AirportCode = "PNK" | "PKN" | "BPN" | "TRK";
export type Demand = Record<AirportCode, number>;
export interface Location {
  id: string;
  display_name: string;
  province?: string;
  district?: string;
  production_kilotons?: number;
  production_tonnes?: number;
  latitude: number;
  longitude: number;
  iata_code?: string;
}
export interface ScenarioInput {
  name: string;
  demand: Demand;
  conversion_yield: number;
  horizon_years: number;
  discount_rate: number;
  distance_multiplier: number;
  processing_opex: { small: number; large: number };
  excluded_candidate_ids: string[];
}
export interface Scenario extends ScenarioInput {
  id: string;
  version: number;
  created_at: string;
}
export interface Facility {
  candidate_id: string;
  facility_type: "depot" | "refinery";
  size: "small" | "large";
  latitude: number;
  longitude: number;
  capacity_input_kt: number;
  throughput_input_kt: number;
  utilization: number;
  capex_usd: number;
}
export interface Flow {
  stage: "farm_depot" | "depot_refinery" | "refinery_airport";
  from_node_id: string;
  to_node_id: string;
  quantity_kt: number;
  material: string;
  distance_km: number;
  tariff_usd_per_tonne_km: number;
  transport_usd: number;
}
export interface Costs {
  capex_usd: number;
  depot_capex_usd: number;
  refinery_capex_usd: number;
  annual_transport_usd: number;
  annual_processing_usd: number;
  discounted_recurring_usd: number;
  total_usd: number;
  farm_depot_usd: number;
  depot_refinery_usd: number;
  refinery_airport_usd: number;
  pvaf: number;
}
export interface Run {
  id: string;
  scenario_id: string;
  input_snapshot: ScenarioInput;
  input_hash: string;
  created_at: string;
  status: "optimal" | "feasible" | "infeasible" | "no_solution";
  feasible: boolean;
  message: string;
  objective_usd: number | null;
  costs: Costs | null;
  relative_gap: number | null;
  solve_seconds: number;
  facilities: Facility[];
  flows: Flow[];
  warnings: string[];
  provenance: Record<string, unknown>;
}
export interface User {
  id: string;
  email: string;
  display_name?: string;
}
export interface Session {
  user: User | null;
  csrf_token: string;
}
export interface Locations {
  sources: Location[];
  airports: Location[];
}
export interface Candidates {
  depots: Location[];
  refineries: Location[];
  method: string;
}
export interface Comparison {
  left: Run;
  right: Run;
  delta: {
    objective_usd: number | null;
    capex_usd: number | null;
    annual_transport_usd: number | null;
    facility_count: number;
    demand_saf_kt: number;
  };
  added_facilities: Facility[];
  removed_facilities: Facility[];
  warnings: string[];
}
