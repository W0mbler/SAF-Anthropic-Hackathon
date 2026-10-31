"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Copy,
  Leaf,
  Play,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { request, session } from "../lib/api";
import {
  AIRPORTS,
  defaults,
  money,
  number,
  totalDemand,
  validateScenario,
} from "../lib/format";
import type {
  Candidates,
  Locations,
  Run,
  Scenario,
  ScenarioInput,
} from "../lib/types";
import MapCanvas from "./MapCanvas";
import { RunResults, SolutionStatus } from "./Results";
const airportNames = {
  PNK: "Supadio",
  PKN: "Iskandar",
  BPN: "Sultan Aji",
  TRK: "Juwata",
};
const presets = [
  {
    label: "Lower · 160 kt",
    name: "Lower demand",
    demand: { PNK: 45, PKN: 25, BPN: 65, TRK: 25 },
  },
  {
    label: "Baseline · 210 kt",
    name: "Baseline scenario",
    demand: { PNK: 60, PKN: 30, BPN: 90, TRK: 30 },
  },
  {
    label: "Higher · 260 kt",
    name: "Higher demand",
    demand: { PNK: 70, PKN: 40, BPN: 110, TRK: 40 },
  },
];
export default function Studio() {
  const [locations, setLocations] = useState<Locations>({
    sources: [],
    airports: [],
  });
  const [candidates, setCandidates] = useState<Candidates>({
    depots: [],
    refineries: [],
    method: "",
  });
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState("");
  const [input, setInput] = useState<ScenarioInput>(structuredClone(defaults));
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      await session();
      const [l, c, s, r] = await Promise.all([
        request<Locations>("/locations"),
        request<Candidates>("/candidates"),
        request<Scenario[]>("/scenarios"),
        request<Run[]>("/runs"),
      ]);
      setLocations(l);
      setCandidates(c);
      setScenarios(s);
      setRuns(r);
      if (s.length) {
        setSelected(s[0].id);
        setInput(s[0]);
        setRun(r.find((item) => item.scenario_id === s[0].id) || null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function choose(id: string) {
    setSelected(id);
    setError("");
    setNotice("");
    const found = scenarios.find((s) => s.id === id);
    setInput(found || structuredClone(defaults));
    setRun(id ? runs.find((r) => r.scenario_id === id) || null : null);
  }
  function edit<K extends keyof ScenarioInput>(
    key: K,
    value: ScenarioInput[K],
  ) {
    setInput((prev) => ({ ...prev, [key]: value }));
    setNotice("");
  }
  async function persist(): Promise<Scenario> {
    const validation = validateScenario(input);
    if (validation) throw new Error(validation);
    const payload: ScenarioInput = {
      name: input.name,
      demand: input.demand,
      conversion_yield: input.conversion_yield,
      horizon_years: input.horizon_years,
      discount_rate: input.discount_rate,
      distance_multiplier: input.distance_multiplier,
      processing_opex: input.processing_opex,
      excluded_candidate_ids: input.excluded_candidate_ids,
    };
    const saved = await request<Scenario>(
      selected ? `/scenarios/${selected}` : "/scenarios",
      selected ? "PATCH" : "POST",
      payload,
    );
    setSelected(saved.id);
    setScenarios((prev) => [saved, ...prev.filter((s) => s.id !== saved.id)]);
    return saved;
  }
  async function save() {
    setSaving(true);
    setError("");
    try {
      await persist();
      setNotice("Scenario saved to your workspace.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function solve() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await persist();
      const result = await request<Run>(`/scenarios/${saved.id}/solve`, "POST");
      setRun(result);
      setRuns((prev) => [result, ...prev]);
      setNotice(
        result.feasible
          ? "Network solved and saved."
          : "Run saved. Review the feasibility diagnostics below.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function duplicate() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const copied = await request<Scenario>(
        `/scenarios/${selected}/duplicate`,
        "POST",
      );
      setScenarios((prev) => [copied, ...prev]);
      setSelected(copied.id);
      setInput(copied);
      setRun(null);
      setNotice("Scenario duplicated. Edit assumptions and solve to compare.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (
      !selected ||
      !window.confirm("Delete this scenario and its saved runs?")
    )
      return;
    setSaving(true);
    try {
      await request(`/scenarios/${selected}`, "DELETE");
      setScenarios((prev) => prev.filter((s) => s.id !== selected));
      setRuns((prev) => prev.filter((r) => r.scenario_id !== selected));
      choose("");
      setNotice("Scenario deleted.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const uniqueCandidates = Array.from(
    new Map(
      [...candidates.depots, ...candidates.refineries].map((c) => [c.id, c]),
    ).values(),
  );
  const snapshotChanged =
    run &&
    JSON.stringify({
      demand: input.demand,
      yield: input.conversion_yield,
      horizon: input.horizon_years,
      distance: input.distance_multiplier,
      discount: input.discount_rate,
      opex: input.processing_opex,
      exclusions: input.excluded_candidate_ids,
    }) !==
      JSON.stringify({
        demand: run.input_snapshot.demand,
        yield: run.input_snapshot.conversion_yield,
        horizon: run.input_snapshot.horizon_years,
        distance: run.input_snapshot.distance_multiplier,
        discount: run.input_snapshot.discount_rate,
        opex: run.input_snapshot.processing_opex,
        exclusions: run.input_snapshot.excluded_candidate_ids,
      });
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="signal" /> KALIMANTAN SUPPLY NETWORK · LIVE
            OPTIMISATION
          </div>
          <h1>
            From biomass.
            <br />
            <span>To boarding gates.</span>
          </h1>
          <p>
            Design the sustainable aviation fuel network.
            <br className="desktop-break" /> Every facility, flow and investment
            — jointly optimised.
          </p>
        </div>
        <div className="heading-note">
          <Leaf size={26} />
          <span>
            80 supply locations.
            <br />4 airports. One connected decision.
          </span>
          <small>ILLUSTRATIVE PLANNING MODEL</small>
        </div>
      </div>
      <div className="assumption-banner">
        <span className="assumption-icon">i</span>
        <p>
          <strong>Transparent by design.</strong> Airport demand and conversion
          yield are illustrative assumptions. Distances are straight-line
          proxies; candidate sites are not verified construction land.
        </p>
        <a href="/about">
          Understand the model <ArrowRight size={14} />
        </a>
      </div>
      {error && (
        <div className="error-panel" role="alert">
          {error}{" "}
          {loading || locations.sources.length === 0 ? (
            <button onClick={() => void load()}>Retry loading</button>
          ) : null}
        </div>
      )}
      <section className="kpi-grid" aria-label="Network summary">
        <div className="kpi">
          <span>Available biomass</span>
          <strong>
            {locations.sources.length
              ? number(
                  locations.sources.reduce(
                    (a, s) => a + (s.production_kilotons || 0),
                    0,
                  ),
                  0,
                )
              : "—"}{" "}
            <small>kt</small>
          </strong>
          <p>
            <span data-testid="source-count">{locations.sources.length}</span>{" "}
            real supply locations
          </p>
        </div>
        <div className="kpi">
          <span>Modelled SAF demand</span>
          <strong>
            {number(totalDemand(input), 0)} <small>kt</small>
          </strong>
          <p>
            <span data-testid="airport-count">{locations.airports.length}</span>{" "}
            airports · illustrative
          </p>
        </div>
        <div className="kpi">
          <span>Selected facilities</span>
          <strong>
            {run?.feasible ? run.facilities.length : "—"} <small>sites</small>
          </strong>
          <p>
            {run?.feasible
              ? `${run.facilities.filter((f) => f.facility_type === "depot").length} depots · ${run.facilities.filter((f) => f.facility_type === "refinery").length} refineries`
              : "Joint siting & sizing"}
          </p>
        </div>
        <div className="kpi cost-kpi">
          <span>Total modelled cost</span>
          <strong data-testid="total-cost">{money(run?.objective_usd)}</strong>
          <p>CapEx + discounted recurring costs</p>
        </div>
      </section>
      <div className="workspace">
        <section className="map-panel panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">SUPPLY CHAIN INTELLIGENCE</span>
              <h2>The network, connected.</h2>
            </div>
            <SolutionStatus run={run} busy={busy} />
          </div>
          {loading ? (
            <div className="map-skeleton">
              <span className="spinner" /> Loading verified source data…
            </div>
          ) : (
            <MapCanvas
              sources={locations.sources}
              airports={locations.airports}
              facilities={run?.feasible ? run.facilities : []}
              flows={run?.feasible ? run.flows : []}
            />
          )}
          <div className="map-caption">
            <span>BIOMASS → PREPROCESSING → REFINING → AIRPORTS</span>
            <span>Candidate-constrained MILP · SciPy / HiGHS</span>
          </div>
          {snapshotChanged && (
            <div className="stale-note">
              The map shows the last saved run. Your edited assumptions will
              apply when you optimise again.
            </div>
          )}
        </section>
        <aside className="panel scenario-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">YOUR PLANNING WORKSPACE</span>
              <h2>Scenario studio</h2>
            </div>
            <Settings2 size={20} />
          </div>
          <div className="scenario-content">
            <label>
              Saved scenarios
              <select
                aria-label="Saved scenarios"
                value={selected}
                onChange={(e) => choose(e.target.value)}
                disabled={busy || saving}
              >
                <option value="">+ New scenario</option>
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scenario name
              <input
                data-testid="scenario-name"
                value={input.name}
                maxLength={100}
                onChange={(e) => edit("name", e.target.value)}
              />
            </label>
            <div className="field-heading">
              <h3>Airport SAF demand</h3>
              <span className="badge">ILLUSTRATIVE</span>
            </div>
            <div className="presets">
              {presets.map((p, i) => (
                <button
                  key={p.label}
                  data-testid={i === 2 ? "demand-preset-higher" : undefined}
                  onClick={() => {
                    edit("demand", p.demand);
                    edit("name", p.name);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="demand-grid">
              {AIRPORTS.map((code) => (
                <label key={code}>
                  <span>
                    <b>{code}</b>
                    <small>{airportNames[code]}</small>
                  </span>
                  <div className="input-unit">
                    <input
                      aria-label={`${code} demand (kt SAF)`}
                      data-testid={`demand-${code}`}
                      type="number"
                      min="0.001"
                      step="1"
                      value={input.demand[code]}
                      onChange={(e) =>
                        edit("demand", {
                          ...input.demand,
                          [code]: e.target.valueAsNumber,
                        })
                      }
                    />
                    <span>kt SAF</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="form-divider" />
            <label>
              Biomass-to-SAF mass yield <span className="badge">ASSUMED</span>
              <div className="input-unit">
                <input
                  aria-label="Conversion yield (%)"
                  type="number"
                  min="0.1"
                  max="100"
                  step="1"
                  value={input.conversion_yield * 100}
                  onChange={(e) =>
                    edit("conversion_yield", e.target.valueAsNumber / 100)
                  }
                />
                <span>%</span>
              </div>
            </label>
            <p className="micro">
              Requires{" "}
              {number(totalDemand(input) / (input.conversion_yield || 1))} kt
              biomass at the current yield. Available supply need not all be
              consumed.
            </p>
            <details className="advanced">
              <summary>
                Financial & site assumptions <ChevronDown size={15} />
              </summary>
              <div className="advanced-fields">
                <div className="input-pair">
                  <label>
                    Horizon (years)
                    <input
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      value={input.horizon_years}
                      onChange={(e) =>
                        edit("horizon_years", e.target.valueAsNumber)
                      }
                    />
                  </label>
                  <label>
                    Discount rate (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={input.discount_rate * 100}
                      onChange={(e) =>
                        edit("discount_rate", e.target.valueAsNumber / 100)
                      }
                    />
                  </label>
                </div>
                <label>
                  Distance proxy multiplier
                  <input
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={input.distance_multiplier}
                    onChange={(e) =>
                      edit("distance_multiplier", e.target.valueAsNumber)
                    }
                  />
                </label>
                <p className="micro">
                  Approximation only, not a validated road-distance adjustment.
                </p>
                <label>
                  Small refinery annual fixed OpEx (USD)
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={input.processing_opex.small}
                    onChange={(e) =>
                      edit("processing_opex", {
                        ...input.processing_opex,
                        small: e.target.valueAsNumber,
                      })
                    }
                  />
                </label>
                <label>
                  Large refinery annual fixed OpEx (USD)
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={input.processing_opex.large}
                    onChange={(e) =>
                      edit("processing_opex", {
                        ...input.processing_opex,
                        large: e.target.valueAsNumber,
                      })
                    }
                  />
                </label>
                <p className="micro">
                  Defaults are zero because production OpEx was not supplied.
                </p>
                <fieldset className="candidate-checks">
                  <legend>Exclude candidate sites</legend>
                  <p className="micro">
                    An exclusion disables both facility roles at this source
                    coordinate.
                  </p>
                  {uniqueCandidates.map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        checked={input.excluded_candidate_ids.includes(c.id)}
                        onChange={(e) =>
                          edit(
                            "excluded_candidate_ids",
                            e.target.checked
                              ? [...input.excluded_candidate_ids, c.id]
                              : input.excluded_candidate_ids.filter(
                                  (id) => id !== c.id,
                                ),
                          )
                        }
                      />
                      <span>
                        {c.id}
                        <small>{c.district}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </div>
            </details>
            <button
              className="button primary solve-button"
              data-testid="optimise-network"
              disabled={loading || busy || saving || !locations.sources.length}
              onClick={() => void solve()}
            >
              {busy ? (
                <span className="spinner" />
              ) : (
                <Play size={17} fill="currentColor" />
              )}
              {busy ? "Optimising the network…" : "Optimise Network"}
              {!busy && <ArrowRight size={17} />}
            </button>
            <div className="button-row scenario-actions">
              <button
                data-testid="save-scenario"
                className="button secondary small"
                disabled={busy || saving}
                onClick={() => void save()}
              >
                <Save size={14} />
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                className="button secondary small"
                disabled={!selected || busy || saving}
                onClick={() => void duplicate()}
              >
                <Copy size={14} />
                Duplicate
              </button>
              <button
                className="icon-button danger"
                title="Delete scenario"
                aria-label="Delete scenario"
                disabled={!selected || busy || saving}
                onClick={() => void remove()}
              >
                <Trash2 size={15} />
              </button>
            </div>
            {notice && (
              <p role="status" className="success-note">
                {notice}
              </p>
            )}
            <p className="micro">
              Real mathematical optimisation. No hardcoded network.
              <br />
              Default target gap ≤2%; bounded server solve time.
            </p>
          </div>
        </aside>
      </div>
      {runs.length > 0 && (
        <div className="run-picker">
          <label>
            Inspect a saved run
            <select
              data-testid="run-selector"
              value={run?.id || ""}
              onChange={(e) =>
                setRun(runs.find((r) => r.id === e.target.value) || null)
              }
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.input_snapshot.name} ·{" "}
                  {number(totalDemand(r.input_snapshot))} kt · {r.status} ·{" "}
                  {r.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <a href="/compare">
            Compare scenarios <ArrowRight size={16} />
          </a>
        </div>
      )}
      {run && <RunResults key={run.id} run={run} />}
      <div className="workflow-strip">
        <div>
          <span>01</span>
          <strong>Map the potential</strong>
          <p>80 source records. 6,800 kt of available biomass.</p>
        </div>
        <div>
          <span>02</span>
          <strong>Design the network</strong>
          <p>Jointly choose facility sites, sizes and material flows.</p>
        </div>
        <div>
          <span>03</span>
          <strong>Inspect every decision</strong>
          <p>Trace quantities, costs, constraints and assumptions.</p>
        </div>
      </div>
    </div>
  );
}
