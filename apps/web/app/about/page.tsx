import Link from "next/link";
import { ArrowRight, Factory, Leaf, Plane, Warehouse } from "lucide-react";
export default function About() {
  return (
    <div className="page-container about-page">
      <div className="simple-heading">
        <span className="eyebrow">HOW SAF COMMAND WORKS</span>
        <h1>
          Mathematics makes the decision.
          <br />
          <span>You inspect the assumptions.</span>
        </h1>
        <p>
          A transparent planning cockpit for Kalimantan&apos;s sustainable
          aviation fuel infrastructure.
        </p>
      </div>
      <div className="process-diagram">
        <div>
          <Leaf />
          <strong>80 biomass sources</strong>
          <span>6,800 kt available input</span>
        </div>
        <ArrowRight />
        <div>
          <Warehouse />
          <strong>Preprocessing depots</strong>
          <span>150 / 300 kt input capacity</span>
        </div>
        <ArrowRight />
        <div>
          <Factory />
          <strong>SAF refineries</strong>
          <span>500 / 1,087 kt input capacity</span>
        </div>
        <ArrowRight />
        <div>
          <Plane />
          <strong>Four airports</strong>
          <span>PNK · PKN · BPN · TRK</span>
        </div>
      </div>
      <div className="about-grid">
        <article className="panel">
          <span className="eyebrow">01 · JOINT OPTIMISATION</span>
          <h2>A real mathematical model.</h2>
          <p>
            SciPy&apos;s mixed-integer linear programming interface and the
            HiGHS solver jointly select facility sites, small or large sizes,
            and quantities on all three transport stages. The solution must
            respect each source&apos;s available biomass, facility input
            capacities, material conservation, conversion yield and exact
            airport demand.
          </p>
          <p>
            The candidate screen selects district median-nearest and
            maximum-production source coordinates: 13 depot candidates and 8
            refinery candidates. The result applies to this candidate set, not
            all possible land in Kalimantan.
          </p>
          <h3>What the gap means</h3>
          <p>
            A relative MIP gap measures the distance between a feasible
            solution&apos;s cost and the solver&apos;s mathematical lower bound.
            The default target is 2%. A time-limited feasible incumbent is
            labelled honestly; no solution is shown when none was found.
          </p>
        </article>
        <article className="panel">
          <span className="eyebrow">02 · PHYSICAL UNITS</span>
          <h2>Biomass in. Finished SAF out.</h2>
          <p>
            Flows use kilotonnes (kt), where 1 kt = 1,000 tonnes. Refinery
            capacities are interpreted as biomass input throughput, an explicit
            assumption. A 20% assumed mass yield means the illustrative 210 kt
            SAF demand needs 1,050 kt of biomass, not all 6,800 kt available.
          </p>
          <p>
            Depots conserve input mass. This simplified mass-yield model does
            not replace process engineering, fuel-quality testing or
            certification.
          </p>
          <h3>Illustrative defaults</h3>
          <p>
            Airport demand: PNK 60, PKN 30, BPN 90 and TRK 30 kt SAF. Yield:
            20%. Horizon: one year. Discount rate: zero. Processing OpEx: zero
            until configured because no production cost data were supplied.
          </p>
        </article>
        <article className="panel">
          <span className="eyebrow">03 · COST & DISTANCE</span>
          <h2>Trace every dollar.</h2>
          <p>
            The objective is upfront depot and refinery CapEx plus discounted
            annual transport and user-configured fixed annual processing OpEx.
            The present-value annuity factor is H at zero discount, otherwise [1
            − (1 + r)⁻ᴴ] / r.
          </p>
          <p>
            Transport tariffs are US$0.10, $0.12 and $0.08 per tonne-km across
            the three respective stages. Distance uses Haversine great-circle
            kilometres and a user-selected sensitivity multiplier.
          </p>
          <p>
            <strong>
              All map connections are schematic, not verified roads.
            </strong>{" "}
            Truck sizes have identical per-tonne-km tariffs in the challenge;
            changing truck capacity alone does not create transport cost
            savings.
          </p>
        </article>
        <article className="panel">
          <span className="eyebrow">04 · DATA & RESPONSIBLE USE</span>
          <h2>Useful evidence. Clear limits.</h2>
          <p>
            Biomass records come from the organiser-provided 80-location
            challenge dataset. Redistribution rights have not been verified.
            Airports are extracted from the supplied OpenFlights-style database;
            applicable Open Database Licence and attribution obligations must be
            reviewed before redistribution.
          </p>
          <p>
            The offline map is an illustrative geographic canvas. Coordinates
            and flow allocations come from supplied records and computed
            results. Its background outline is schematic; no third-party tile
            service is required.
          </p>
          <p>
            Candidate coordinates are not screened for land ownership, roads,
            protected areas or permits. The app makes no certified emissions,
            fuel sustainability, feasibility or investment-return claims.
          </p>
        </article>
      </div>
      <section className="panel about-ai">
        <span className="eyebrow">
          EXPLANATIONS, WITHOUT INVENTED DECISIONS
        </span>
        <h2>AI is optional. Solver facts are not.</h2>
        <p>
          Every run can be explained deterministically without any external key.
          If a server-side AI provider is configured, you must explicitly opt in
          before model facts are sent externally. Explanations cannot change the
          saved mathematical result. Missing keys, provider failures and
          unsupported output fall back to the deterministic explanation.
        </p>
        <Link href="/optimize" className="button primary">
          Explore the model <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
