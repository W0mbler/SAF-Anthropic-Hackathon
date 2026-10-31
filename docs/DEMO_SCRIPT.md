# SAF Command demo

## Two-minute public Pages walkthrough

Open https://w0mbler.github.io/SAF-Anthropic-Hackathon/. This public script uses published results, not live Python actions.

0:00–0:20 — Introduce the 80 locations, 6,800 kt available biomass and four airports. Explain that the free demo shows genuine solver results generated during publication.

0:20–0:40 — Open Supply Atlas, filter a province and inspect a source record. Mention that reference coordinates are not permitted construction sites.

0:40–1:00 — Open Scenarios and choose the baseline. At 20% assumed yield, 210 kt SAF needs 1,050 kt biomass. Inspect facilities and a flow tab. Read the actual cost and gap.

1:00–1:25 — Choose higher demand (260 kt SAF / 1,300 kt biomass), open Compare and compare it with the baseline. Describe actual differences without inventing savings.

1:25–1:45 — Show cost breakdown, explanation and JSON/CSV downloads. Connections are straight-line proxies, not verified roads.

1:45–2:00 — Explain that Docker adds editable inputs, live Python solves, accounts and PostgreSQL history. Measured demand, process economics, roads and site diligence are next steps.

The prepared video is captioned and silent. This script can be recorded as narration if the event requires audio.

## Separate full-application walkthrough (Docker only)

1. Open the Command Centre. Point out that the source dataset has 80 biomass locations and 6,800 kt available supply. The four destination airports are PNK, PKN, BPN and TRK.
2. Open Scenario Studio. Keep the clearly labelled illustrative baseline demands (60/30/90/30 kt SAF) and 20% yield. Click **Optimise Network** and wait for the actual server result.
3. Inspect the selected refinery and depots. Show input throughput, capacity and utilisation; 210 kt SAF requires 1,050 kt biomass under this mass-yield assumption. Read the actual run's status, gap and cost rather than quoting a predetermined facility count.
4. Switch to the higher-demand preset (70/40/110/40 kt), give it a distinct scenario name, and solve. Compare the two saved runs to see actual capacity and cost differences.
5. Generate the deterministic explanation and download the JSON or CSV. State that displayed connections are straight-line proxies, not verified roads, and default demands/yield are illustrative.

## Five-minute full-application walkthrough (Docker only)

Add these steps to the two-minute flow:

- In Supply Atlas, filter a province, click a source, and inspect the original identifier, location, district and available biomass.
- Toggle source, airport, facility and flow layers. Inspect each of farm→depot, depot→refinery and refinery→airport flows, distinguishing biomass kt from finished SAF kt.
- Exclude a selected candidate site and rerun. The new solve must choose another permitted candidate or report infeasibility. Inspect the immutable earlier run to show it did not change.
- Change the finance horizon, discount rate, or annual fixed refinery OpEx and rerun. Explain the objective as upfront capital plus discounted annual recurring cost.
- Register an account, save a named scenario, log out and return as a guest. Account data should not be visible in the guest session.
- Show an impossible demand scenario and its truthful infeasible state. No invented solution appears.

## Questions to expect

**Is this an AI-generated network?** No. SciPy/HiGHS solves a defined mixed-integer linear program. Optional AI only explains validated result facts and is disabled unless explicitly requested/configured.

**Are the routes drivable?** Not established. Haversine great-circle connections are cost proxies. Verified road/river routing and site diligence are separate work.

**Why these sites?** Candidates are reproducibly screened observed biomass coordinates: 13 depot and eight refinery candidates. The solve is limited to that candidate set.

**What does the MIP gap mean?** It measures the gap between the incumbent objective and the solver's bound. A time-limited feasible incumbent is labelled accordingly; a 2% tolerance is not proof of an exact optimum.

**Is there a business saving or emissions claim?** No. Such claims require a defined solved baseline, calibrated costs and certified lifecycle data. Demand, yield, and some financial inputs here are illustrative.

**Can everyone inspect my saved scenario?** The Pages site publishes only the three shared demo scenarios and has no accounts. In the full application, account and guest sessions are independently owner-scoped by the server, including exports and comparisons.

**Does this use Claude/Anthropic?** No such integration is implemented or claimed. The solver is SciPy/HiGHS; optional provider functionality in the full app is an OpenAI caveat selector.
