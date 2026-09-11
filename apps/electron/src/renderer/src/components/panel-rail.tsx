import type { PanelTab } from "@shared/panel";
import type React from "react";
import { useEffect, useRef, useState } from "react";

const RAIL_PRIMARY: {
  id: PanelTab | "settings";
  label: string;
  isSettings?: boolean;
}[] = [
  { id: "chat", label: "Ask UPDATED" },
  { id: "search", label: "Web search" },
  { id: "apps", label: "Agents & apps" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings", isSettings: true },
];

const RAIL_OVERFLOW: { id: PanelTab; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "notes", label: "Notes" },
  { id: "brain", label: "Knowledge" },
];

function RailIcon({
  name,
}: {
  name: PanelTab | "settings" | "more";
}): React.JSX.Element {
  switch (name) {
    case "chat":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12c0-4 3.5-7 8-7s8 3 8 7-3.5 7-8 7c-1.2 0-2.3-.2-3.3-.6L4 20v-4.5C4.3 13.8 4 12.9 4 12z" />
          <path d="M8 11h8M8 14h5" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16l5 5" />
        </svg>
      );
    case "history":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "apps":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="8" cy="8" r="3" />
          <circle cx="17" cy="7" r="2" />
          <path d="M3 19c.5-3.5 2.2-5 5-5s4.5 1.5 5 5M14 13c3.5-.7 5.8 1 6.5 4" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

export interface PanelRailProps {
  tab: PanelTab;
  settingsOpen: boolean;
  onSelectTab: (tab: PanelTab) => void;
  onToggleSettings: () => void;
}

export function PanelRail({
  tab,
  settingsOpen,
  onSelectTab,
  onToggleSettings,
}: PanelRailProps): React.JSX.Element {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    const onDoc = (e: MouseEvent): void => {
      if (
        overflowRef.current &&
        !overflowRef.current.contains(e.target as Node)
      ) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [overflowOpen]);

  const overflowActive = RAIL_OVERFLOW.some((item) => item.id === tab);

  return (
    <div className="updated-glass-rail" role="tablist" aria-label="Panel">
      {RAIL_PRIMARY.map((item) => {
        const selected = item.isSettings
          ? settingsOpen
          : !settingsOpen && tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={item.label}
            title={item.label}
            className="updated-glass-rail-btn"
            onClick={() => {
              setOverflowOpen(false);
              if (item.isSettings) onToggleSettings();
              else onSelectTab(item.id as PanelTab);
            }}
          >
            <RailIcon name={item.isSettings ? "settings" : item.id} />
            <span className="updated-glass-rail-label">{item.label}</span>
          </button>
        );
      })}

      <span className="updated-glass-rail-divider" aria-hidden="true" />

      <div className="updated-glass-rail-spacer" />

      <div className="updated-glass-rail-overflow" ref={overflowRef}>
        <button
          type="button"
          role="tab"
          aria-selected={overflowActive && !settingsOpen}
          aria-expanded={overflowOpen}
          aria-haspopup="true"
          aria-label="More"
          title="More"
          className="updated-glass-rail-btn"
          onClick={() => setOverflowOpen((v) => !v)}
        >
          <RailIcon name="more" />
        </button>
        {overflowOpen ? (
          <div className="updated-glass-rail-menu" role="menu">
            {RAIL_OVERFLOW.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={`updated-glass-rail-menu-btn${!settingsOpen && tab === item.id ? " is-active" : ""}`}
                onClick={() => {
                  setOverflowOpen(false);
                  onSelectTab(item.id);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
