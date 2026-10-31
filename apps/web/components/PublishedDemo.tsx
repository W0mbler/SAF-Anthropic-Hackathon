"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { publication } from "../lib/static-api";
import { money, number, totalDemand } from "../lib/format";
import type { Locations, Run } from "../lib/types";
import MapCanvas from "./MapCanvas";
import { RunResults, SolutionStatus } from "./Results";
export default function PublishedDemo() {
  const [data, setData] = useState<Locations>({ sources: [], airports: [] }),
    [runs, setRuns] = useState<Run[]>([]),
    [selected, setSelected] = useState("published-baseline"),
    [error, setError] = useState("");
  async function load() {
    try {
      const p = await publication();
      setData(p.locations);
      setRuns(p.runs);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const run = runs.find((r) => r.id === selected);
  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <div className="eyebrow">KALIMANTAN · PUBLISHED SCENARIOS</div>
          <h1>
            From biomass.
            <br />
            <span>To boarding gates.</span>
          </h1>
          <p>
            Explore real supply-chain networks calculated by SciPy/HiGHS during
            publication.
          </p>
        </div>
      </div>
      <div className="assumption-banner">
        <p>
          <strong>Free GitHub Pages demo.</strong> These are actual published
          solver results, not live calculations. Choose a scenario to inspect.
          Demand and yield remain illustrative; connections are straight-line
          proxies.
        </p>
      </div>
      {error && (
        <div className="error-panel" role="alert">
          {error}
          <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      <section className="kpi-grid">
        <div className="kpi">
          <span>Available biomass</span>
          <strong>
            6,800 <small>kt</small>
          </strong>
          <p>
            <span data-testid="source-count">{data.sources.length}</span> supply
            locations
          </p>
        </div>
        <div className="kpi">
          <span>Published SAF demand</span>
          <strong>
            {run ? totalDemand(run.input_snapshot) : "—"} <small>kt</small>
          </strong>
          <p>
            <span data-testid="airport-count">{data.airports.length}</span>{" "}
            airports · illustrative
          </p>
        </div>
        <div className="kpi">
          <span>Selected facilities</span>
          <strong>{run?.facilities.length ?? "—"}</strong>
          <p>Calculated sites and sizes</p>
        </div>
        <div className="kpi">
          <span>Total modelled cost</span>
          <strong data-testid="total-cost">{money(run?.objective_usd)}</strong>
          <p>CapEx + discounted recurring costs</p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <label>
            Published scenario
            <select
              data-testid="published-scenario"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.input_snapshot.name} · {totalDemand(r.input_snapshot)} kt
                  SAF
                </option>
              ))}
            </select>
          </label>
          <SolutionStatus run={run || null} />
        </div>
        {run ? (
          <MapCanvas
            sources={data.sources}
            airports={data.airports}
            facilities={run.facilities}
            flows={run.flows}
          />
        ) : (
          <div className="map-skeleton">Loading published results…</div>
        )}
        <div className="panel-header">
          <p>
            {run &&
              Object.entries(run.input_snapshot.demand)
                .map(([code, demand]) => `${code}: ${number(demand)} kt SAF`)
                .join(" · ")}{" "}
            · 20% assumed mass yield
          </p>
          <Link className="button secondary" href="/compare">
            Compare published networks
          </Link>
        </div>
      </section>
      {run && <RunResults key={run.id} run={run} />}
      <section className="panel empty-state">
        <h2>Run your own assumptions</h2>
        <p>
          The complete Python application supports live solves, accounts and
          saved scenarios. GitHub Pages provides the published demonstration
          only.
        </p>
        <a
          className="button secondary"
          href="https://github.com/W0mbler/SAF-Anthropic-Hackathon"
        >
          Get the full application
        </a>
      </section>
    </div>
  );
}
