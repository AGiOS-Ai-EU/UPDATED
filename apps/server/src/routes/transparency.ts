import { Hono } from "hono";
import { readEgressLedger, resolveEgressLedgerPath } from "../lib/egress-ledger.js";

const transparency = new Hono().get("/egress", (c) => {
  const rawLimit = Number(c.req.query("limit") ?? 100);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 100;
  return c.json({
    ok: true as const,
    path: resolveEgressLedgerPath(),
    events: readEgressLedger(limit),
  });
});

export default transparency;
