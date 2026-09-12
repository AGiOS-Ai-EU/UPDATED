import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * A privacy-preserving record of network egress. Payload contents, tokens, and
 * query text are deliberately excluded; the ledger records only what left the
 * machine, where it went, and why the request was authorized.
 */
export type EgressCategory = "auth" | "voice" | "search" | "agent" | "connector";

export interface EgressLedgerEvent {
  timestamp: string;
  category: EgressCategory;
  destination: string;
  method: string;
  status: number | null;
  requestBytes: number | null;
  responseBytes: number | null;
  authorization: "public" | "account-session" | "user-api-key";
  surface: string;
}

export const EGRESS_LEDGER_FILENAME = "updated-egress.jsonl";

export function resolveEgressLedgerPath(): string {
  const override = process.env.UPDATED_EGRESS_LEDGER?.trim();
  if (override) return override;
  const dbPath = process.env.FREESTYLE_DB_PATH?.trim();
  if (dbPath) return join(dirname(dbPath), "logs", EGRESS_LEDGER_FILENAME);
  return join(process.cwd(), "logs", EGRESS_LEDGER_FILENAME);
}

function safeHost(raw: string): string {
  try {
    return new URL(raw).host;
  } catch {
    return raw.slice(0, 120);
  }
}

export function appendEgressLedgerEvent(
  input: Omit<EgressLedgerEvent, "timestamp" | "destination"> & {
    destination: string;
  },
): string {
  const path = resolveEgressLedgerPath();
  mkdirSync(dirname(path), { recursive: true });
  const event: EgressLedgerEvent = {
    ...input,
    timestamp: new Date().toISOString(),
    destination: safeHost(input.destination),
  };
  appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
  return path;
}

export function readEgressLedger(limit = 100): EgressLedgerEvent[] {
  const path = resolveEgressLedgerPath();
  try {
    const lines = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-Math.max(1, Math.min(limit, 500)));
    return lines.flatMap((line) => {
      try {
        const value = JSON.parse(line) as EgressLedgerEvent;
        return value && typeof value === "object" ? [value] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
