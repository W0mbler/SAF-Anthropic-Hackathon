# SAF Command demo

## Two-minute walkthrough

1. Open the Command Centre. Point out that the source dataset has 80 biomass locations and 6,800 kt available supply. The four destination airports are PNK, PKN, BPN and TRK.
2. Open Scenario Studio. Keep the clearly labelled illustrative baseline demands (60/30/90/30 kt SAF) and 20% yield. Click **Optimise Network** and wait for the actual server result.
3. Inspect the selected refinery and depots. Show input throughput, capacity and utilisation; 210 kt SAF requires 1,050 kt biomass under this mass-yield assumption. Read the actual run's status, gap and cost rather than quoting a predetermined facility count.
4. Switch to the higher-demand preset (70/40/110/40 kt), give it a distinct scenario name, and solve. Compare the two saved runs to see actual capacity and cost differences.
5. Generate the deterministic explanation and download the JSON or CSV. State that displayed connections are straight-line proxies, not verified roads, and default demands/yield are illustrative.

## Five-minute walkthrough

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

**Can everyone inspect my saved scenario?** No. Account and guest sessions are independently owner-scoped by the server, including run exports and comparisons.
