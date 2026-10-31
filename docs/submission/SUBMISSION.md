# SAF COMMAND — submission copy

## Project links

- Public demonstration: https://w0mbler.github.io/SAF-Anthropic-Hackathon/
- Source: https://github.com/W0mbler/SAF-Anthropic-Hackathon
- [Verification record](../VALIDATION.md) and [data provenance](../../data/DATA_PROVENANCE.md)

## Tagline

From biomass to boarding gates. Every decision optimised.

## Short description

SAF Command is a geographic decision cockpit for sustainable aviation fuel infrastructure in Kalimantan. It combines 80 biomass locations with four airport destinations and a real mixed-integer optimisation model to jointly select depot and refinery sites, facility sizes, and material flows. Users can inspect allocations, capacities, costs, assumptions, and solver gaps, then compare scenarios and export results. The free public demo presents three genuine solver-generated scenarios. The full Docker application adds live Python solves, scenario editing, accounts, and PostgreSQL persistence. Demand and conversion yield are illustrative; distances and candidate sites require real-world validation.

## Inspiration

Dispersed biomass creates a coordination problem: feedstock availability, depot placement, refinery capacity, transport, and airport requirements must work together. SAF Command makes those decisions inspectable in one geographic workspace, with explicit assumptions and traceable mathematical outputs.

## What it does

The model covers 80 supplied biomass records, totaling 6,800 kt available feedstock, and exactly four airports: Supadio (PNK), Iskandar (PKN), Sultan Aji Muhamad Sulaiman (BPN), and Juwata (TRK). It screens 13 depot and eight refinery candidates from observed coordinates, then jointly chooses small/large facilities and flows across farm → depot → refinery → airport.

The objective combines facility capital expenditure with discounted recurring transport and user-specified fixed refinery operating costs. Source availability, capacity, exclusive facility size, mass conservation, conversion yield, and airport deliveries constrain every solution. Results retain status, actual MIP gap, cost decomposition, coordinates, flows, assumptions, and input provenance.

The public GitHub Pages demonstration includes an interactive atlas, three published scenarios, facility and flow tables, comparisons, deterministic explanations, and JSON/CSV downloads. Python calculates the results during publication; the browser does not execute the solver. The full Docker application provides editable scenarios, live solves, authentication, and database-backed history.

## How it was built

- Next.js, React, TypeScript and MapLibre provide the responsive interface, with an SVG map fallback.
- Python, FastAPI, Pydantic, NumPy, pandas and SciPy/HiGHS implement the API, data validation and mixed-integer model.
- SQLAlchemy, Alembic and PostgreSQL persist scenarios, immutable runs, facilities, flows and account/session records.
- Argon2 hashing, owner-scoped resources, CSRF checks, secure production cookies, bounded solves and rate limits support the account workflow.
- Docker Compose packages the full stack. GitHub Actions tests it and separately publishes the static demonstration.

The optimisation and numerical explanation are deterministic software. An optional server-side OpenAI integration can prioritise predefined caveats; it does not calculate facility decisions or rewrite solver numbers. The public demo needs no AI credentials. Development used OpenAI Codex assistance. No Claude or Anthropic API integration is claimed.

## Challenges addressed

Maintaining consistent units was central: refinery-to-airport flows represent finished SAF, while earlier stages carry biomass. Independent checks recompute mass balances and capacity constraints. The interface distinguishes a feasible incumbent from an exact optimum and reports the real solver gap. The free hosting constraint was addressed through published results and explicit capability notices, without pretending to execute Python in the browser.

## Accomplishments

- A real MILP with independently checked supply, mass, capacity and cost arithmetic.
- A deployed demonstration requiring no account, paid map service or AI key.
- A runnable full-stack implementation with live solves, accounts, immutable results, comparisons and exports.
- Passing backend, frontend, browser, deployment-adapter and hosted CI checks, with scope documented.

## What we learned

A useful planning interface makes assumptions as visible as recommendations. Yield, demand, candidate screening, distance approximations, financial horizon and missing processing costs can materially change a network. Showing them alongside flows, costs and the MIP gap makes the output easier to question and reproduce.

## Next steps

Validate measured demand and yields; add legally eligible sites and verified road/river distances; calibrate production costs, seasonality and storage; and evaluate sustainability with suitable lifecycle and certification data. Further hosting work would expose the full Python service online while retaining the public demonstration.

## Judge-facing limitations

This is an illustrative planning model. Demand, yield and financial defaults are assumptions. Connections are straight-line distance proxies; candidate coordinates are not permitted construction sites. Unknown production costs, lifecycle emissions and fuel certification are outside the current model. No verified savings, emissions reduction, investment recommendation or exact global optimum is claimed. Source code is MIT-licensed; that licence does not cover supplied datasets.
