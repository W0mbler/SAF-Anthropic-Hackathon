"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { request, session } from "../../lib/api";
import { money, number, totalDemand } from "../../lib/format";
import type { Comparison, Locations, Run } from "../../lib/types";
import MapCanvas from "../../components/MapCanvas";
import {
  CostSummary,
  FacilityTable,
  SolutionStatus,
} from "../../components/Results";
export default function Compare() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [data, setData] = useState<Locations>({ sources: [], airports: [] });
  const [result, setResult] = useState<Comparison | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      try {
        await session();
        const [r, l] = await Promise.all([
          request<Run[]>("/runs"),
          request<Locations>("/locations"),
        ]);
        setRuns(r);
        setData(l);
        setLeft(r[1]?.id || r[0]?.id || "");
        setRight(r[0]?.id || "");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  async function compare() {
    setBusy(true);
    setError("");
    try {
      setResult(
        await request<Comparison>("/compare", "POST", {
          left_run_id: left,
          right_run_id: right,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-container">
      <div className="simple-heading">
        <span className="eyebrow">SCENARIO COMPARISON</span>
        <h1>
          A different assumption.
          <br />
          <span>A different decision.</span>
        </h1>
        <p>
          Compare genuine saved runs — facilities, investment and material
          flows.
        </p>
      </div>
      {error && (
        <div className="error-panel" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="panel empty-state">Loading your saved runs…</div>
      ) : runs.length < 2 ? (
        <div className="panel empty-state">
          <h2>Build two networks to see the difference.</h2>
          <p>
            Solve a baseline, change demand or exclude a candidate site, then
            solve again. Both results remain saved.
          </p>
          <Link className="button primary" href="/optimize">
            Open Scenario Studio <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <>
          <div className="compare-controls panel">
            <label>
              Baseline run
              <select
                data-testid="compare-left"
                value={left}
                onChange={(e) => {
                  setLeft(e.target.value);
                  setResult(null);
                }}
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.input_snapshot.name} · {totalDemand(r.input_snapshot)} kt
                    · {r.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight size={22} />
            <label>
              Comparison run
              <select
                data-testid="compare-right"
                value={right}
                onChange={(e) => {
                  setRight(e.target.value);
                  setResult(null);
                }}
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.input_snapshot.name} · {totalDemand(r.input_snapshot)} kt
                    · {r.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <button
              data-testid="compare-submit"
              className="button primary"
              disabled={busy || left === right}
              onClick={() => void compare()}
            >
              {busy ? "Comparing…" : "Compare networks"}
              <ArrowUpRight size={17} />
            </button>
          </div>
          {result && (
            <div data-testid="compare-result">
              <div className="kpi-grid compare-kpis">
                <div className="kpi">
                  <span>Total modelled cost Δ</span>
                  <strong data-testid="compare-delta-cost">
                    {money(result.delta.objective_usd)}
                  </strong>
                  <p>Comparison − baseline</p>
                </div>
                <div className="kpi">
                  <span>Facility CapEx Δ</span>
                  <strong>{money(result.delta.capex_usd)}</strong>
                  <p>Upfront investment difference</p>
                </div>
                <div className="kpi">
                  <span>Facilities Δ</span>
                  <strong>
                    {result.delta.facility_count > 0 ? "+" : ""}
                    {result.delta.facility_count}
                  </strong>
                  <p>
                    {result.added_facilities.length} added ·{" "}
                    {result.removed_facilities.length} removed
                  </p>
                </div>
                <div className="kpi">
                  <span>SAF demand Δ</span>
                  <strong>
                    {number(result.delta.demand_saf_kt)} <small>kt</small>
                  </strong>
                  <p>Finished SAF per model period</p>
                </div>
              </div>
              {result.warnings.map((w) => (
                <p className="assumption-banner" key={w}>
                  {w}
                </p>
              ))}
              <div className="comparison-grid">
                {[result.left, result.right].map((r, i) => (
                  <section className="panel" key={`${i}-${r.id}`}>
                    <div className="panel-header">
                      <div>
                        <span className="eyebrow">
                          {i ? "COMPARISON" : "BASELINE"}
                        </span>
                        <h2>{r.input_snapshot.name}</h2>
                      </div>
                      <SolutionStatus run={r} />
                    </div>
                    <MapCanvas
                      sources={data.sources}
                      airports={data.airports}
                      facilities={r.facilities}
                      flows={r.flows}
                    />
                    {r.feasible ? (
                      <>
                        <CostSummary run={r} />
                        <FacilityTable run={r} />
                      </>
                    ) : (
                      <p className="empty-state">{r.message}</p>
                    )}
                  </section>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
