import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, symlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
const require = createRequire(import.meta.url);
const { chromium } = require("../../e2e/node_modules/@playwright/test");
const root = resolve(new URL("../../", import.meta.url).pathname);
const output = join(root, "docs/submission");
await mkdir(join(output, "screenshots"), { recursive: true });
const temp = await mkdtemp(join(tmpdir(), "saf-submission-"));
await symlink(
  join(root, "apps/web/out"),
  join(temp, "SAF-Anthropic-Hackathon"),
  "dir",
);
const server = spawn(
  "python3",
  ["-m", "http.server", "3003", "--bind", "127.0.0.1", "--directory", temp],
  { stdio: "ignore" },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const base = "http://127.0.0.1:3003/SAF-Anthropic-Hackathon";
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + "/")).ok) break;
    } catch {}
    await pause(200);
  }
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const failures = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(base + "/");
  await page.getByTestId("source-count").filter({ hasText: "80" }).waitFor();
  await page.screenshot({ path: join(output, "screenshots/01-overview.png") });
  await page
    .locator(".map-panel,.panel")
    .filter({ has: page.getByTestId("published-scenario") })
    .first()
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await page.getByTestId("published-scenario").selectOption("published-higher");
  await page.screenshot({ path: join(output, "screenshots/02-network.png") });
  await page.goto(base + "/compare/");
  await page.getByTestId("compare-left").selectOption("published-baseline");
  await page.getByTestId("compare-right").selectOption("published-higher");
  await page.getByTestId("compare-submit").click();
  await page.getByTestId("compare-result").waitFor();
  await page.screenshot({
    path: join(output, "screenshots/03-comparison.png"),
  });
  await page.goto(base + "/atlas/");
  await page
    .getByRole("combobox", { name: /Province/ })
    .selectOption("North Kalimantan");
  await page.screenshot({ path: join(output, "screenshots/04-atlas.png") });
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-framerate",
      "5",
      "-i",
      "pipe:0",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      join(output, "demo-captioned.mp4"),
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  let recording = true;
  const recordingLoop = (async () => {
    while (recording) {
      const started = Date.now();
      try {
        const data = await page.screenshot({ type: "jpeg", quality: 72 });
        if (!ffmpeg.stdin.write(data)) await once(ffmpeg.stdin, "drain");
      } catch {}
      await pause(Math.max(0, 200 - (Date.now() - started)));
    }
  })();
  async function caption(text) {
    await page.evaluate((text) => {
      let d = document.getElementById("demo-caption");
      if (!d) {
        d = document.createElement("div");
        d.id = "demo-caption";
        d.style.cssText =
          "position:fixed;bottom:16px;left:24px;right:24px;z-index:99999;padding:14px 20px;background:#07151ff2;border:1px solid #4fddb3;border-radius:8px;color:#fff;font:18px/1.45 Arial;box-shadow:0 4px 20px #0008;pointer-events:none";
        document.body.append(d);
      }
      d.textContent = "DEMO GUIDE · " + text;
    }, text);
  }
  await page.goto(base + "/");
  await caption(
    "SAF Command: 80 supply locations, 6,800 kt available biomass, four airports.",
  );
  await pause(9000);
  await caption(
    "Free Pages demonstration: genuine results computed at build time. Live Python solves are in the full Docker app.",
  );
  await pause(9000);
  await page.goto(base + "/atlas/");
  await page.getByTestId("source-count").filter({ hasText: "80" }).waitFor();
  await caption(
    "Inspect the source atlas. Demand, yield and candidate-site feasibility are modelling assumptions.",
  );
  await pause(8000);
  await page
    .getByRole("combobox", { name: /Province/ })
    .selectOption("North Kalimantan");
  await caption(
    "Filter original source records by province and district; inspect their quantities and coordinates.",
  );
  await pause(8000);
  await page.goto(base + "/optimize/");
  await page
    .getByTestId("published-scenario")
    .selectOption("published-baseline");
  await page.getByTestId("published-scenario").scrollIntoViewIfNeeded();
  await caption(
    "Baseline: 210 kt illustrative SAF demand at 20% yield requires 1,050 kt biomass.",
  );
  await pause(10000);
  await page.getByTestId("facilities-table").scrollIntoViewIfNeeded();
  await caption(
    "Inspect selected sites, sizes, capacities and utilisation. The displayed MIP gap describes the solver result.",
  );
  await pause(10000);
  await page.getByRole("tab", { name: "Cost breakdown", exact: true }).click();
  await caption(
    "Cost combines upfront facilities and discounted recurring transport/processing costs. Unknown production OpEx defaults to zero.",
  );
  await pause(9000);
  await page.getByTestId("published-scenario").selectOption("published-higher");
  await page.getByTestId("published-scenario").scrollIntoViewIfNeeded();
  await caption(
    "Higher demand: 260 kt SAF needs 1,300 kt biomass. Inspect the separately solved network.",
  );
  await pause(9000);
  await page.goto(base + "/compare/");
  await page.getByTestId("compare-left").selectOption("published-baseline");
  await page.getByTestId("compare-right").selectOption("published-higher");
  await page.getByTestId("compare-submit").click();
  await page.getByTestId("compare-result").waitFor();
  await caption(
    "Compare genuine solver records: costs, capacity choices and changed facility locations. No unverified savings claim.",
  );
  await pause(11000);
  await page.goto(base + "/optimize/");
  await page.getByRole("button", { name: "Explain this network" }).click();
  await page.locator(".explanation-text").scrollIntoViewIfNeeded();
  await caption(
    "Deterministic explanations use solver facts. JSON and CSV downloads preserve inputs, flows and caveats.",
  );
  await pause(11000);
  await page.goto(base + "/");
  await caption(
    "Next: measured demand, verified road/river routes, permitted sites and calibrated process economics. Source and full Python app are on GitHub.",
  );
  await pause(10000);
  recording = false;
  await recordingLoop;
  ffmpeg.stdin.end();
  const [code] = await once(ffmpeg, "close");
  if (code !== 0) throw new Error("Video encoder failed");
  await writeFile(
    join(output, "capture-metadata.json"),
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        source:
          "Locally served GitHub Pages static export; not a recording of the live domain",
        video:
          "Captioned silent browser walkthrough; real interactions, no live solver is simulated",
        resolution: "1280x720",
        http_failures: failures,
      },
      null,
      2,
    ),
  );
  if (failures.length) throw new Error("Asset requests failed");
  console.log("Screenshots and captioned silent demo captured.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  await rm(temp, { recursive: true, force: true });
}
