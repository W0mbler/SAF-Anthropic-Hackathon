"use client";

import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Polygon,
} from "geojson";
import type { Facility, Flow, Location } from "../lib/types";
import "maplibre-gl/dist/maplibre-gl.css";

type Layer = "sources" | "airports" | "depots" | "refineries" | "flows";
type Props = {
  sources: Location[];
  airports: Location[];
  facilities: Facility[];
  flows: Flow[];
  layers: Record<Layer, boolean>;
  visible: boolean;
  onReady: (ready: boolean) => void;
  onLocation: (id: string, airport: boolean) => void;
  onFacility: (id: string, kind: string) => void;
};
const coastline = [
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
];
const collection = (features: Feature[]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});
const locationFeature = (
  location: Location,
  kind: "sources" | "airports",
): Feature<Point> => ({
  type: "Feature",
  geometry: {
    type: "Point",
    coordinates: [location.longitude, location.latitude],
  },
  properties: {
    id: location.id,
    kind,
    production: location.production_kilotons ?? 0,
  },
});

/** All geometry is local GeoJSON; no tiles, API keys, glyph servers or network requests. */
export default function LocalMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const state = useRef(props);
  useEffect(() => {
    state.current = props;
  }, [props]);
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    void import("maplibre-gl")
      .then((module) => {
        if (cancelled || !container.current) return;
        try {
          const map = new module.Map({
            container: container.current,
            style: {
              version: 8,
              sources: {},
              layers: [
                {
                  id: "ocean",
                  type: "background",
                  paint: { "background-color": "#0c1b27" },
                },
              ],
            },
            center: [113.5, 0],
            zoom: 5,
            minZoom: 3,
            maxZoom: 13,
            attributionControl: {
              customAttribution:
                "Local schematic land outline · challenge supply data / OpenFlights airports",
            },
            dragRotate: false,
            pitchWithRotate: false,
            renderWorldCopies: false,
          });
          mapRef.current = map;
          map.addControl(
            new module.NavigationControl({ showCompass: false }),
            "top-right",
          );
          map.on("error", () => {
            if (!cancelled) state.current.onReady(false);
          });
          map.on("webglcontextlost", () => {
            if (!cancelled) state.current.onReady(false);
          });
          map.on("load", () => {
            if (cancelled) return;
            const land: Feature<Polygon> = {
              type: "Feature",
              geometry: { type: "Polygon", coordinates: [coastline] },
              properties: {},
            };
            map.addSource("land", {
              type: "geojson",
              data: collection([land]),
            });
            map.addLayer({
              id: "land-fill",
              type: "fill",
              source: "land",
              paint: { "fill-color": "#193638", "fill-opacity": 0.8 },
            });
            map.addLayer({
              id: "land-line",
              type: "line",
              source: "land",
              paint: { "line-color": "#3c6265", "line-width": 1.5 },
            });
            const grid: Feature<LineString>[] = [];
            for (let longitude = 108; longitude <= 119; longitude++)
              grid.push({
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [longitude, -5],
                    [longitude, 5],
                  ],
                },
              });
            for (let latitude = -5; latitude <= 5; latitude++)
              grid.push({
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [108, latitude],
                    [119, latitude],
                  ],
                },
              });
            map.addSource("grid", { type: "geojson", data: collection(grid) });
            map.addLayer({
              id: "coordinate-grid",
              type: "line",
              source: "grid",
              paint: {
                "line-color": "#36545f",
                "line-opacity": 0.27,
                "line-width": 0.8,
              },
            });
            map.addSource("connections", {
              type: "geojson",
              data: collection([]),
            });
            map.addLayer({
              id: "flows",
              type: "line",
              source: "connections",
              paint: {
                "line-color": [
                  "match",
                  ["get", "stage"],
                  "refinery_airport",
                  "#9ac7f5",
                  "depot_refinery",
                  "#f1bd6b",
                  "#5edfb3",
                ],
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["get", "quantity"],
                  0,
                  0.8,
                  100,
                  3,
                  500,
                  7,
                ],
                "line-opacity": 0.6,
              },
            });
            map.addSource("points", { type: "geojson", data: collection([]) });
            map.addLayer({
              id: "sources",
              type: "circle",
              source: "points",
              filter: ["==", ["get", "kind"], "sources"],
              paint: {
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["get", "production"],
                  0,
                  3,
                  100,
                  6,
                ],
                "circle-color": "#5edfb3",
                "circle-opacity": 0.82,
                "circle-stroke-color": "#b3f6dd",
                "circle-stroke-width": 0.6,
              },
            });
            map.addLayer({
              id: "airports",
              type: "circle",
              source: "points",
              filter: ["==", ["get", "kind"], "airports"],
              paint: {
                "circle-radius": 9,
                "circle-color": "#24415a",
                "circle-stroke-color": "#b5d7ff",
                "circle-stroke-width": 2,
              },
            });
            map.addSource("facilities", {
              type: "geojson",
              data: collection([]),
            });
            map.addLayer({
              id: "depots",
              type: "circle",
              source: "facilities",
              filter: ["==", ["get", "kind"], "depot"],
              paint: {
                "circle-radius": ["match", ["get", "size"], "large", 9, 7],
                "circle-color": "#f3bd61",
                "circle-stroke-color": "#ffe9bc",
                "circle-stroke-width": 2,
              },
            });
            map.addLayer({
              id: "refineries",
              type: "circle",
              source: "facilities",
              filter: ["==", ["get", "kind"], "refinery"],
              paint: {
                "circle-radius": ["match", ["get", "size"], "large", 12, 10],
                "circle-color": "#fb8f75",
                "circle-stroke-color": "#ffd6c9",
                "circle-stroke-width": 2,
              },
            });
            for (const layer of [
              "sources",
              "airports",
              "depots",
              "refineries",
            ]) {
              map.on("mouseenter", layer, () => {
                map.getCanvas().style.cursor = "pointer";
              });
              map.on("mouseleave", layer, () => {
                map.getCanvas().style.cursor = "";
              });
            }
            map.on("click", (event) => {
              const feature = map.queryRenderedFeatures(event.point, {
                layers: ["refineries", "depots", "airports", "sources"],
              })[0];
              if (!feature?.properties) return;
              const { id, kind } = feature.properties as {
                id: string;
                kind: string;
              };
              if (kind === "depot" || kind === "refinery")
                state.current.onFacility(id, kind);
              else state.current.onLocation(id, kind === "airports");
            });
            map.fitBounds(
              [
                [108, -5],
                [119, 5],
              ],
              { padding: 24, duration: 0 },
            );
            updateMap(map, module.Marker, state.current);
            state.current.onReady(true);
          });
          observer = new ResizeObserver(() => map.resize());
          observer.observe(container.current);
        } catch {
          state.current.onReady(false);
        }
      })
      .catch(() => {
        if (!cancelled) state.current.onReady(false);
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      markers.current.forEach((marker) => marker.remove());
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once. Current data and callbacks live in the state ref.
  }, []);

  function updateMap(
    map: MapLibreMap,
    MarkerClass: typeof Marker,
    current: Props,
  ) {
    if (!map.getSource("points")) return;
    (map.getSource("points") as GeoJSONSource).setData(
      collection([
        ...current.sources.map((source) => locationFeature(source, "sources")),
        ...current.airports.map((airport) =>
          locationFeature(airport, "airports"),
        ),
      ]),
    );
    const nodes = new Map<string, { latitude: number; longitude: number }>();
    for (const node of [...current.sources, ...current.airports]) {
      nodes.set(node.id, node);
      if (node.iata_code) nodes.set(node.iata_code, node);
    }
    for (const facility of current.facilities) {
      nodes.set(facility.candidate_id, facility);
      nodes.set(`${facility.facility_type}:${facility.candidate_id}`, facility);
    }
    const find = (key: string) =>
      nodes.get(key) ??
      nodes.get(key.replace(/^(farm|biomass|depot|refinery|airport)[_:]/, ""));
    const connections: Feature<LineString>[] = [];
    for (const flow of current.flows) {
      const from = find(flow.from_node_id);
      const to = find(flow.to_node_id);
      if (from && to && flow.quantity_kt > 0)
        connections.push({
          type: "Feature",
          properties: { stage: flow.stage, quantity: flow.quantity_kt },
          geometry: {
            type: "LineString",
            coordinates: [
              [from.longitude, from.latitude],
              [to.longitude, to.latitude],
            ],
          },
        });
    }
    (map.getSource("connections") as GeoJSONSource).setData(
      collection(connections),
    );
    (map.getSource("facilities") as GeoJSONSource).setData(
      collection(
        current.facilities.map((facility): Feature<Point> => ({
          type: "Feature",
          properties: {
            id: facility.candidate_id,
            kind: facility.facility_type,
            size: facility.size,
          },
          geometry: {
            type: "Point",
            coordinates: [facility.longitude, facility.latitude],
          },
        })),
      ),
    );
    for (const [layer, visible] of Object.entries(current.layers))
      map.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    if (current.layers.airports)
      for (const airport of current.airports) {
        const element = document.createElement("span");
        element.textContent = airport.iata_code || airport.id;
        element.style.cssText =
          "color:#d6eaff;font:700 11px system-ui;text-shadow:0 1px 5px #001220;pointer-events:none";
        markers.current.push(
          new MarkerClass({ element, anchor: "left", offset: [13, 0] })
            .setLngLat([airport.longitude, airport.latitude])
            .addTo(map),
        );
      }
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("points")) return;
    void import("maplibre-gl").then((module) => {
      if (mapRef.current === map) updateMap(map, module.Marker, props);
    });
    // updateMap reads only stable refs and its explicit arguments.
  }, [props]);

  return (
    <div
      ref={container}
      aria-label="Interactive MapLibre Kalimantan coordinate map"
      style={{
        position: "absolute",
        inset: 0,
        visibility: props.visible ? "visible" : "hidden",
      }}
    />
  );
}
