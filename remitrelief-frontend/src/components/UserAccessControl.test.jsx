import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UserAccessControl from "./UserAccessControl";

const VALID_WALLET = `G${"A".repeat(55)}`;

describe("UserAccessControl", () => {
  it("disables actions until a valid Stellar address is entered", () => {
    render(<UserAccessControl onSetStatus={vi.fn()} />);

    const suspend = screen.getByRole("button", { name: "Suspend" });
    expect(suspend).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/wallet address/i), { target: { value: "not-a-key" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/valid stellar public key/i);
    expect(suspend).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/wallet address/i), { target: { value: VALID_WALLET } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(suspend).toBeEnabled();
  });

  it("passes the trimmed wallet, status, and reason to the handler", async () => {
    const onSetStatus = vi.fn().mockResolvedValue(undefined);
    render(<UserAccessControl onSetStatus={onSetStatus} />);

    fireEvent.change(screen.getByLabelText(/wallet address/i), {
      target: { value: `  ${VALID_WALLET}  ` },
    });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Evidence review" } });
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));

    await waitFor(() =>
      expect(onSetStatus).toHaveBeenCalledWith(VALID_WALLET, "SUSPENDED", "Evidence review")
    );

    fireEvent.click(screen.getByRole("button", { name: "Reinstate" }));
    await waitFor(() => expect(onSetStatus).toHaveBeenLastCalledWith(VALID_WALLET, "VERIFIED", undefined));
  });
});
