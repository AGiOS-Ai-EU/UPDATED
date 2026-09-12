import { describe, expect, it } from "vitest";
import {
  type ArenaTrade,
  diffTradeAlerts,
  formatTradeAlert,
  normalizeArenaTrade,
} from "./trade-alerts";

const open = (id: string): ArenaTrade => ({
  id,
  status: "OPEN",
  asset: "FIL",
  side: "UP",
  reason: "Plato · LONG FIL",
  sizeUsd: 500,
  pnl: null,
  entryPrice: 0.79835,
  exitPrice: null,
  exitReason: "",
  exitKind: "OTHER",
});

describe("trade alert adapter", () => {
  it("normalizes the public arena shape and rejects records without ids", () => {
    expect(
      normalizeArenaTrade(
        { id: 42, status: "OPEN", asset: "sui", size_usd: "500" },
        "OPEN",
      ),
    ).toMatchObject({
      id: "42",
      asset: "SUI",
      sizeUsd: 500,
      status: "OPEN",
    });
    expect(normalizeArenaTrade({ asset: "BTC" }, "OPEN")).toBeNull();
  });

  it("seeds without notifications, then emits each lifecycle transition once", () => {
    const seeded = diffTradeAlerts(
      { initialized: false, statuses: {} },
      [open("1")],
      [],
    );
    expect(seeded.events).toHaveLength(0);

    const opened = diffTradeAlerts(seeded.next, [open("1"), open("2")], []);
    expect(opened.events.map((event) => event.kind)).toEqual(["opened"]);
    expect(opened.events[0]?.title).toBe("Trade opened · FIL");

    const closed = {
      ...open("1"),
      status: "CLOSED" as const,
      pnl: 53.89,
      exitReason: "TAKE_PROFIT",
    };
    const closedResult = diffTradeAlerts(opened.next, [open("2")], [closed]);
    expect(closedResult.events).toHaveLength(1);
    expect(closedResult.events[0]?.body).toContain("+$53.89");
    expect(
      diffTradeAlerts(closedResult.next, [open("2")], [closed]).events,
    ).toHaveLength(0);
  });

  it("formats tiny token prices without losing useful precision", () => {
    const result = formatTradeAlert("opened", {
      ...open("tiny"),
      asset: "PUMP",
      entryPrice: 0.003717,
    });
    expect(result.body).toContain("entry $0.0037170");
  });
});
