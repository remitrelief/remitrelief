import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VerificationWorkspace from "./VerificationWorkspace";
import { fetchMyVerification, submitVerificationRequest } from "../lib/api";

vi.mock("../lib/api", () => ({
  fetchMyVerification: vi.fn(),
  submitVerificationRequest: vi.fn(),
}));

const pushToast = vi.fn();
vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ push: pushToast }),
}));

function mockStatus(overrides = {}) {
  fetchMyVerification.mockResolvedValue({
    verificationStatus: "UNVERIFIED",
    roles: ["DONOR"],
    requests: [],
    ...overrides,
  });
}

describe("VerificationWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a trimmed request for an unverified user", async () => {
    mockStatus();
    submitVerificationRequest.mockResolvedValue({ id: "vrf-1", status: "PENDING" });
    render(<VerificationWorkspace />);

    const statement = await screen.findByRole("textbox", { name: /statement/i });
    fireEvent.change(statement, {
      target: { value: "  Community shelter distributing relief kits.  " },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /requested role/i }), {
      target: { value: "RECIPIENT" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));

    await waitFor(() =>
      expect(submitVerificationRequest).toHaveBeenCalledWith({
        requestedRole: "RECIPIENT",
        statement: "Community shelter distributing relief kits.",
        evidenceUrls: [],
      })
    );
    expect(pushToast).toHaveBeenCalledWith("Verification request submitted", "success");
  });

  it("shows a suspension notice instead of the form", async () => {
    mockStatus({ verificationStatus: "SUSPENDED" });
    render(<VerificationWorkspace />);

    expect(await screen.findByText(/your account is suspended/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit for review/i })).not.toBeInTheDocument();
  });

  it("lets a verified NGO request only the roles they do not hold", async () => {
    mockStatus({ verificationStatus: "VERIFIED", roles: ["DONOR", "NGO"] });
    render(<VerificationWorkspace />);

    const select = await screen.findByRole("combobox", { name: /requested role/i });
    const options = Array.from(select.querySelectorAll("option")).map((option) => option.value);
    expect(options).toEqual(["RECIPIENT"]);
  });

  it("hides the form while a request is pending", async () => {
    mockStatus({
      verificationStatus: "VERIFIED",
      roles: ["NGO"],
      requests: [{ id: "vrf-2", requestedRole: "RECIPIENT", status: "PENDING", statement: "x" }],
    });
    render(<VerificationWorkspace />);

    expect(await screen.findByText(/pending admin review/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("offers a retry when status cannot be loaded", async () => {
    fetchMyVerification.mockRejectedValueOnce(new Error("Network down"));
    render(<VerificationWorkspace />);

    expect(await screen.findByText("Network down")).toBeInTheDocument();
    mockStatus();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("UNVERIFIED")).toBeInTheDocument();
  });
});
