import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import createApp from "../src/index.js";
import {
  AGENT_OS_CAPABILITY_ENV,
  AGENT_OS_ENABLED_SETTING,
} from "../src/lib/agent-os.js";
import { getDb } from "../src/lib/db.js";

const app = createApp();

let workDir: string;
let previousWorkspace: string | undefined;
let previousCapability: string | undefined;

function enableAgentOsInDb(): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, 'true', datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = datetime('now')`,
    )
    .run(AGENT_OS_ENABLED_SETTING);
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "agent-os-route-"));
  previousWorkspace = process.env.UPDATED_AGENT_WORKSPACE;
  previousCapability = process.env[AGENT_OS_CAPABILITY_ENV];
  process.env.UPDATED_AGENT_WORKSPACE = workDir;
  delete process.env[AGENT_OS_CAPABILITY_ENV];
  getDb()
    .prepare("DELETE FROM settings WHERE key = ?")
    .run(AGENT_OS_ENABLED_SETTING);
});

afterEach(() => {
  if (previousWorkspace === undefined) {
    delete process.env.UPDATED_AGENT_WORKSPACE;
  } else {
    process.env.UPDATED_AGENT_WORKSPACE = previousWorkspace;
  }
  if (previousCapability === undefined) {
    delete process.env[AGENT_OS_CAPABILITY_ENV];
  } else {
    process.env[AGENT_OS_CAPABILITY_ENV] = previousCapability;
  }
  getDb()
    .prepare("DELETE FROM settings WHERE key = ?")
    .run(AGENT_OS_ENABLED_SETTING);
  rmSync(workDir, { recursive: true, force: true });
});

describe("agent-os route capability gate", () => {
  it("keeps Bash disabled even when the persisted setting is true", async () => {
    enableAgentOsInDb();

    const res = await app.request("/api/agent-os/bash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: process.platform === "win32" ? "cd" : "pwd" }),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "agent-os-disabled",
    });
  });

  it("runs Bash only when both the setting and capability flag are enabled", async () => {
    enableAgentOsInDb();
    process.env[AGENT_OS_CAPABILITY_ENV] = "1";

    const res = await app.request("/api/agent-os/bash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: process.platform === "win32" ? "cd" : "pwd" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.exitCode).toBe(0);
  });
});
