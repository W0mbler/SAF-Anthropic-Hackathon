import type { Candidates, Comparison, Locations, Run } from "./types";
interface Publication {
  locations: Locations;
  candidates: Candidates;
  runs: Run[];
  explanations: Record<string, { summary: string; source: string }>;
  generated_at: string;
}
let cached: Promise<Publication> | null = null;
export function publication(): Promise<Publication> {
  if (!cached)
    cached = fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/demo/data.json`)
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "Published data could not load. Reload the page to retry.",
          );
        return r.json();
      })
      .catch((e) => {
        cached = null;
        throw e;
      });
  return cached;
}
export function comparePublished(left: Run, right: Run): Comparison {
  const key = (f: Run["facilities"][number]) =>
    `${f.candidate_id}/${f.facility_type}/${f.size}`;
  const a = new Set(left.facilities.map(key)),
    b = new Set(right.facilities.map(key));
  return {
    left,
    right,
    delta: {
      objective_usd: (right.objective_usd || 0) - (left.objective_usd || 0),
      capex_usd: (right.costs?.capex_usd || 0) - (left.costs?.capex_usd || 0),
      annual_transport_usd:
        (right.costs?.annual_transport_usd || 0) -
        (left.costs?.annual_transport_usd || 0),
      facility_count: right.facilities.length - left.facilities.length,
      demand_saf_kt:
        Object.values(right.input_snapshot.demand).reduce((a, b) => a + b, 0) -
        Object.values(left.input_snapshot.demand).reduce((a, b) => a + b, 0),
    },
    added_facilities: right.facilities.filter((f) => !a.has(key(f))),
    removed_facilities: left.facilities.filter((f) => !b.has(key(f))),
    warnings: [
      "Comparison of published build-time solves; no live optimisation runs on GitHub Pages.",
    ],
  };
}
export async function staticRequest<T>(
  path: string,
  method: string,
  body: unknown,
): Promise<T> {
  if (path === "/auth/me" && method === "GET")
    return { user: null, csrf_token: "published-viewer" } as T;
  const data = await publication();
  const run = data.runs.find(
    (r) => path === `/runs/${r.id}` || path === `/runs/${r.id}/explain`,
  );
  let result: unknown;
  if (method === "GET" && path === "/locations") result = data.locations;
  else if (method === "GET" && path === "/candidates") result = data.candidates;
  else if (method === "GET" && path === "/runs") result = data.runs;
  else if (method === "GET" && run) result = run;
  else if (method === "POST" && run && path.endsWith("/explain"))
    result = data.explanations[run.id];
  else if (method === "POST" && path === "/compare") {
    const ids = body as { left_run_id: string; right_run_id: string };
    const left = data.runs.find((r) => r.id === ids.left_run_id),
      right = data.runs.find((r) => r.id === ids.right_run_id);
    if (!left || !right) throw new Error("Choose two published runs.");
    result = comparePublished(left, right);
  } else
    throw new Error(
      "This published demo is read-only. Live solves and account saves require the Python backend.",
    );
  return result as T;
}
export async function staticDownload(id: string, format: "json" | "csv") {
  const run = (await publication()).runs.find((r) => r.id === id);
  if (!run) throw new Error("Published run not found.");
  let text = JSON.stringify(run, null, 2);
  if (format === "csv") {
    const rows: Record<string, unknown>[] = [
      ...run.facilities.map((f) => ({ record_type: "facility", ...f })),
      ...run.flows.map((f) => ({ record_type: "flow", ...f })),
      {
        record_type: "assumptions",
        scenario_inputs: JSON.stringify(run.input_snapshot),
        warnings: run.warnings.join("; "),
      },
    ];
    const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const cell = (value: unknown) => {
      let s = String(value ?? "");
      if (typeof value === "string" && /^[=+@-]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
    text = [
      columns.map(cell).join(","),
      ...rows.map((r) => columns.map((c) => cell(r[c])).join(",")),
    ].join("\r\n");
  }
  const url = URL.createObjectURL(
    new Blob([text], {
      type: format === "json" ? "application/json" : "text/csv",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `saf-command-${id}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
