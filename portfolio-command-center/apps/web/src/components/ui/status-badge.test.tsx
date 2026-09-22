import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntegrationStatusBadge, LiveDataStatusBadge } from "./status-badge";

describe("IntegrationStatusBadge", () => {
  it("labels a not_configured integration honestly, not as operational", () => {
    render(<IntegrationStatusBadge status="not_configured" />);
    expect(screen.getByText("Not configured")).toBeInTheDocument();
  });

  it("labels an operational integration", () => {
    render(<IntegrationStatusBadge status="operational" />);
    expect(screen.getByText("Operational")).toBeInTheDocument();
  });
});

describe("LiveDataStatusBadge", () => {
  it("renders the unavailable state as LIVE DATA UNAVAILABLE, never silently blank", () => {
    render(<LiveDataStatusBadge status="unavailable" />);
    expect(screen.getByText("LIVE DATA UNAVAILABLE")).toBeInTheDocument();
  });
});
