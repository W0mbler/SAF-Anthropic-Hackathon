"use client";
import { useEffect, useState } from "react";
import MapCanvas from "../../components/MapCanvas";
import { request } from "../../lib/api";
import { number } from "../../lib/format";
import type { Locations } from "../../lib/types";
export default function Atlas() {
  const [data, setData] = useState<Locations>({ sources: [], airports: [] });
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      setData(await request<Locations>("/locations"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const sources = data.sources.filter(
    (s) =>
      (!province || s.province === province) &&
      (!district || s.district === district),
  );
  return (
    <div className="page-container">
      <div className="simple-heading">
        <span className="eyebrow">THE SUPPLY ATLAS</span>
        <h1>Know the source.</h1>
        <p>Explore every biomass location and all four destination airports.</p>
      </div>
      {error && (
        <div className="error-panel" role="alert">
          {error}
          <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      <div className="atlas-controls">
        <label>
          Province
          <select
            value={province}
            onChange={(e) => {
              setProvince(e.target.value);
              setDistrict("");
            }}
          >
            <option value="">All provinces</option>
            {[...new Set(data.sources.map((s) => s.province))]
              .sort()
              .map((p) => (
                <option key={p}>{p}</option>
              ))}
          </select>
        </label>
        <label>
          District
          <select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          >
            <option value="">All districts</option>
            {[
              ...new Set(
                data.sources
                  .filter((s) => !province || s.province === province)
                  .map((s) => s.district),
              ),
            ]
              .sort()
              .map((d) => (
                <option key={d}>{d}</option>
              ))}
          </select>
        </label>
        <div className="atlas-count">
          <strong data-testid="source-count">{sources.length}</strong> supply
          locations <span>·</span>{" "}
          <strong data-testid="airport-count">{data.airports.length}</strong>{" "}
          airports <span>·</span>{" "}
          {number(
            sources.reduce((a, s) => a + (s.production_kilotons || 0), 0),
          )}{" "}
          kt available biomass
        </div>
      </div>
      <section className="panel">
        {loading ? (
          <div className="map-skeleton">Loading the source atlas…</div>
        ) : (
          <MapCanvas sources={sources} airports={data.airports} />
        )}
      </section>
      <section className="panel atlas-table">
        <div className="panel-header">
          <div>
            <span className="eyebrow">ORIGINAL CHALLENGE DATA</span>
            <h2>80 locations. No synthetic points.</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <caption>Filtered biomass source records</caption>
            <thead>
              <tr>
                <th>Source ID</th>
                <th>Province</th>
                <th>District</th>
                <th>Biomass (kt)</th>
                <th>Coordinates (lat, lon)</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.id}</strong>
                  </td>
                  <td>{s.province}</td>
                  <td>{s.district}</td>
                  <td>{number(s.production_kilotons || 0, 2)}</td>
                  <td>
                    {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
