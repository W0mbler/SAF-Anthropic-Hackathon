import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
const require = createRequire(import.meta.url);
const { chromium } = require("../../e2e/node_modules/@playwright/test");
const root = resolve(new URL("../../", import.meta.url).pathname),
  out = join(root, "docs/submission");
const dataset = JSON.parse(
  await readFile(join(root, "apps/web/public/demo/data.json"), "utf8"),
);
const baseline = dataset.runs.find((r) => r.id === "published-baseline");
const site = "https://w0mbler.github.io/SAF-Anthropic-Hackathon/";
const repo = "https://github.com/W0mbler/SAF-Anthropic-Hackathon";
const style = `*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#dfeef4;background:#08141d}h1,h2,h3,p{margin-top:0}h1{font-size:44px;letter-spacing:-1.5px}h2{font-size:28px}p,li{line-height:1.5;color:#aac1cb}strong{color:#eaf5f8}a{color:#5de0b4;overflow-wrap:anywhere}.eyebrow{font-size:11px;letter-spacing:2px;color:#5de0b4;text-transform:uppercase}.green{color:#5de0b4}.muted{font-size:11px;color:#8ca8b8}.metrics{display:flex;gap:12px;margin:20px 0}.metric{flex:1;background:#112631;border:1px solid #234250;padding:14px;border-radius:8px}.metric b{display:block;color:#5de0b4;font-size:26px}.metric span{font-size:11px;color:#b3c9d2}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.panel{background:#10222d;border:1px solid #26424f;padding:20px;border-radius:10px}img{max-width:100%;border:1px solid #26424f;border-radius:8px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:8px;border-bottom:1px solid #26424f}footer{font-size:10px;color:#8ca8b8;margin-top:18px}.flow{display:flex;align-items:center;gap:12px;margin:28px 0}.flow b{padding:18px;background:#14352f;border:1px solid #35785f;border-radius:8px;flex:1;text-align:center}.flow span{color:#5de0b4}ul{padding-left:20px}`;
const one = `<!doctype html><html><head><meta charset="utf-8"><title>SAF Command — submission brief</title><style>${style}@page{size:A4;margin:0}.brief{padding:34px 38px;font-size:12px;min-height:1122px}h1{font-size:36px;margin:8px 0}h2{font-size:17px;margin:14px 0 8px}.hero{width:100%;height:204px;object-fit:cover;object-position:top}.metrics{margin:14px 0}.metric{padding:10px}.metric b{font-size:22px}.grid{gap:20px}.callout{padding:12px;border-left:3px solid #5de0b4;background:#10222d;margin:12px 0}</style></head><body><main class="brief"><div class="eyebrow">Hackathon project brief · 31 October 2026</div><h1>SAF <span class="green">COMMAND</span></h1><p>From biomass to boarding gates. Every decision optimised.</p><img class="hero" src="screenshots/01-overview.png"><div class="metrics"><div class="metric"><b>80</b><span>biomass locations</span></div><div class="metric"><b>6,800 kt</b><span>available biomass</span></div><div class="metric"><b>4</b><span>airport destinations</span></div></div><div class="grid"><section><h2>The planning problem</h2><p>Dispersed biomass, facility investment and airport supply must be coordinated. SAF Command jointly selects depot/refinery sites, sizes and three-stage material flows across Kalimantan.</p><h2>The implementation</h2><p>Next.js and MapLibre interface; FastAPI; SciPy/HiGHS MILP; PostgreSQL, SQLAlchemy and Alembic; Docker and GitHub Actions. Constraints enforce source supply, capacity, mass yield and exact airport deliveries.</p><h2>Inspectable evidence</h2><p>Costs, capacities, flows, input snapshots, provenance and actual solver gaps. Independent checks cover the mathematical constraints, accounts, ownership and exports.</p></section><section><h2>What judges can use now</h2><p>The free public site provides the atlas, three genuine build-time solves, comparisons, explanations and JSON/CSV downloads. No signup or AI key is required.</p><h2>What requires Docker</h2><p>Editable assumptions, live Python optimisation, accounts and database-backed scenario history are implemented in the full application. They are not hosted on GitHub Pages.</p><h2>Model limits</h2><p>Demands/yield are illustrative. Routes are straight-line proxies; sites need permitting/engineering checks. Unknown operating economics and lifecycle emissions remain outside the model.</p></section></div><div class="callout"><strong>Demo:</strong> <a href="${site}">${site}</a><br><strong>Code:</strong> <a href="${repo}">${repo}</a></div><footer>MIT applies to new source only; supplied data rights require separate verification. No Claude/Anthropic integration is claimed. Development used OpenAI Codex assistance. Screenshots show the locally served Pages export; numerical results come from real solver runs.</footer></main></body></html>`;
const slides = [
  `<div class="eyebrow">Sustainable aviation fuel · Kalimantan</div><h1>From biomass.<br><span class="green">To boarding gates.</span></h1><p class="lead">SAF Command makes infrastructure decisions inspectable.</p><div class="metrics"><div class="metric"><b>80</b><span>supplied locations</span></div><div class="metric"><b>6,800 kt</b><span>available biomass</span></div><div class="metric"><b>4 airports</b><span>PNK · PKN · BPN · TRK</span></div></div><p>Joint site selection, facility sizing and material flows.</p>`,
  `<div class="eyebrow">01 · Problem</div><h1>One connected<br><span class="green">planning decision.</span></h1><div class="grid"><div><h2>Dispersed supply</h2><p>Feedstock quantity and geography affect transport, facility placement and capacity needs.</p><h2>Coupled investments</h2><p>Depots and refineries must serve airport demand while respecting supply and mass conversion.</p></div><div class="panel"><h2>Transparent scope</h2><p>13 screened depot candidates<br>8 screened refinery candidates<br>2 facility sizes per site<br>3 material-flow stages</p><p class="muted">Candidate coordinates are observed reference locations, not permitted construction land.</p></div></div>`,
  `<div class="eyebrow">02 · Method</div><h1>A real <span class="green">mixed-integer model.</span></h1><div class="flow"><b>Biomass sources</b><span>→</span><b>Depots</b><span>→</span><b>Refineries</b><span>→</span><b>Airports</b></div><div class="grid"><div class="panel"><h2>Objective</h2><p>Facility CapEx + discounted recurring transport and configured processing costs.</p></div><div class="panel"><h2>Constraints</h2><p>Supply, capacities, exclusive sizes, mass conservation, conversion yield and exact airport deliveries.</p></div></div><p>SciPy / HiGHS chooses facilities and quantities. Status, gap and assumptions remain visible.</p>`,
  `<div class="eyebrow">03 · Evidence</div><h1>Inspect the <span class="green">calculated network.</span></h1><div class="grid"><div><img src="screenshots/02-network.png"><p class="muted">Actual static-export interface; published solver data.</p></div><div><h2>Illustrative baseline</h2><p>210 kt SAF demand<br>20% assumed mass yield<br>1,050 kt biomass input</p><div class="panel"><strong>US$${(baseline.objective_usd / 1e6).toFixed(2)}M</strong><p>Modelled one-period objective<br>${(baseline.relative_gap * 100).toFixed(2)}% actual relative MIP gap</p></div><p class="muted">This example is not a verified investment budget or an exact global optimum. Costs can vary with solver termination within tolerance.</p></div></div>`,
  `<div class="eyebrow">04 · Scenario comparison</div><h1>Change demand.<br><span class="green">Inspect the consequences.</span></h1><div class="grid"><div><p class="lead">210 → 260 kt SAF</p><p>Compare actual facility choices and modelled costs. Trace quantities and export the inputs and result records.</p><p>Available biomass is a capacity limit; it does not need to be fully consumed.</p><p class="muted">The free Pages demonstration compares precomputed scenarios. Editable reruns are in the full Python application.</p></div><img src="screenshots/03-comparison.png"></div>`,
  `<div class="eyebrow">05 · Delivery and next steps</div><h1>Ready to inspect.<br><span class="green">Ready to reproduce.</span></h1><div class="grid"><div><h2>Public demo</h2><p>Atlas · published networks · comparison · explanations · downloads</p><h2>Full application</h2><p>Live Python solves · editable scenarios · accounts · PostgreSQL history</p><p><a href="${site}">${site}</a></p></div><div class="panel"><h2>Validation</h2><p>70 backend tests<br>11 frontend tests<br>34 deployment-adapter tests<br>3 full-stack browser journeys<br>Separate static-only browser check<br>Hosted CI and Pages publication passed</p><p class="muted">These checks ran in their documented environments, not as a single combined suite.</p></div></div><footer>Next: measured demand, verified routes, permitted sites, process economics and lifecycle evidence. Data licences remain separate from source-code MIT. No Claude/Anthropic integration claimed.</footer>`,
];
const deck = `<!doctype html><html><head><meta charset="utf-8"><title>SAF Command — pitch</title><style>${style}@page{size:13.333333in 7.5in;margin:0}.slide{width:1280px;height:720px;padding:54px 70px;page-break-after:always;overflow:hidden;position:relative}.slide:last-child{page-break-after:auto}.slide h1{font-size:52px;margin:18px 0 26px}.slide h2{font-size:25px}.slide p{font-size:20px}.slide .muted,.slide footer{font-size:13px}.slide .lead{font-size:30px;color:#e4f4f4}.slide img{width:100%;height:330px;object-fit:contain;background:#08141d}.page-number{position:absolute;right:40px;bottom:22px;color:#7293a4;font-size:12px}.slide footer{margin-top:12px}</style></head><body>${slides.map((s, i) => `<section class="slide">${s}<div class="page-number">SAF COMMAND · ${i + 1}/6</div></section>`).join("")}</body></html>`;
await writeFile(join(out, "ONE_PAGE_BRIEF.html"), one);
await writeFile(join(out, "PITCH_DECK.html"), deck);
const cover = `<!doctype html><html><head><meta charset="utf-8"><style>${style}body{width:1600px;height:900px;overflow:hidden;background:radial-gradient(ellipse at 75% 30%,#143a38,#08141d 65%)}.cover{height:900px;padding:70px 74px;display:grid;grid-template-columns:560px 1fr;gap:60px;align-items:center}.cover h1{font-size:76px;line-height:1.02;margin:22px 0}.cover p{font-size:27px}.cover img{width:100%;height:610px;object-fit:cover;object-position:top;box-shadow:0 16px 60px #0008}.cover .metric{padding:17px 10px}.cover .metric b{font-size:26px}.cover .metric span{font-size:12px}.cover footer{font-size:16px;line-height:1.5}</style></head><body><div class="cover"><section><div class="eyebrow">Autonomous SG 2026 · project submission</div><h1>SAF<br><span class="green">COMMAND</span></h1><p>From biomass<br>to boarding gates.</p><div class="metrics"><div class="metric"><b>80</b><span>source locations</span></div><div class="metric"><b>6,800 kt</b><span>available biomass</span></div><div class="metric"><b>4</b><span>airports</span></div></div><footer>Geographic supply-chain planning<br>Real MILP results · transparent assumptions<br><span class="green">Free interactive published demonstration</span></footer></section><img src="screenshots/02-network.png" alt="Actual published scenario interface"></div></body></html>`;
await writeFile(join(out, "COVER.html"), cover);
const server = spawn(
  "python3",
  ["-m", "http.server", "3004", "--bind", "127.0.0.1", "--directory", out],
  { stdio: "ignore" },
);
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch("http://127.0.0.1:3004/ONE_PAGE_BRIEF.html")).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  for (const [name, target] of [
    ["ONE_PAGE_BRIEF", "SAF-Command-Brief.pdf"],
    ["PITCH_DECK", "SAF-Command-Pitch.pdf"],
  ]) {
    await page.goto("http://127.0.0.1:3004/" + name + ".html");
    await page.evaluate(() =>
      Promise.all([...document.images].map((i) => i.decode())),
    );
    await page.pdf({
      path: join(out, target),
      printBackground: true,
      preferCSSPageSize: true,
    });
    if (name === "ONE_PAGE_BRIEF")
      await page.screenshot({
        path: join(out, "brief-preview.png"),
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("http://127.0.0.1:3004/COVER.html");
  await page.evaluate(() =>
    Promise.all([...document.images].map((i) => i.decode())),
  );
  await page.screenshot({ path: join(out, "cover.png") });
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
console.log("Submission brief and six-slide pitch PDFs generated.");
