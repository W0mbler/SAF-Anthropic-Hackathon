# Judge quick start

Open **https://w0mbler.github.io/SAF-Anthropic-Hackathon/**. No registration or installation is required.

1. Read the published-demo notice: the Python solver generated these networks during the site build.
2. Inspect the baseline. Its 210 kt illustrative SAF demand at 20% yield requires 1,050 kt biomass input. Read its displayed cost, facilities and gap.
3. Choose **Illustrative higher demand · 260 kt SAF** in **Published scenario**. Inspect facilities and all three flow tabs. Required biomass is 1,300 kt at the same yield.
4. Open **Compare**, select baseline and higher demand, and click **Compare networks**. Deltas come from the actual published records.
5. Open **Supply Atlas**, filter a province and inspect a source. The dataset has 80 locations and 6,800 kt available supply; supply need not all be consumed.
6. Return to a scenario, click **Explain this network**, and download **JSON** or **CSV report**. Exports retain inputs, results and caveats.

## Available where

| Capability | Public Pages site | Full Docker application |
| --- | --- | --- |
| Atlas, map inspection, published results | Yes | Yes |
| Compare/export actual results | Three published scenarios | Owned saved runs |
| Deterministic explanation | Yes | Yes |
| Edit assumptions and run Python optimisation | No | Yes |
| Accounts and database history | No | Yes |
| Optional provider caveat prioritisation | No | Configurable, opt-in |

## Full application

With Docker Engine and Compose installed, run from the repository root:

```bash
cp .env.example .env && docker compose up --build
```

Website: port 3000. Python API: port 8000. PostgreSQL remains internal to Compose. Guest mode needs no AI key or pre-existing account. See the root README for configuration.

## Evidence

- [Hosted application CI passed](https://github.com/W0mbler/SAF-Anthropic-Hackathon/actions/runs/41172546289).
- [Hosted Pages publication and site check passed](https://github.com/W0mbler/SAF-Anthropic-Hackathon/actions/runs/41172546379).
- [Validation record](../VALIDATION.md): 70 backend tests, 11 frontend tests, 34 deployment-adapter tests, three full-stack browser journeys and a separate static browser check. These ran in their documented environments; they are not presented as one combined suite.

## Questions

**Does the public site run Python?** No. Python produces its results in GitHub Actions. The Docker application runs the API live.

**Does AI choose facilities?** No. SciPy/HiGHS solves the MILP. Numerical narratives are deterministic; optional AI only prioritises predefined caveats in the full server application.

**Are routes and sites feasible in reality?** Not established. They require road, land, engineering and permitting diligence.

**What does a nonzero gap mean?** The feasible incumbent has not been proven equal to the solver's global bound. The interface reports the gap rather than claiming an exact optimum.

**What is the innovation?** Joint candidate siting, sizing and three-stage flows, with visible mass-yield/cost assumptions and geographic inspection.
