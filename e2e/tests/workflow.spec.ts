import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

type Run = {
  id: string;
  feasible: boolean;
  objective_usd: number;
  input_snapshot: { demand: Record<string, number>; conversion_yield: number };
  facilities: Array<{ facility_type: string; throughput_input_kt: number }>;
  flows: Array<{ stage: string; to_node_id: string; quantity_kt: number }>;
};

async function optimise(page: Page): Promise<Run> {
  const finished = page.waitForResponse(
    (response) => response.request().method() === "POST"
      && /\/api\/v1\/scenarios\/[^/]+\/solve$/.test(new URL(response.url()).pathname),
    { timeout: 90_000 },
  );
  await page.getByTestId("optimise-network").click();
  const response = await finished;
  expect(response.ok(), await response.text()).toBeTruthy();
  const run: Run = await response.json();
  expect(run.feasible).toBe(true);
  expect(run.objective_usd).toBeGreaterThan(0);
  await expect(page.getByTestId("total-cost")).toBeVisible();
  await expect(page.getByTestId("facilities-table")).toBeVisible();
  await expect(page.getByTestId("solution-status")).not.toContainText(/infeasible|failed|ready to optimise/i);
  return run;
}

function checkDeliveries(run: Run, expectedDemand: Record<string, number>) {
  expect(new Set(run.flows.map((flow) => flow.stage))).toEqual(
    new Set(["farm_depot", "depot_refinery", "refinery_airport"]),
  );
  for (const [airport, demand] of Object.entries(expectedDemand)) {
    const delivered = run.flows
      .filter((flow) => flow.stage === "refinery_airport" && flow.to_node_id === airport)
      .reduce((total, flow) => total + flow.quantity_kt, 0);
    expect(delivered).toBeCloseTo(demand, 4);
  }
  const biomass = run.facilities
    .filter((facility) => facility.facility_type === "refinery")
    .reduce((total, facility) => total + facility.throughput_input_kt, 0);
  expect(biomass * run.input_snapshot.conversion_yield).toBeCloseTo(
    Object.values(expectedDemand).reduce((total, demand) => total + demand, 0), 4,
  );
}

test("guest solves real baseline and higher-demand networks, compares and exports", async ({ page }) => {
  await page.goto("/optimize");
  await expect(page.getByTestId("source-count")).toContainText("80");
  await expect(page.getByTestId("airport-count")).toContainText("4");
  await expect(page.getByTestId("demand-PNK")).toHaveValue("60");
  await page.getByTestId("scenario-name").fill("Browser baseline");
  const baseline = await optimise(page);
  checkDeliveries(baseline, { PNK: 60, PKN: 30, BPN: 90, TRK: 30 });

  await page.getByTestId("demand-preset-higher").click();
  await expect(page.getByTestId("demand-PNK")).toHaveValue("70");
  await page.getByTestId("scenario-name").fill("Browser higher demand");
  const higher = await optimise(page);
  checkDeliveries(higher, { PNK: 70, PKN: 40, BPN: 110, TRK: 40 });
  expect(higher.id).not.toBe(baseline.id);
  expect(higher.objective_usd).toBeGreaterThan(baseline.objective_usd);
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.screenshot({
      path: resolve(__dirname, "../../docs/screenshots/optimized-network.png"),
      fullPage: true,
    });
  }

  const downloadReady = page.waitForEvent("download");
  await page.getByTestId("export-json").click();
  const download = await downloadReady;
  expect(await download.failure()).toBeNull();
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const exported = JSON.parse(await readFile(downloadedPath!, "utf8"));
  expect(exported.id).toBe(higher.id);
  expect(exported.objective_usd).toBeCloseTo(higher.objective_usd, 4);

  await page.goto("/compare");
  await page.getByTestId("compare-left").selectOption(baseline.id);
  await page.getByTestId("compare-right").selectOption(higher.id);
  const comparisonReady = page.waitForResponse(
    (response) => response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/v1/compare",
  );
  await page.getByTestId("compare-submit").click();
  const comparison = await comparisonReady;
  expect(comparison.ok()).toBeTruthy();
  const compared = await comparison.json();
  expect(compared.delta.objective_usd).toBeCloseTo(higher.objective_usd - baseline.objective_usd, 4);
  await expect(page.getByTestId("compare-result")).toBeVisible();
});

test("account forms register and restore a private account session", async ({ page }) => {
  const email = `browser-${Date.now()}@example.test`;
  const password = "A-real-demo-password-48!";
  let firstSession = true;
  await page.route("**/api/v1/auth/me", async (route) => {
    if (firstSession) {
      firstSession = false;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    await route.continue();
  });
  const discovered = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/v1/auth/me",
  );
  await page.goto("/register");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password/i).fill(password);
  const name = page.getByLabel(/display name|your name|^name$/i);
  if (await name.count()) await name.fill("Browser tester");
  await discovered;
  await expect(page.getByLabel(/email/i)).toHaveValue(email);
  await expect(page.getByLabel(/^password/i)).toHaveValue(password);
  const registered = page.waitForResponse(
    (response) => response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/v1/auth/register",
  );
  await page.getByRole("button", { name: /create account|register/i }).click();
  expect((await registered).ok()).toBeTruthy();
  await expect(page.getByRole("button", { name: /log out|logout|sign out/i })).toBeVisible();
  await page.getByRole("button", { name: /log out|logout|sign out/i }).click();
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password/i).fill(password);
  const loggedIn = page.waitForResponse(
    (response) => response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/v1/auth/login",
  );
  await page.getByRole("button", { name: /log in|login|sign in/i }).click();
  expect((await loggedIn).ok()).toBeTruthy();
  await expect(page.getByRole("button", { name: /log out|logout|sign out/i })).toBeVisible();
});

test("mobile supply atlas filters real records and opens geographic details", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/atlas");
  await expect(page.getByTestId("source-count")).toHaveText("80");
  await expect(page.getByTestId("airport-count")).toHaveText("4");
  await page.getByRole("combobox", { name: /Province/ }).selectOption("North Kalimantan");
  await expect(page.getByTestId("source-count")).toHaveText("2");
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(2);
  await page.getByText("Inspect network points as a list", { exact: true }).click();
  await page.getByRole("button", { name: /KAL_SUP_18 ·/ }).click();
  await expect(page.getByRole("region", { name: "Selected map feature" })).toContainText("North Kalimantan");
  await page.getByRole("button", { name: "Close map details" }).click();
  await expect(page.getByRole("region", { name: "Selected map feature" })).toHaveCount(0);
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(horizontalOverflow).toBe(false);
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.screenshot({
      path: resolve(__dirname, "../../docs/screenshots/atlas-mobile.png"),
      fullPage: true,
    });
  }
});
