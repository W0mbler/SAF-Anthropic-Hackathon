"use client";

import { useId, useMemo, useState } from "react";
import type { Facility, Flow, Location } from "../lib/types";
import LocalMap from "./LocalMap";

type Props = {
  sources: Location[];
  airports: Location[];
  facilities?: Facility[];
  flows?: Flow[];
  province?: string;
};
type Layer = "sources" | "airports" | "depots" | "refineries" | "flows";
type Selected = {
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  facts: [string, string][];
};

const WIDTH = 880;
const HEIGHT = 680;
const point = (longitude: number, latitude: number): [number, number] => [
  ((longitude - 108) / 11) * WIDTH,
  ((5 - latitude) / 10) * HEIGHT,
];
const land = [
  [109.2, -0.1],
  [108.9, 1.2],
  [109.6, 2],
  [110.3, 2],
  [110.7, 2.8],
  [111.5, 2.9],
  [112.3, 3.4],
  [113, 3.2],
  [113.7, 4],
  [114.4, 4.2],
  [114.9, 4.9],
  [115.8, 4.8],
  [116.7, 4],
  [117.6, 3.5],
  [117.7, 2.7],
  [118.5, 2.1],
  [118.1, 1.1],
  [117.6, 0.8],
  [117.7, 0],
  [117.3, -0.9],
  [117, -1.6],
  [116.5, -2.2],
  [116.3, -3],
  [116, -3.6],
  [115.4, -4.1],
  [114.7, -4.2],
  [114.2, -3.4],
  [113.4, -3.2],
  [112.6, -3.4],
  [111.8, -3.6],
  [111, -3.2],
  [110.4, -2.8],
  [110, -2.9],
  [109.8, -2.2],
  [110, -1.8],
  [109.4, -1.1],
  [109.2, -0.1],
]
  .map(([lon, lat]) => point(lon, lat).join(","))
  .join(" ");
const colors: Record<Layer, string> = {
  sources: "#54dbad",
  airports: "#b5d7ff",
  depots: "#f3bd61",
  refineries: "#fb8f75",
  flows: "#66cfc0",
};
const labels: Record<Layer, string> = {
  sources: "Biomass",
  airports: "Airports",
  depots: "Depots",
  refineries: "Refineries",
  flows: "Connections",
};
const number = (value: number, decimals = 2) =>
  value.toLocaleString("en-US", { maximumFractionDigits: decimals });

export default function MapCanvas({
  sources,
  airports,
  facilities = [],
  flows = [],
  province,
}: Props) {
  const id = useId().replace(/:/g, "");
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    sources: true,
    airports: true,
    depots: true,
    refineries: true,
    flows: true,
  });
  const [selected, setSelected] = useState<Selected | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mapReady, setMapReady] = useState(false);
  const [coordinateFallback, setCoordinateFallback] = useState(false);
  const showMapLibre = mapReady && !coordinateFallback;
  const visibleSources = sources.filter(
    (source) => !province || province === "all" || source.province === province,
  );
  const nodes = useMemo(() => {
    const result = new Map<string, { latitude: number; longitude: number }>();
    for (const node of [...sources, ...airports]) {
      result.set(node.id, node);
      if (node.iata_code) result.set(node.iata_code, node);
    }
    for (const facility of facilities) {
      result.set(facility.candidate_id, facility);
      result.set(
        `${facility.facility_type}:${facility.candidate_id}`,
        facility,
      );
    }
    return result;
  }, [sources, airports, facilities]);
  const getNode = (key: string) =>
    nodes.get(key) ??
    nodes.get(key.replace(/^(farm|biomass|depot|refinery|airport)[_:]/, ""));
  const selectLocation = (location: Location, airport = false) =>
    setSelected({
      title: location.display_name || location.id,
      category: airport
        ? "AIRPORT · FINISHED SAF DESTINATION"
        : "BIOMASS SOURCE",
      latitude: location.latitude,
      longitude: location.longitude,
      facts: [
        ["Identifier", location.id],
        ...(location.province
          ? [["Province", location.province] as [string, string]]
          : []),
        ...(location.district
          ? [["District", location.district] as [string, string]]
          : []),
        ...(location.production_kilotons !== undefined &&
        location.production_kilotons !== null
          ? [
              [
                "Available biomass",
                `${number(location.production_kilotons)} kt`,
              ] as [string, string],
            ]
          : []),
      ],
    });
  const selectFacility = (facility: Facility) =>
    setSelected({
      title: facility.candidate_id,
      category: `${facility.size.toUpperCase()} ${facility.facility_type.toUpperCase()}`,
      latitude: facility.latitude,
      longitude: facility.longitude,
      facts: [
        ["Biomass input", `${number(facility.throughput_input_kt)} kt`],
        ["Input capacity", `${number(facility.capacity_input_kt)} kt`],
        ["Utilisation", `${number(facility.utilization * 100, 1)}%`],
        ["Upfront CapEx", `$${number(facility.capex_usd / 1e6)}M`],
      ],
    });
  const width = WIDTH / zoom;
  const height = HEIGHT / zoom;
  const viewBox = `${(WIDTH - width) / 2} ${(HEIGHT - height) / 2} ${width} ${height}`;

  return (
    <section
      className="map-shell"
      aria-label="Interactive Kalimantan supply network"
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#0b1824",
        border: "1px solid #24404b",
        borderRadius: 18,
      }}
    >
      <div
        className="map-toolbar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          padding: "16px 18px",
          borderBottom: "1px solid #203440",
          flexWrap: "wrap",
        }}
      >
        <div>
          <span
            style={{
              color: "#63dcb5",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
            }}
          >
            REGIONAL SUPPLY NETWORK
          </span>
          <div style={{ color: "#e4edf4", marginTop: 4, fontSize: 14 }}>
            Kalimantan, Indonesia
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#91a8b5", fontSize: 11 }}>
            {visibleSources.length} supply points · {airports.length} airports
          </span>
          {mapReady && (
            <button
              type="button"
              onClick={() => setCoordinateFallback((current) => !current)}
              style={{
                color: "#9cbdcb",
                fontSize: 10,
                background: "transparent",
                border: "1px solid #35525d",
                borderRadius: 5,
                padding: "5px 8px",
                cursor: "pointer",
              }}
            >
              {coordinateFallback ? "Interactive map" : "Coordinate view"}
            </button>
          )}
        </div>
      </div>
      <div style={{ position: "relative" }}>
        <svg
          viewBox={viewBox}
          role="group"
          aria-labelledby={`${id}-title ${id}-description`}
          aria-hidden={showMapLibre}
          style={{
            display: "block",
            width: "100%",
            minHeight: 340,
            maxHeight: 620,
            visibility: showMapLibre ? "hidden" : "visible",
          }}
        >
          <title id={`${id}-title`}>
            Kalimantan biomass, airport and solved facility locations
          </title>
          <desc id={`${id}-description`}>
            Offline geographic coordinate map. Coastline is schematic.
            Connections show modelled straight-line distances, not verified
            roads. Use the layer controls, zoom buttons, and clickable points to
            inspect data.
          </desc>
          <defs>
            <radialGradient id={`${id}-sea`}>
              <stop stopColor="#132d38" />
              <stop offset="1" stopColor="#0a1521" />
            </radialGradient>
            <linearGradient id={`${id}-land`} x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#1a3a3d" />
              <stop offset="1" stopColor="#142a32" />
            </linearGradient>
          </defs>
          <rect
            x="0"
            y="0"
            width={WIDTH}
            height={HEIGHT}
            fill={`url(#${id}-sea)`}
          />
          {Array.from({ length: 12 }, (_, index) => (
            <g key={`lon-${index}`}>
              <line
                x1={(index * WIDTH) / 11}
                y1="0"
                x2={(index * WIDTH) / 11}
                y2={HEIGHT}
                stroke="#35515c"
                strokeOpacity=".2"
              />
              <text
                x={(index * WIDTH) / 11 + 7}
                y={HEIGHT - 12}
                fontSize="10"
                fill="#607d8b"
              >
                {108 + index}° E
              </text>
            </g>
          ))}
          {Array.from({ length: 11 }, (_, index) => (
            <g key={`lat-${index}`}>
              <line
                x1="0"
                y1={(index * HEIGHT) / 10}
                x2={WIDTH}
                y2={(index * HEIGHT) / 10}
                stroke="#35515c"
                strokeOpacity={index === 5 ? 0.6 : 0.2}
                strokeDasharray={index === 5 ? "6 6" : undefined}
              />
              <text
                x="8"
                y={(index * HEIGHT) / 10 + 15}
                fontSize="10"
                fill="#607d8b"
              >
                {Math.abs(5 - index)}° {index <= 5 ? "N" : "S"}
              </text>
            </g>
          ))}
          <polygon
            points={land}
            fill={`url(#${id}-land)`}
            stroke="#385e61"
            strokeWidth="1.4"
          />
          <text
            x="440"
            y="265"
            fill="#8ab5a9"
            opacity=".35"
            fontSize="28"
            letterSpacing="12"
            textAnchor="middle"
          >
            KALIMANTAN
          </text>
          <text
            x="730"
            y="505"
            fill="#426273"
            fontSize="12"
            letterSpacing="3"
            transform="rotate(-70 730 505)"
          >
            MAKASSAR STRAIT
          </text>
          <text
            x="125"
            y="470"
            fill="#426273"
            fontSize="12"
            letterSpacing="3"
            transform="rotate(-70 125 470)"
          >
            KARIMATA STRAIT
          </text>
          {layers.flows &&
            flows.map((flow, index) => {
              const from = getNode(flow.from_node_id);
              const to = getNode(flow.to_node_id);
              if (!from || !to || flow.quantity_kt <= 0) return null;
              const [x1, y1] = point(from.longitude, from.latitude);
              const [x2, y2] = point(to.longitude, to.latitude);
              const color =
                flow.stage === "refinery_airport"
                  ? "#87bdf2"
                  : flow.stage === "depot_refinery"
                    ? "#efbb68"
                    : "#54dbad";
              return (
                <line
                  key={`${flow.stage}-${index}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeOpacity=".48"
                  strokeWidth={Math.max(
                    0.7,
                    Math.min(6, Math.sqrt(flow.quantity_kt) / 2),
                  )}
                  strokeDasharray={
                    flow.stage === "refinery_airport" ? "5 4" : undefined
                  }
                >
                  <title>
                    {flow.stage.replaceAll("_", " → ")}:{" "}
                    {number(flow.quantity_kt)} kt {flow.material};{" "}
                    {number(flow.distance_km)} km proxy
                  </title>
                </line>
              );
            })}
          {layers.sources &&
            visibleSources.map((source) => {
              const [x, y] = point(source.longitude, source.latitude);
              return (
                <g
                  key={source.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${source.id}, ${source.district}, ${source.production_kilotons} kilotonnes available biomass`}
                  onClick={() => selectLocation(source)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectLocation(source);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <circle cx={x} cy={y} r="9" fill="transparent" />
                  <circle
                    cx={x}
                    cy={y}
                    r={2.3 + Math.sqrt(source.production_kilotons ?? 0) / 5}
                    fill={colors.sources}
                    fillOpacity=".7"
                    stroke="#a4f5d6"
                    strokeWidth=".6"
                  />
                  <title>
                    {source.id} · {source.district} ·{" "}
                    {number(source.production_kilotons ?? 0)} kt biomass
                  </title>
                </g>
              );
            })}
          {facilities
            .filter(
              (facility) =>
                layers[
                  facility.facility_type === "depot" ? "depots" : "refineries"
                ],
            )
            .map((facility) => {
              const [x, y] = point(facility.longitude, facility.latitude);
              const refinery = facility.facility_type === "refinery";
              return (
                <g
                  key={`${facility.facility_type}-${facility.candidate_id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${facility.size} ${facility.facility_type} ${facility.candidate_id}`}
                  onClick={() => selectFacility(facility)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectFacility(facility);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r="13"
                    fill="#07141d"
                    fillOpacity=".85"
                  />
                  {refinery ? (
                    <path
                      d={`M ${x} ${y - 9} L ${x + 9} ${y} L ${x} ${y + 9} L ${x - 9} ${y} Z`}
                      fill={colors.refineries}
                      stroke="#ffd6c9"
                      strokeWidth="1.5"
                    />
                  ) : (
                    <rect
                      x={x - 6}
                      y={y - 6}
                      width="12"
                      height="12"
                      rx="2"
                      fill={colors.depots}
                      stroke="#ffe9bc"
                      strokeWidth="1.5"
                    />
                  )}
                  <title>
                    {facility.size} {facility.facility_type} ·{" "}
                    {facility.candidate_id} ·{" "}
                    {number(facility.throughput_input_kt)} kt input
                  </title>
                </g>
              );
            })}
          {layers.airports &&
            airports.map((airport) => {
              const [x, y] = point(airport.longitude, airport.latitude);
              return (
                <g
                  key={airport.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${airport.iata_code || airport.id} airport ${airport.display_name}`}
                  onClick={() => selectLocation(airport, true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectLocation(airport, true);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r="11"
                    fill="#152b40"
                    stroke={colors.airports}
                    strokeWidth="1.4"
                  />
                  <path
                    d={`M ${x - 6} ${y + 1} L ${x - 1} ${y - 1} L ${x - 1} ${y - 6} L ${x + 1} ${y - 6} L ${x + 2} ${y - 1} L ${x + 6} ${y + 1} L ${x + 6} ${y + 3} L ${x + 1} ${y + 2} L ${x + 1} ${y + 5} L ${x - 1} ${y + 5} L ${x - 1} ${y + 2} L ${x - 6} ${y + 3} Z`}
                    fill={colors.airports}
                  />
                  <text
                    x={x + 16}
                    y={y + 4}
                    fill="#d7e9fb"
                    fontSize="12"
                    fontWeight="700"
                    paintOrder="stroke"
                    stroke="#0a1521"
                    strokeWidth="3"
                  >
                    {airport.iata_code || airport.id}
                  </text>
                  <title>{airport.display_name}</title>
                </g>
              );
            })}
        </svg>
        <LocalMap
          sources={visibleSources}
          airports={airports}
          facilities={facilities}
          flows={flows}
          layers={layers}
          visible={showMapLibre}
          onReady={setMapReady}
          onLocation={(key, airport) => {
            const location = (airport ? airports : sources).find(
              (item) => item.id === key,
            );
            if (location) selectLocation(location, airport);
          }}
          onFacility={(key, kind) => {
            const facility = facilities.find(
              (item) =>
                item.candidate_id === key && item.facility_type === kind,
            );
            if (facility) selectFacility(facility);
          }}
        />
        {!showMapLibre && (
          <div
            style={{
              position: "absolute",
              right: 14,
              top: 14,
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
            aria-label="Map zoom controls"
          >
            {[
              {
                text: "+",
                label: "Zoom in",
                action: () => setZoom((current) => Math.min(3, current + 0.5)),
              },
              {
                text: "−",
                label: "Zoom out",
                action: () => setZoom((current) => Math.max(1, current - 0.5)),
              },
              { text: "↺", label: "Reset map zoom", action: () => setZoom(1) },
            ].map((button) => (
              <button
                key={button.label}
                type="button"
                aria-label={button.label}
                onClick={button.action}
                style={{
                  width: 34,
                  height: 34,
                  border: "1px solid #385360",
                  background: "#102330",
                  color: "#e6f4f5",
                  borderRadius: 7,
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                {button.text}
              </button>
            ))}
          </div>
        )}
        {selected && (
          <div
            className="map-detail"
            role="region"
            aria-label="Selected map feature"
            style={{
              position: "absolute",
              zIndex: 3,
              left: 14,
              bottom: 14,
              width: "min(300px, calc(100% - 28px))",
              border: "1px solid #456170",
              padding: 17,
              borderRadius: 12,
              background: "rgba(9, 23, 34, .97)",
              boxShadow: "0 12px 40px #0005",
            }}
          >
            <button
              type="button"
              aria-label="Close map details"
              onClick={() => setSelected(null)}
              style={{
                float: "right",
                color: "#a3bdc9",
                border: 0,
                background: "none",
                cursor: "pointer",
                fontSize: 18,
              }}
            >
              ×
            </button>
            <div
              style={{
                color: "#69dcb7",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".12em",
                marginBottom: 8,
              }}
            >
              {selected.category}
            </div>
            <strong style={{ fontSize: 15, color: "#f0f7fa" }}>
              {selected.title}
            </strong>
            <dl style={{ margin: "12px 0 0", fontSize: 12, lineHeight: 1.7 }}>
              {[
                ...selected.facts,
                [
                  "Coordinates",
                  `${selected.latitude.toFixed(4)}, ${selected.longitude.toFixed(4)}`,
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <dt style={{ color: "#91aab7" }}>{label}</dt>
                  <dd
                    style={{ margin: 0, color: "#d6e5ec", textAlign: "right" }}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
      <div
        className="map-legend"
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #243b47",
          display: "flex",
          flexWrap: "wrap",
          gap: "10px 16px",
        }}
      >
        {(Object.keys(labels) as Layer[]).map((layer) => (
          <label
            key={layer}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "#bacdd6",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={layers[layer]}
              onChange={() =>
                setLayers((previous) => ({
                  ...previous,
                  [layer]: !previous[layer],
                }))
              }
              style={{ accentColor: colors[layer], width: 13, height: 13 }}
            />
            <span
              style={{
                width: 6,
                height: 6,
                background: colors[layer],
                borderRadius: layer === "sources" ? "50%" : 1,
              }}
            />
            {labels[layer]}
          </label>
        ))}
      </div>
      <details
        style={{ margin: "0 16px 10px", color: "#a8c1cd", fontSize: 11 }}
      >
        <summary style={{ cursor: "pointer", padding: "4px 0" }}>
          Inspect network points as a list
        </summary>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 4,
            maxHeight: 180,
            overflow: "auto",
            marginTop: 8,
          }}
        >
          {airports.map((airport) => (
            <button
              key={`list-${airport.id}`}
              type="button"
              onClick={() => selectLocation(airport, true)}
              style={{
                background: "#112735",
                border: "1px solid #294250",
                color: "#b5d7ff",
                padding: 7,
                borderRadius: 4,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              Airport · {airport.iata_code || airport.id}
            </button>
          ))}
          {facilities.map((facility) => (
            <button
              key={`list-${facility.facility_type}-${facility.candidate_id}`}
              type="button"
              onClick={() => selectFacility(facility)}
              style={{
                background: "#112735",
                border: "1px solid #294250",
                color:
                  facility.facility_type === "refinery"
                    ? colors.refineries
                    : colors.depots,
                padding: 7,
                borderRadius: 4,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {facility.size} {facility.facility_type} · {facility.candidate_id}
            </button>
          ))}
          {visibleSources.map((source) => (
            <button
              key={`list-${source.id}`}
              type="button"
              onClick={() => selectLocation(source)}
              style={{
                background: "#112735",
                border: "1px solid #294250",
                color: colors.sources,
                padding: 7,
                borderRadius: 4,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {source.id} · {number(source.production_kilotons ?? 0)} kt
            </button>
          ))}
        </div>
      </details>
      <div
        style={{
          padding: "0 16px 12px",
          color: "#7f99a7",
          fontSize: 10,
          lineHeight: 1.6,
        }}
      >
        Offline coordinate map · schematic land outline. Lines represent
        straight-line distance proxies, not verified roads. Candidate sites are
        geographic reference points, not permitted construction sites.
      </div>
    </section>
  );
}
