import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";
import { fetchDonations, fetchMyDashboard, fetchStats } from "../lib/api";

vi.mock("../lib/api", () => ({
  fetchMyDashboard: vi.fn(),
  fetchDonations: vi.fn(),
  fetchStats: vi.fn(),
}));

const CAMPAIGN = {
  id: "cmp-1",
  slug: "water-tanks",
  title: "Water tanks",
  status: "ACTIVE",
  currency: "USDC",
  goalAmount: 100,
  raisedAmount: 0,
  progressPercentage: 0,
  milestonesTotal: 2,
  milestonesVerified: 1,
  nextMilestoneIndex: 1,
  releasedAmount: 40,
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchStats.mockResolvedValue({
      totalRaised: 0,
      amountReleased: 40,
      campaignsActive: 3,
      milestonesVerified: 1,
      milestonesTotal: 6,
    });
    fetchDonations.mockResolvedValue([]);
  });

  it("shows organizer actions, donor totals with a demo hint, and platform impact", async () => {
    fetchMyDashboard.mockResolvedValue({
      roles: ["DONOR", "NGO"],
      verificationStatus: "VERIFIED",
      donor: {
        totalGiven: 25,
        totalGivenOnChain: 0,
        donationCount: 1,
        campaignsSupported: 1,
        releasedOnSupported: 40,
        supportedCampaigns: [{ ...CAMPAIGN, givenAmount: 25 }],
      },
      organizer: {
        campaignCount: 1,
        byStatus: { ACTIVE: 1 },
        totalRaised: 0,
        totalReleased: 40,
        milestonesVerified: 1,
        milestonesTotal: 2,
        needsAttention: [{ ...CAMPAIGN, nextAction: "Submit proof for milestone 2" }],
        campaigns: [CAMPAIGN],
      },
      recipient: null,
    });
    renderDashboard();

    const organizer = await screen.findByRole("region", { name: "Your campaigns" });
    expect(within(organizer).getByText("Submit proof for milestone 2")).toBeInTheDocument();

    const donor = screen.getByRole("region", { name: "Your giving" });
    expect(within(donor).getByText(/includes 25 usdc in demo donations/i)).toBeInTheDocument();

    expect(await screen.findByRole("region", { name: "Platform impact" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Support you receive" })).not.toBeInTheDocument();
  });

  it("warns unverified NGOs that proof actions are locked", async () => {
    fetchMyDashboard.mockResolvedValue({
      roles: ["NGO"],
      verificationStatus: "SUSPENDED",
      donor: null,
      organizer: null,
      recipient: null,
    });
    renderDashboard();

    expect(await screen.findByText(/verification status is suspended/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /review verification/i })).toHaveAttribute(
      "href",
      "/verification"
    );
  });

  it("offers a retry when the dashboard fails to load", async () => {
    fetchMyDashboard.mockRejectedValue(new Error("Server unavailable"));
    renderDashboard();

    expect(await screen.findByText("Server unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
