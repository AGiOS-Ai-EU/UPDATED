import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { getAgicySession } from "../lib/agicy-session.js";
import { getDb } from "../lib/db.js";
import { getSession } from "../lib/sessions.js";

const venueSchema = z.enum(["paper", "hyperliquid", "binance", "coinbase"]);
const modeSchema = z.enum(["draft", "paper", "paused", "retired"]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sourceTemplateId: z.string().trim().min(1).max(120).optional(),
  venue: venueSchema.default("paper"),
  startingCapital: z.number().finite().min(0).max(10_000_000).default(0),
  strategySpec: z.record(z.string(), z.unknown()).optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    venue: venueSchema.optional(),
    startingCapital: z.number().finite().min(0).max(10_000_000).optional(),
    mode: modeSchema.optional(),
  })
  .strict();

const versionSchema = z.object({
  strategySpec: z.record(z.string(), z.unknown()).default({}),
});

interface AgentRow {
  id: string;
  owner_id: string;
  name: string;
  source_template_id: string | null;
  venue: string;
  mode: string;
  starting_capital: number;
  realized_pnl: number;
  unrealized_pnl: number;
  fees: number;
  created_at: number;
  activated_at: number | null;
  live_started_at: number | null;
  updated_at: number;
}

interface VersionRow {
  id: string;
  agent_id: string;
  version: number;
  strategy_spec: string;
  created_at: number;
}

interface EventRow {
  id: string;
  agent_id: string;
  kind: string;
  payload: string;
  created_at: number;
}

function ownerId(): string | null {
  return getAgicySession()?.user.id ?? getSession()?.user.id ?? null;
}

function jsonObject(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function serialize(row: AgentRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    sourceTemplateId: row.source_template_id,
    venue: row.venue,
    mode: row.mode,
    startingCapital: row.starting_capital,
    realizedPnl: row.realized_pnl,
    unrealizedPnl: row.unrealized_pnl,
    fees: row.fees,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    liveStartedAt: row.live_started_at,
    updatedAt: row.updated_at,
    performanceSince: row.activated_at ?? row.created_at,
  };
}

function notSignedIn(c: { json: (body: object, status?: 401) => Response }) {
  return c.json({ error: "cloud_auth_required" }, 401);
}

const agentInstances = new Hono()
  .get("/", (c) => {
    const owner = ownerId();
    if (!owner) return notSignedIn(c);
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, owner_id, name, source_template_id, venue, mode,
                starting_capital, realized_pnl, unrealized_pnl, fees,
                created_at, activated_at, live_started_at, updated_at
         FROM agent_instances
         WHERE owner_id = ?
         ORDER BY updated_at DESC`,
      )
      .all(owner) as unknown as AgentRow[];
    return c.json({ agents: rows.map(serialize) });
  })
  .post("/", zValidator("json", createSchema), (c) => {
    const owner = ownerId();
    if (!owner) return notSignedIn(c);
    const input = c.req.valid("json");
    const now = Date.now();
    const id = randomUUID();
    const versionId = randomUUID();
    const db = getDb();
    db.exec("BEGIN");
    try {
      db.prepare(
        `INSERT INTO agent_instances
          (id, owner_id, name, source_template_id, venue, mode,
           starting_capital, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      ).run(
        id,
        owner,
        input.name,
        input.sourceTemplateId ?? null,
        input.venue,
        input.startingCapital,
        now,
        now,
      );
      db.prepare(
        `INSERT INTO agent_versions
          (id, agent_id, version, strategy_spec, created_at)
         VALUES (?, ?, 1, ?, ?)`,
      ).run(versionId, id, JSON.stringify(input.strategySpec ?? {}), now);
      db.prepare(
        `INSERT INTO agent_events (id, agent_id, kind, payload, created_at)
         VALUES (?, ?, 'created', ?, ?)`,
      ).run(
        randomUUID(),
        id,
        JSON.stringify({ sourceTemplateId: input.sourceTemplateId ?? null }),
        now,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const row = db
      .prepare("SELECT * FROM agent_instances WHERE id = ? AND owner_id = ?")
      .get(id, owner) as unknown as AgentRow;
    return c.json({ agent: serialize(row), versionId }, 201);
  })
  .get("/:id", (c) => {
    const owner = ownerId();
    if (!owner) return notSignedIn(c);
    const id = c.req.param("id");
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM agent_instances WHERE id = ? AND owner_id = ?")
      .get(id, owner) as AgentRow | undefined;
    if (!row) return c.json({ error: "agent_not_found" }, 404);
    const versions = db
      .prepare(
        `SELECT id, agent_id, version, strategy_spec, created_at
         FROM agent_versions WHERE agent_id = ? ORDER BY version DESC`,
      )
      .all(id) as unknown as VersionRow[];
    const events = db
      .prepare(
        `SELECT id, agent_id, kind, payload, created_at
         FROM agent_events WHERE agent_id = ? ORDER BY created_at DESC LIMIT 100`,
      )
      .all(id) as unknown as EventRow[];
    return c.json({
      agent: serialize(row),
      versions: versions.map((version) => ({
        id: version.id,
        version: version.version,
        strategySpec: jsonObject(version.strategy_spec),
        createdAt: version.created_at,
      })),
      events: events.map((event) => ({
        id: event.id,
        kind: event.kind,
        payload: jsonObject(event.payload),
        createdAt: event.created_at,
      })),
    });
  })
  .patch("/:id", zValidator("json", updateSchema), (c) => {
    const owner = ownerId();
    if (!owner) return notSignedIn(c);
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const db = getDb();
    const existing = db
      .prepare("SELECT * FROM agent_instances WHERE id = ? AND owner_id = ?")
      .get(id, owner) as unknown as AgentRow | undefined;
    if (!existing) return c.json({ error: "agent_not_found" }, 404);
    const now = Date.now();
    const activatedAt =
      input.mode === "paper" && existing.activated_at === null
        ? now
        : existing.activated_at;
    db.prepare(
      `UPDATE agent_instances SET
         name = COALESCE(?, name),
         venue = COALESCE(?, venue),
         starting_capital = COALESCE(?, starting_capital),
         mode = COALESCE(?, mode),
         activated_at = ?,
         updated_at = ?
       WHERE id = ? AND owner_id = ?`,
    ).run(
      input.name ?? null,
      input.venue ?? null,
      input.startingCapital ?? null,
      input.mode ?? null,
      activatedAt,
      now,
      id,
      owner,
    );
    if (input.mode && input.mode !== existing.mode) {
      db.prepare(
        `INSERT INTO agent_events (id, agent_id, kind, payload, created_at)
         VALUES (?, ?, 'mode_changed', ?, ?)`,
      ).run(randomUUID(), id, JSON.stringify({ mode: input.mode }), now);
    }
    const row = db
      .prepare("SELECT * FROM agent_instances WHERE id = ? AND owner_id = ?")
      .get(id, owner) as unknown as AgentRow;
    return c.json({ agent: serialize(row) });
  })
  .post("/:id/versions", zValidator("json", versionSchema), (c) => {
    const owner = ownerId();
    if (!owner) return notSignedIn(c);
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const db = getDb();
    const agent = db
      .prepare("SELECT id FROM agent_instances WHERE id = ? AND owner_id = ?")
      .get(id, owner) as { id: string } | undefined;
    if (!agent) return c.json({ error: "agent_not_found" }, 404);
    const latest = db
      .prepare(
        "SELECT MAX(version) AS version FROM agent_versions WHERE agent_id = ?",
      )
      .get(id) as { version: number | null };
    const version = (latest.version ?? 0) + 1;
    const now = Date.now();
    db.prepare(
      `INSERT INTO agent_versions (id, agent_id, version, strategy_spec, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(randomUUID(), id, version, JSON.stringify(input.strategySpec), now);
    db.prepare("UPDATE agent_instances SET updated_at = ? WHERE id = ?").run(
      now,
      id,
    );
    return c.json({ id, version, strategySpec: input.strategySpec }, 201);
  });

export default agentInstances;
