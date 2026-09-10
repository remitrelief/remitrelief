import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CampaignBadge,
  CampaignFilters,
  CampaignProgress,
  Pagination,
} from "./CampaignUI";

describe("campaign UI", () => {
  it("renders accessible funding progress from string amounts", () => {
    render(<CampaignProgress raised="25" goal="100" currency="USDC" />);

    const progress = screen.getByRole("progressbar", { name: /funding progress/i });
    expect(progress).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("25% funded")).toBeInTheDocument();
  });

  it("formats badge labels", () => {
    render(<CampaignBadge value="UNDER_REVIEW" />);
    expect(screen.getByText("UNDER REVIEW")).toBeInTheDocument();
  });

  it("reports URL filter changes", () => {
    const onChange = vi.fn();
    render(<CampaignFilters values={{ search: "", category: "", sort: "newest" }} onChange={onChange} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "water" } });
    expect(onChange).toHaveBeenCalledWith("search", "water");
  });

  it("disables pagination at the edges", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={3} onPageChange={onPageChange} />);

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
