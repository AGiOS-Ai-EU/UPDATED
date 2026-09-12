import { apiFetch } from "./api";

export type AgentVenue = "paper" | "hyperliquid" | "binance" | "coinbase";
export type AgentMode = "draft" | "paper" | "paused" | "retired";

export interface AgentInstance {
  id: string;
  name: string;
  sourceTemplateId: string | null;
  venue: AgentVenue;
  mode: AgentMode;
  startingCapital: number;
  realizedPnl: number;
  unrealizedPnl: number;
  fees: number;
  createdAt: number;
  activatedAt: number | null;
  liveStartedAt: number | null;
  updatedAt: number;
  performanceSince: number;
}

export interface AgentVersion {
  id: string;
  version: number;
  strategySpec: Record<string, unknown>;
  createdAt: number;
}

export interface AgentEvent {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface AgentInstanceDetail {
  agent: AgentInstance;
  versions: AgentVersion[];
  events: AgentEvent[];
}

export interface CreateAgentInput {
  name: string;
  venue: AgentVenue;
  startingCapital: number;
  sourceTemplateId?: string;
  strategySpec?: Record<string, unknown>;
}

export interface UpdateAgentInput {
  name?: string;
  venue?: AgentVenue;
  startingCapital?: number;
  mode?: AgentMode;
}

async function parseError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (response.status === 401 || body?.error === "cloud_auth_required") {
    return new Error("Sign in to create and manage your private agents.");
  }
  return new Error(
    body?.error ?? `Agent service unavailable (${response.status})`,
  );
}

export async function listAgentInstances(): Promise<AgentInstance[]> {
  const response = await apiFetch("/api/agent-instances");
  if (!response.ok) throw await parseError(response);
  const body = (await response.json()) as { agents: AgentInstance[] };
  return body.agents;
}

export async function getAgentInstance(
  id: string,
): Promise<AgentInstanceDetail> {
  const response = await apiFetch(
    `/api/agent-instances/${encodeURIComponent(id)}`,
  );
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as AgentInstanceDetail;
}

export async function createAgentInstance(
  input: CreateAgentInput,
): Promise<AgentInstance> {
  const response = await apiFetch("/api/agent-instances", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await parseError(response);
  const body = (await response.json()) as { agent: AgentInstance };
  return body.agent;
}

export async function updateAgentInstance(
  id: string,
  input: UpdateAgentInput,
): Promise<AgentInstance> {
  const response = await apiFetch(
    `/api/agent-instances/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) throw await parseError(response);
  const body = (await response.json()) as { agent: AgentInstance };
  return body.agent;
}

export async function createAgentVersion(
  id: string,
  strategySpec: Record<string, unknown>,
): Promise<AgentVersion> {
  const response = await apiFetch(
    `/api/agent-instances/${encodeURIComponent(id)}/versions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategySpec }),
    },
  );
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as AgentVersion;
}
