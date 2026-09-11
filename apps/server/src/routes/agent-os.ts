import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  AGENT_OS_ENABLED_SETTING,
  AgentPathDeniedError,
  editAgentFile,
  globAgentFiles,
  grepAgentFiles,
  hasAgentOsCapability,
  readAgentFile,
  runAgentBash,
  writeAgentFile,
} from "../lib/agent-os.js";
import { getDb } from "../lib/db.js";

const anyPath = z.string().min(1).max(1_000);

function isAgentOsEnabled(): boolean {
  if (!hasAgentOsCapability()) return false;
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(AGENT_OS_ENABLED_SETTING) as { value: string } | undefined;
  return row?.value === "true";
}

function failure(err: unknown): { ok: false; reason: string } {
  if (err instanceof AgentPathDeniedError) {
    return { ok: false, reason: "path-outside-workspace" };
  }
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return { ok: false, reason: "not-found" };
  if (code === "EACCES" || code === "EPERM")
    return { ok: false, reason: "permission-denied" };
  if (code === "EISDIR") return { ok: false, reason: "is-a-directory" };
  return { ok: false, reason: "fs-failed" };
}

function requireAgentOs(c: {
  json: (body: { ok: false; reason: string }, status?: 403) => Response;
}): Response | null {
  if (!isAgentOsEnabled()) {
    return c.json({ ok: false, reason: "agent-os-disabled" }, 403);
  }
  return null;
}

const agentOsRoute = new Hono()
  .post(
    "/read",
    zValidator(
      "json",
      z.object({
        path: anyPath,
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(5_000).optional(),
      }),
    ),
    (c) => {
      const denied = requireAgentOs(c);
      if (denied) return denied;
      try {
        const { path, offset, limit } = c.req.valid("json");
        return c.json({
          ok: true,
          ...readAgentFile(
            path,
            offset ? Math.max(offset, 1) : undefined,
            limit,
          ),
        });
      } catch (err) {
        return c.json(failure(err));
      }
    },
  )
  .post(
    "/write",
    zValidator(
      "json",
      z.object({ path: anyPath, text: z.string().max(200_000) }),
    ),
    (c) => {
      const denied = requireAgentOs(c);
      if (denied) return denied;
      try {
        const { path, text } = c.req.valid("json");
        writeAgentFile(path, text);
        return c.json({ ok: true });
      } catch (err) {
        return c.json(failure(err));
      }
    },
  )
  .post(
    "/edit",
    zValidator(
      "json",
      z.object({
        path: anyPath,
        old: z.string().min(1).max(20_000),
        new: z.string().max(20_000),
      }),
    ),
    (c) => {
      const denied = requireAgentOs(c);
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        const result = editAgentFile(body.path, body.old, body.new);
        return c.json(
          result === "ok" ? { ok: true } : { ok: false, reason: result },
        );
      } catch (err) {
        return c.json(failure(err));
      }
    },
  )
  .post(
    "/glob",
    zValidator(
      "json",
      z.object({
        pattern: z.string().min(1).max(300),
        path: anyPath.optional(),
      }),
    ),
    (c) => {
      const denied = requireAgentOs(c);
      if (denied) return denied;
      try {
        const { pattern, path } = c.req.valid("json");
        return c.json({ ok: true, files: globAgentFiles(pattern, path) });
      } catch (err) {
        return c.json(failure(err));
      }
    },
  )
  .post(
    "/grep",
    zValidator(
      "json",
      z.object({ query: z.string().min(1).max(300), path: anyPath.optional() }),
    ),
    (c) => {
      const denied = requireAgentOs(c);
      if (denied) return denied;
      try {
        const { query, path } = c.req.valid("json");
        return c.json({ ok: true, matches: grepAgentFiles(query, path) });
      } catch (err) {
        return c.json(failure(err));
      }
    },
  )
  .post(
    "/bash",
    zValidator("json", z.object({ command: z.string().min(1).max(4_000) })),
    async (c) => {
      const denied = requireAgentOs(c);
      if (denied) return denied;
      try {
        const { command } = c.req.valid("json");
        const result = await runAgentBash(command);
        return c.json({ ok: true, ...result });
      } catch (err) {
        return c.json(failure(err));
      }
    },
  );

export default agentOsRoute;
