import { Hono } from "hono";
import { agicyPlatformUrl } from "../lib/agicy-platform.js";

interface ArenaAgent {
  id: number | string;
  name: string;
  icon?: string | null;
  style?: string | null;
  category?: string | null;
  agent_type?: string | null;
  risk_grade?: string | null;
  is_active?: boolean;
}

function serialize(agent: ArenaAgent): Record<string, unknown> {
  return {
    id: String(agent.id),
    name: agent.name,
    icon: agent.icon ?? "AI",
    style: agent.style ?? null,
    category: agent.category ?? "trading",
    agentType: agent.agent_type ?? "system",
    riskGrade: agent.risk_grade ?? null,
    isActive: agent.is_active ?? false,
  };
}

const agentTemplates = new Hono().get("/", async (c) => {
  try {
    const response = await fetch(`${agicyPlatformUrl()}/api/arena/agents`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return c.json({ error: "arena_templates_unavailable" }, 502);
    }
    const payload = (await response.json()) as {
      agents?: ArenaAgent[];
    };
    return c.json({
      templates: (payload.agents ?? [])
        .filter((agent) => agent.is_active !== false)
        .map(serialize),
      source: "public_arena",
      readOnly: true,
    });
  } catch {
    return c.json({ error: "arena_templates_unavailable" }, 502);
  }
});

export default agentTemplates;
