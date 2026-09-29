import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../lib/api";

const POLL_MS = 60_000;

function timeAgo(iso) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Header inbox. Polls the unread count while the tab is visible; loads the list on open.
 */
export default function NotificationBell() {
  const panelId = useId();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshCount = useCallback(async () => {
    try {
      const data = await fetchUnreadNotificationCount();
      setUnreadCount(Number(data?.unreadCount) || 0);
    } catch {
      // Count is decorative; a failed poll should not surface an error.
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchNotifications({ limit: 15 });
      setItems(data?.items || []);
      setUnreadCount(Number(data?.unreadCount) || 0);
    } catch (err) {
      setError(err.message || "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refreshCount();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return undefined;
    loadList();
    function handlePointer(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, loadList]);

  async function handleSelect(item) {
    setOpen(false);
    if (!item.readAt) {
      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      markNotificationRead(item.id).catch(refreshCount);
    }
    if (item.link?.startsWith("/")) navigate(item.link);
  }

  async function handleMarkAll() {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) => current.map((row) => ({ ...row, readAt: row.readAt || now })));
      setUnreadCount(0);
    } catch (err) {
      setError(err.message || "Could not mark notifications read");
    }
  }

  const label = unreadCount
    ? `Notifications, ${unreadCount} unread`
    : "Notifications, none unread";

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="secondary compact notification-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path
            fill="currentColor"
            d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.25-6.78V3.5a1.75 1.75 0 1 0-3.5 0v.72A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div id={panelId} className="notification-panel" role="region" aria-label="Notifications">
          <div className="notification-panel-header">
            <h2>Notifications</h2>
            <button
              type="button"
              className="ghost-button"
              onClick={handleMarkAll}
              disabled={unreadCount === 0}
            >
              Mark all read
            </button>
          </div>
          {loading && items.length === 0 && (
            <p className="muted" role="status">
              Loading…
            </p>
          )}
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="muted">You are all caught up.</p>
          )}
          {items.length > 0 && (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notification-item${item.readAt ? "" : " unread"}`}
                    onClick={() => handleSelect(item)}
                  >
                    <span className="notification-title">
                      {!item.readAt && <span className="sr-only">Unread: </span>}
                      {item.title}
                    </span>
                    {item.body && <span className="notification-body">{item.body}</span>}
                    <time className="notification-time" dateTime={item.createdAt}>
                      {timeAgo(item.createdAt)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
