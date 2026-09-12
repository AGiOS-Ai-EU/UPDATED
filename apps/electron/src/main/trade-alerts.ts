/**
 * Small, dependency-free adapter for the public AGICY Crypto Arena feed.
 *
 * Keeping normalization and diffing here (rather than in the Electron boot
 * file) makes the alert semantics easy to test and protects the desktop app
 * from small schema changes in the web arena.
 */

export type ArenaTradeStatus = "OPEN" | "CLOSED";

export interface ArenaTrade {
  id: string;
  status: ArenaTradeStatus;
  asset: string;
  side: string;
  reason: string;
  sizeUsd: number | null;
  pnl: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  exitReason: string;
  exitKind: string;
}

export interface TradeAlertState {
  initialized: boolean;
  statuses: Record<string, ArenaTradeStatus>;
}

export interface TradeAlertEvent {
  kind: "opened" | "closed";
  trade: ArenaTrade;
  title: string;
  body: string;
}

const UNKNOWN_ASSET = "market";

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function idValue(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Convert the arena's snake_case payload into a stable local shape. */
export function normalizeArenaTrade(
  input: unknown,
  expectedStatus: ArenaTradeStatus,
): ArenaTrade | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const id = idValue(raw.id);
  if (!id) return null;
  const status = stringValue(raw.status, expectedStatus).toUpperCase();
  if (status !== "OPEN" && status !== "CLOSED") return null;
  const asset = stringValue(raw.asset, UNKNOWN_ASSET).toUpperCase();
  return {
    id,
    status,
    asset,
    side: stringValue(raw.side, "UP").toUpperCase(),
    reason: stringValue(raw.reason, `AGICY · ${asset}`),
    sizeUsd: finiteNumber(raw.size_usd ?? raw.sizeUsd),
    pnl: finiteNumber(raw.pnl),
    entryPrice: finiteNumber(raw.entry_price ?? raw.entryPrice),
    exitPrice: finiteNumber(raw.exit_price ?? raw.exitPrice),
    exitReason: stringValue(raw.exit_reason ?? raw.exitReason),
    exitKind: stringValue(raw.exit_kind ?? raw.exitKind),
  };
}

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  if (Math.abs(value) >= 100) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(4);
  if (Math.abs(value) >= 0.01) return value.toFixed(5);
  return value.toPrecision(5);
}

function formatUsd(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function direction(trade: ArenaTrade): string {
  return trade.side === "DOWN" ? "SHORT" : "LONG";
}

/** Human-readable, compact copy used by both native and in-app notifications. */
export function formatTradeAlert(
  kind: "opened" | "closed",
  trade: ArenaTrade,
): Pick<TradeAlertEvent, "title" | "body"> {
  if (kind === "opened") {
    const size =
      trade.sizeUsd === null ? "" : ` · $${trade.sizeUsd.toFixed(0)}`;
    const entry =
      trade.entryPrice === null
        ? ""
        : ` · entry $${formatPrice(trade.entryPrice)}`;
    return {
      title: `Trade opened · ${trade.asset}`,
      body: `${trade.reason || `${direction(trade)} ${trade.asset}`}${size}${entry}`,
    };
  }

  const result = trade.pnl === null ? "result pending" : formatUsd(trade.pnl);
  const reason = trade.exitReason || trade.exitKind || "closed";
  return {
    title: `Trade closed · ${trade.asset}`,
    body: `${trade.reason || `${direction(trade)} ${trade.asset}`} · ${result} · ${reason}`,
  };
}

/**
 * Return only new lifecycle events. The first successful poll seeds state so
 * enabling alerts never floods a user with the arena's existing history.
 */
export function diffTradeAlerts(
  previous: TradeAlertState,
  openTrades: ArenaTrade[],
  closedTrades: ArenaTrade[],
): { next: TradeAlertState; events: TradeAlertEvent[] } {
  const current = new Map<string, ArenaTrade>();
  for (const trade of openTrades) current.set(trade.id, trade);
  // A close is authoritative if a record briefly appears in both feeds.
  for (const trade of closedTrades) current.set(trade.id, trade);

  const events: TradeAlertEvent[] = [];
  if (previous.initialized) {
    for (const trade of current.values()) {
      const before = previous.statuses[trade.id];
      if (trade.status === "OPEN" && before === undefined) {
        const copy = formatTradeAlert("opened", trade);
        events.push({ kind: "opened", trade, ...copy });
      } else if (trade.status === "CLOSED" && before !== "CLOSED") {
        const copy = formatTradeAlert("closed", trade);
        events.push({ kind: "closed", trade, ...copy });
      }
    }
  }

  const statuses: Record<string, ArenaTradeStatus> = {};
  for (const [id, trade] of current) statuses[id] = trade.status;
  // The endpoint is already bounded, but retain a little history so a close
  // does not repeat if the same record moves between the two lists.
  const ids = Object.keys(statuses);
  for (const id of Object.keys(previous.statuses)) {
    if (!(id in statuses) && ids.length < 500) {
      statuses[id] = previous.statuses[id];
      ids.push(id);
    }
  }
  for (const id of Object.keys(statuses).slice(0, -500)) delete statuses[id];

  return { next: { initialized: true, statuses }, events };
}
