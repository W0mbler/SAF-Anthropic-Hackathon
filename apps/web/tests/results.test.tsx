import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SolutionStatus } from "../components/Results";
import type { Run } from "../lib/types";
describe("truthful solution state", () => {
  it("shows an unsolved state before the server returns a run", () => {
    render(<SolutionStatus run={null} />);
    expect(screen.getByTestId("solution-status")).toHaveTextContent(
      "Ready to optimise",
    );
  });
  it("labels time-limited feasible incumbents with their actual gap", () => {
    render(
      <SolutionStatus
        run={{ status: "feasible", feasible: true, relative_gap: 0.073 } as Run}
      />,
    );
    expect(screen.getByTestId("solution-status")).toHaveTextContent(
      "Feasible incumbent",
    );
    expect(screen.getByTestId("solution-status")).toHaveTextContent(
      "7.30% gap",
    );
  });
  it("shows pending work without claiming a finished network", () => {
    render(<SolutionStatus run={null} busy />);
    expect(screen.getByTestId("solution-status")).toHaveTextContent(
      "Solving MILP",
    );
  });
});
