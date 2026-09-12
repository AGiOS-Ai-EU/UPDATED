import { apiFetch } from "./api";

export interface AgentTemplate {
  id: string;
  name: string;
  icon: string;
  style: string | null;
  category: string;
  agentType: string;
  riskGrade: string | null;
  isActive: boolean;
}

export async function listAgentTemplates(): Promise<AgentTemplate[]> {
  const response = await apiFetch("/api/agent-templates");
  if (!response.ok)
    throw new Error("Arena templates are unavailable right now.");
  const body = (await response.json()) as { templates: AgentTemplate[] };
  return body.templates;
}
