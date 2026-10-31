"use client";
import { useState } from "react";
import { Download, FileJson, MessageSquareText } from "lucide-react";
import { downloadRun, request } from "../lib/api";
import { money, number, totalDemand } from "../lib/format";
import type { Run } from "../lib/types";
export function SolutionStatus({
  run,
  busy = false,
}: {
  run: Run | null;
  busy?: boolean;
}) {
  return (
    <span
      data-testid="solution-status"
      className={`status ${busy ? "pending" : run?.feasible ? "success" : run ? "warning" : ""}`}
    >
      {busy
        ? "Solving MILP…"
        : run?.status === "optimal"
          ? "Solved to target gap"
          : run?.status === "feasible"
            ? "Feasible incumbent"
            : run?.status === "infeasible"
              ? "Infeasible"
              : run?.status === "no_solution"
                ? "No feasible solution"
                : "Ready to optimise"}
      {run?.feasible && run.relative_gap != null && !busy && (
        <span> · {(run.relative_gap * 100).toFixed(2)}% gap</span>
      )}
    </span>
  );
}
export function CostSummary({ run }: { run: Run }) {
  const c = run.costs;
  if (!c) return null;
  const pieces = [
    ["Depot CapEx", c.depot_capex_usd],
    ["Refinery CapEx", c.refinery_capex_usd],
    ["Farm → depot / year", c.farm_depot_usd],
    ["Depot → refinery / year", c.depot_refinery_usd],
    ["Refinery → airport / year", c.refinery_airport_usd],
    ["Processing OpEx / year", c.annual_processing_usd],
  ] as const;
  return (
    <div className="cost-summary">
      <div className="section-heading">
        <h3>Investment & operating costs</h3>
        <span className="eyebrow">USD · MODELLED</span>
      </div>
      {pieces.map(([name, v]) => (
        <div className="cost-row" key={name}>
          <span>{name}</span>
          <b>{money(v, false)}</b>
        </div>
      ))}
      <div className="cost-row total">
        <span>CapEx + discounted recurring costs</span>
        <b>{money(run.objective_usd, false)}</b>
      </div>
      <p className="micro">
        {run.input_snapshot.horizon_years}-year horizon · PV annuity factor{" "}
        {number(c.pvaf, 4)} · Processing OpEx excluded unless configured.
      </p>
    </div>
  );
}
export function FacilityTable({ run }: { run: Run }) {
  return (
    <div className="table-wrap">
      <table data-testid="facilities-table">
        <caption>Selected facilities · biomass input capacity</caption>
        <thead>
          <tr>
            <th>Candidate site</th>
            <th>Facility</th>
            <th>Size</th>
            <th>Throughput / capacity</th>
            <th>Utilisation</th>
            <th>CapEx</th>
          </tr>
        </thead>
        <tbody>
          {run.facilities.map((f) => (
            <tr key={`${f.facility_type}-${f.candidate_id}`}>
              <td>
                <strong>{f.candidate_id}</strong>
                <small>
                  {f.latitude.toFixed(4)}, {f.longitude.toFixed(4)}
                </small>
              </td>
              <td>
                <span className={`type-label ${f.facility_type}`}>
                  {f.facility_type}
                </span>
              </td>
              <td className="capitalize">{f.size}</td>
              <td>
                {number(f.throughput_input_kt)} / {number(f.capacity_input_kt)}{" "}
                kt
              </td>
              <td>{number(f.utilization * 100)}%</td>
              <td>{money(f.capex_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function RunResults({ run }: { run: Run }) {
  const [tab, setTab] = useState("facilities");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [useAi, setUseAi] = useState(false);
  async function explain() {
    setExplaining(true);
    setError("");
    try {
      const r = await request<{ summary: string; source: string }>(
        `/runs/${run.id}/explain`,
        "POST",
        { use_ai: useAi },
      );
      setExplanation(`${r.summary}\n\nSource: ${r.source}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExplaining(false);
    }
  }
  async function download(format: "json" | "csv") {
    try {
      await downloadRun(run.id, format);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="panel results">
      <div className="panel-header">
        <div>
          <span className="eyebrow">IMMUTABLE SOLVER RUN</span>
          <h2>Every decision, inspectable.</h2>
        </div>
        <div className="button-row">
          <button
            data-testid="export-json"
            className="button secondary small"
            onClick={() => void download("json")}
          >
            <FileJson size={15} />
            JSON
          </button>
          <button
            className="button secondary small"
            onClick={() => void download("csv")}
          >
            <Download size={15} />
            CSV report
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="error-panel">
          {error}
        </div>
      )}
      {!run.feasible ? (
        <div className="empty-state">
          <h3>
            {run.status === "infeasible"
              ? "This scenario cannot be served."
              : "No feasible solution was found."}
          </h3>
          <p>{run.message}</p>
          <p>
            Reduce demand, raise the assumed yield, or enable more candidate
            sites before rerunning.
          </p>
        </div>
      ) : (
        <>
          <div className="run-meta">
            <span>
              {number(totalDemand(run.input_snapshot))} kt finished SAF
            </span>
            <span>
              {number(
                run.facilities
                  .filter((f) => f.facility_type === "depot")
                  .reduce((a, f) => a + f.throughput_input_kt, 0),
              )}{" "}
              kt biomass input
            </span>
            <span>{number(run.solve_seconds, 2)}s solve</span>
            <span>{run.input_snapshot.name}</span>
          </div>
          <div className="tabs" role="tablist" aria-label="Result details">
            {[
              ["facilities", "Facilities"],
              ["farm_depot", "Farm → depot"],
              ["depot_refinery", "Depot → refinery"],
              ["refinery_airport", "Refinery → airport"],
              ["cost", "Cost breakdown"],
              ["method", "Method & assumptions"],
            ].map(([id, label]) => (
              <button
                role="tab"
                aria-selected={tab === id}
                key={id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "facilities" ? (
            <FacilityTable run={run} />
          ) : tab === "cost" ? (
            <CostSummary run={run} />
          ) : tab === "method" ? (
            <div className="method-content">
              <p>
                Joint mixed-integer optimisation over 13 screened depot and 8
                refinery candidates. Coordinates are reference points, not
                permitted industrial sites.
              </p>
              <p>
                Great-circle distances ×{" "}
                {run.input_snapshot.distance_multiplier}; schematic connections
                are not verified roads. Fixed mass yield:{" "}
                {run.input_snapshot.conversion_yield * 100}%. Depot losses are
                assumed zero.
              </p>
              <dl>
                {Object.entries(run.provenance).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replaceAll("_", " ")}</dt>
                    <dd>
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              <small>Input SHA-256: {run.input_hash}</small>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <caption>
                  {tab === "refinery_airport" ? "Finished SAF" : "Biomass"}{" "}
                  flows · actual solver allocation
                </caption>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>To</th>
                    <th>Quantity (kt)</th>
                    <th>Distance proxy</th>
                    <th>Annual transport</th>
                  </tr>
                </thead>
                <tbody>
                  {run.flows
                    .filter((f) => f.stage === tab)
                    .map((f, i) => (
                      <tr key={i}>
                        <td>{f.from_node_id}</td>
                        <td>{f.to_node_id}</td>
                        <td>{number(f.quantity_kt, 3)}</td>
                        <td>{number(f.distance_km)} km</td>
                        <td>{money(f.transport_usd, false)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="explanation">
            <div>
              <MessageSquareText size={20} />
              <div>
                <h3>Explain the decision</h3>
                <p>Grounded in this saved run&apos;s verified solver facts.</p>
              </div>
            </div>
            <button
              className="button secondary small"
              disabled={explaining}
              onClick={() => void explain()}
            >
              {explaining ? "Preparing explanation…" : "Explain this network"}
            </button>
          </div>
          <label className="ai-consent">
            <input
              type="checkbox"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
            />{" "}
            Optional AI: I consent to send this run&apos;s model facts to the
            configured provider. A deterministic explanation works without a
            key.
          </label>
          {explanation && <p className="explanation-text">{explanation}</p>}
        </>
      )}
      {run.warnings?.length > 0 && (
        <div className="run-warnings">
          {run.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
    </section>
  );
}
