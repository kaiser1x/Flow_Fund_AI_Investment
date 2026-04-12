import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../api/notifications';
import { C } from '../theme/flowfundTheme';

// ── Bell SVG (no external icon library needed) ────────────────────────────────
function BellIcon({ size = 17 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// ── Relative timestamp ────────────────────────────────────────────────────────
function fmtTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000)        return 'just now';
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Type metadata ─────────────────────────────────────────────────────────────
const TYPE_META = {
  spending_alert:    { icon: '💸', color: '#e11d48' },
  budget_warning:    { icon: '⚠️', color: '#d97706' },
  large_transaction: { icon: '💳', color: '#7c3aed' },
  system:            { icon: '🔔', color: '#1a4d3e' },
};

// ── Demo read-state persistence (legacy demo IDs in localStorage) ─────────────
const DEMO_READ_KEY = 'ff_demo_notif_read';

function getDemoReadIds() {
  try { return new Set(JSON.parse(localStorage.getItem(DEMO_READ_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveDemoReadId(id) {
  try {
    const ids = getDemoReadIds();
    ids.add(String(id));
    localStorage.setItem(DEMO_READ_KEY, JSON.stringify([...ids]));
  } catch { /* storage unavailable — ignore */ }
}

function saveDemoReadAll(notifications) {
  try {
    const ids = notifications.map(n => String(n.notification_id));
    localStorage.setItem(DEMO_READ_KEY, JSON.stringify(ids));
  } catch { /* ignore */ }
}

function applyDemoReadState(notifications) {
  const readIds = getDemoReadIds();
  if (readIds.size === 0) return notifications;
  return notifications.map(n =>
    readIds.has(String(n.notification_id)) ? { ...n, is_read: true } : n
  );
}

// ── NotificationBell ──────────────────────────────────────────────────────────
export default function NotificationBell({ isDemo = false }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [open, setOpen]                   = useState(false);
  const wrapRef = useRef(null);

  // Fetch on mount
  useEffect(() => {
    getNotifications()
      .then(({ data }) => {
        const notifs = data.notifications || [];
        // If these are demo notifications, apply any previously saved read state
        const allDemo = notifs.every(n => String(n.notification_id).startsWith('demo-'));
        setNotifications(allDemo ? applyDemoReadState(notifs) : notifs);
      })
      .catch(() => {
        setNotifications([]);
      })
      .finally(() => setLoading(false));
  }, [isDemo]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onMouse = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown',   onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown',   onKey);
    };
  }, [open]);

  const unreadList = notifications.filter((n) => !n.is_read);
  const unreadCount = unreadList.length;
  const isAllDemo   = notifications.every((n) => String(n.notification_id).startsWith('demo-'));

  const handleMarkRead = useCallback(async (id) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.notification_id === id ? { ...n, is_read: true } : n))
    );
    if (isAllDemo) {
      saveDemoReadId(id); // persist across page navigation
      return;
    }
    try {
      await markNotificationRead(id);
    } catch (_) { /* swallow — optimistic state stays */ }
  }, [isAllDemo]);

  const handleMarkAllRead = useCallback(async () => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, is_read: true }));
      if (isAllDemo) saveDemoReadAll(updated); // persist across page navigation
      return updated;
    });
    if (isAllDemo) return;
    try {
      await markAllNotificationsRead();
    } catch (_) { /* swallow */ }
  }, [isAllDemo]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* ── Bell button ────────────────────────────────────────────────────── */}
      <button
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: open ? C.accentFade : 'transparent',
          border: `1.5px solid ${open ? 'rgba(46,204,138,0.35)' : C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: open ? C.brand : C.muted,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.background = C.accentFade;
            e.currentTarget.style.borderColor = 'rgba(46,204,138,0.35)';
            e.currentTarget.style.color = C.brand;
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = C.border;
            e.currentTarget.style.color = C.muted;
          }
        }}
      >
        <BellIcon />
        {/* Unread badge */}
        {!loading && unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              borderRadius: '8px',
              background: C.expense,
              border: '2px solid #fff',
              fontSize: '9px',
              fontWeight: 800,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ─────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 340,
            background: C.surface,
            borderRadius: C.r,
            border: `1px solid ${C.border}`,
            boxShadow: '0 4px 6px rgba(15,45,37,0.06), 0 12px 32px rgba(15,45,37,0.12)',
            zIndex: 200,
            overflow: 'hidden',
          }}
        >
          {/* Panel header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: C.ink }}>
                Notifications
              </span>
              {isAllDemo && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    background: 'rgba(217,119,6,0.09)',
                    border: '1px solid rgba(217,119,6,0.25)',
                    color: '#d97706',
                    borderRadius: '20px',
                    padding: '1px 7px',
                  }}
                >
                  DEMO
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: C.brand,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 0',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading ? (
              // Shimmer placeholder
              [1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 64,
                    margin: '8px 12px',
                    borderRadius: C.rs,
                    background:
                      'linear-gradient(90deg, #e8ede9 0%, #d4ddd8 50%, #e8ede9 100%)',
                    backgroundSize: '400px 100%',
                    animation: 'ff-shimmer 1.4s ease infinite',
                  }}
                />
              ))
            ) : notifications.length === 0 ? (
              // Empty state — nothing from server
              <div
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '32px' }}>🔔</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: C.ink }}>
                  All caught up!
                </div>
                <div style={{ fontSize: '12px', color: C.muted }}>
                  No notifications yet.
                </div>
              </div>
            ) : unreadList.length === 0 ? (
              // Had notifications but none unread (e.g. after mark all as read)
              <div
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '32px' }}>✓</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: C.ink }}>
                  All caught up!
                </div>
                <div style={{ fontSize: '12px', color: C.muted }}>
                  No unread notifications.
                </div>
              </div>
            ) : (
              unreadList.map((n) => {
                const meta = TYPE_META[n.type] || TYPE_META.system;
                return (
                  <div
                    key={n.notification_id}
                    onClick={() => handleMarkRead(n.notification_id)}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      padding: '12px 14px',
                      borderBottom: `1px solid ${C.border}`,
                      background: 'rgba(46,204,138,0.05)',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(46,204,138,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(46,204,138,0.05)';
                    }}
                  >
                    {/* Type icon */}
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '10px',
                        flexShrink: 0,
                        background: meta.color + '18',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                      }}
                    >
                      {meta.icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '6px',
                          marginBottom: '3px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 700,
                            color: C.ink,
                            lineHeight: 1.3,
                          }}
                        >
                          {n.title}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            color: C.faint,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {fmtTime(n.created_at)}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: C.muted,
                          lineHeight: 1.5,
                        }}
                      >
                        {n.message}
                      </div>
                    </div>

                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: C.accent,
                        flexShrink: 0,
                        marginTop: '5px',
                      }}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
