import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationBell from "./NotificationBell";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../lib/api";

vi.mock("../lib/api", () => ({
  fetchNotifications: vi.fn(),
  fetchUnreadNotificationCount: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}));

const NOTIFICATION = {
  id: "ntf-1",
  type: "MILESTONE_RELEASED",
  title: "Milestone 1 funds released",
  body: "40 USDC released to the recipient (demo, not on-chain).",
  link: "/campaigns/water-tanks",
  readAt: null,
  createdAt: new Date().toISOString(),
};

function renderBell() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<NotificationBell />} />
        <Route path="/campaigns/:id" element={<p>Campaign page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchUnreadNotificationCount.mockResolvedValue({ unreadCount: 2 });
    fetchNotifications.mockResolvedValue({ items: [NOTIFICATION], unreadCount: 2 });
    markNotificationRead.mockResolvedValue({ ...NOTIFICATION, readAt: new Date().toISOString() });
    markAllNotificationsRead.mockResolvedValue({ updated: 2 });
  });

  it("announces the unread count on the trigger", async () => {
    renderBell();
    expect(
      await screen.findByRole("button", { name: "Notifications, 2 unread" })
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the inbox, marks an item read, and follows its link", async () => {
    renderBell();
    fireEvent.click(await screen.findByRole("button", { name: /notifications, 2 unread/i }));

    const item = await screen.findByRole("button", { name: /milestone 1 funds released/i });
    fireEvent.click(item);

    expect(markNotificationRead).toHaveBeenCalledWith("ntf-1");
    expect(await screen.findByText("Campaign page")).toBeInTheDocument();
  });

  it("marks everything read and closes on Escape", async () => {
    renderBell();
    fireEvent.click(await screen.findByRole("button", { name: /notifications, 2 unread/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications, none unread" })).toBeInTheDocument()
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
  });
});
