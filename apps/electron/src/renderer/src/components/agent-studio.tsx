import {
  type AgentInstance,
  type AgentMode,
  type AgentVenue,
  createAgentInstance,
  getAgentInstance,
  listAgentInstances,
  updateAgentInstance,
} from "@renderer/lib/agent-instances";
import {
  type AgentTemplate,
  listAgentTemplates,
} from "@renderer/lib/agent-templates";
import { useCloudAuth } from "@renderer/lib/auth-context";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

const VENUES: { value: AgentVenue; label: string; note: string }[] = [
  {
    value: "paper",
    label: "Paper arena",
    note: "Safe simulation with its own ledger",
  },
  {
    value: "hyperliquid",
    label: "Hyperliquid",
    note: "Connect later — execution is gated",
  },
  {
    value: "binance",
    label: "Binance",
    note: "Connect later — execution is gated",
  },
  {
    value: "coinbase",
    label: "Coinbase",
    note: "Connect later — execution is gated",
  },
];

function formatMoney(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function modeLabel(mode: AgentMode): string {
  return mode === "paper"
    ? "Paper active"
    : mode[0].toUpperCase() + mode.slice(1);
}

export function AgentStudio(): React.JSX.Element {
  const { user, loading: authLoading, signIn, signingIn } = useCloudAuth();
  const [agents, setAgents] = useState<AgentInstance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<
    ReturnType<typeof getAgentInstance>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [builder, setBuilder] = useState<"auto" | "manual">("auto");
  const [name, setName] = useState("My first paper agent");
  const [brief, setBrief] = useState(
    "Trade conservatively, protect capital, and explain every decision.",
  );
  const [venue, setVenue] = useState<AgentVenue>("paper");
  const [startingCapital, setStartingCapital] = useState("10000");
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");

  const selected = useMemo(
    () => agents.find((agent) => agent.id === selectedId) ?? null,
    [agents, selectedId],
  );

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const next = await listAgentInstances();
      setAgents(next);
      if (selectedId && next.some((agent) => agent.id === selectedId)) {
        setDetail(await getAgentInstance(selectedId));
      } else if (next[0]) {
        setSelectedId(next[0].id);
        setDetail(await getAgentInstance(next[0].id));
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load your agents.",
      );
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void listAgentTemplates()
      .then((next) => setTemplates(next))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (user) void load();
    else setLoading(false);
  }, [load, user]);

  const selectAgent = async (id: string): Promise<void> => {
    setSelectedId(id);
    setError(null);
    try {
      setDetail(await getAgentInstance(id));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open this agent.",
      );
    }
  };

  const create = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const capital = Number(startingCapital);
    if (!name.trim() || !Number.isFinite(capital) || capital < 0) {
      setError("Give your agent a name and a valid starting capital.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const agent = await createAgentInstance({
        name: name.trim(),
        venue,
        startingCapital: capital,
        sourceTemplateId: templateId || undefined,
        strategySpec: {
          builder,
          sourceTemplateId: templateId || undefined,
          sourceTemplateName: templates.find((item) => item.id === templateId)
            ?.name,
          strategyStyle: templates.find((item) => item.id === templateId)
            ?.style,
          brief: builder === "auto" ? brief.trim() : undefined,
          riskProfile: "conservative",
          execution: "paper_only",
        },
      });
      setAgents((current) => [agent, ...current]);
      setSelectedId(agent.id);
      setDetail(await getAgentInstance(agent.id));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create this agent.",
      );
    } finally {
      setBusy(false);
    }
  };

  const setMode = async (
    agent: AgentInstance,
    mode: AgentMode,
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateAgentInstance(agent.id, { mode });
      setAgents((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (selectedId === updated.id)
        setDetail(await getAgentInstance(updated.id));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update this agent.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="agent-studio" aria-labelledby="agent-studio-title">
      <div className="agent-studio-head">
        <div>
          <span className="tavern-label">Private agent workspace</span>
          <h2 id="agent-studio-title">Agent Studio</h2>
          <p>
            Build an agent, keep its ledger separate, and see performance from
            its own start date.
          </p>
        </div>
        <span className="agent-studio-safety">
          PAPER-FIRST · NO LIVE ORDERS
        </span>
      </div>

      {!user ? (
        <div className="agent-studio-signin">
          <div>
            <strong>Sign in to create your private agents</strong>
            <p>
              Public arena agents stay read-only. Your drafts, versions, and
              paper results belong to your account.
            </p>
          </div>
          <button
            type="button"
            className="connector-action"
            onClick={() => void signIn()}
            disabled={authLoading || signingIn}
          >
            {signingIn ? "Opening sign-in…" : "Sign in with AGICY"}
          </button>
        </div>
      ) : (
        <>
          <form
            className="agent-builder"
            onSubmit={(event) => void create(event)}
          >
            <div
              className="agent-builder-tabs"
              role="tablist"
              aria-label="Agent build mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={builder === "auto"}
                className={builder === "auto" ? "is-active" : ""}
                onClick={() => setBuilder("auto")}
              >
                Auto-build agent
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={builder === "manual"}
                className={builder === "manual" ? "is-active" : ""}
                onClick={() => setBuilder("manual")}
              >
                Manual settings
              </button>
            </div>
            <div className="agent-builder-grid">
              <label>
                <span>Name</span>
                <input
                  value={name}
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              {builder === "auto" ? (
                <label className="agent-builder-wide">
                  <span>Describe the job</span>
                  <textarea
                    value={brief}
                    rows={2}
                    onChange={(event) => setBrief(event.target.value)}
                  />
                </label>
              ) : null}
              <label>
                <span>Arena template · read-only (optional)</span>
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                >
                  <option value="">Blank strategy</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.icon} {template.name} ·{" "}
                      {template.riskGrade
                        ? `Risk ${template.riskGrade}`
                        : template.category}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Venue</span>
                <select
                  value={venue}
                  onChange={(event) =>
                    setVenue(event.target.value as AgentVenue)
                  }
                >
                  {VENUES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Starting capital (USD)</span>
                <input
                  inputMode="decimal"
                  value={startingCapital}
                  onChange={(event) => setStartingCapital(event.target.value)}
                />
              </label>
            </div>
            <div className="agent-builder-foot">
              <small>
                {VENUES.find((item) => item.value === venue)?.note}. Each new
                agent starts with a zeroed P/L ledger.
              </small>
              <button
                type="submit"
                className="connector-action"
                disabled={busy}
              >
                {busy ? "Creating…" : "Create draft agent"}
              </button>
            </div>
          </form>

          {error ? (
            <div className="connector-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => void load()}>
                Try again
              </button>
            </div>
          ) : null}

          <div className="agent-studio-layout">
            <section className="agent-list" aria-label="Your agents">
              <div className="connector-group-label">
                <span>Your agents</span>
                <em>{agents.length}</em>
              </div>
              {loading ? (
                <p className="connector-loading-copy">
                  Loading your separate ledgers…
                </p>
              ) : null}
              {!loading && agents.length === 0 ? (
                <div className="agent-empty">
                  <strong>No private agents yet</strong>
                  <span>
                    Create a paper agent above to start its own timeline.
                  </span>
                </div>
              ) : null}
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`agent-card${selectedId === agent.id ? " is-selected" : ""}`}
                  onClick={() => void selectAgent(agent.id)}
                >
                  <span className="agent-card-mark" aria-hidden="true">
                    AI
                  </span>
                  <span className="agent-card-copy">
                    <strong>{agent.name}</strong>
                    <small>
                      {agent.venue} · since {formatDate(agent.performanceSince)}
                    </small>
                  </span>
                  <span className={`agent-mode mode-${agent.mode}`}>
                    {modeLabel(agent.mode)}
                  </span>
                </button>
              ))}
            </section>

            {selected && detail ? (
              <div className="agent-detail">
                <div className="agent-detail-head">
                  <div>
                    <span className="tavern-label">Selected agent</span>
                    <h3>{selected.name}</h3>
                  </div>
                  <button
                    type="button"
                    className="agent-detail-refresh"
                    onClick={() => void selectAgent(selected.id)}
                  >
                    Refresh
                  </button>
                </div>
                <div className="agent-metrics">
                  <div>
                    <span>Since</span>
                    <strong>{formatDate(selected.performanceSince)}</strong>
                  </div>
                  <div>
                    <span>Starting capital</span>
                    <strong>{formatMoney(selected.startingCapital)}</strong>
                  </div>
                  <div>
                    <span>Realized P/L</span>
                    <strong
                      className={
                        selected.realizedPnl >= 0
                          ? "is-positive"
                          : "is-negative"
                      }
                    >
                      {formatMoney(selected.realizedPnl)}
                    </strong>
                  </div>
                </div>
                <div className="agent-detail-controls">
                  <span className={`agent-mode mode-${selected.mode}`}>
                    {modeLabel(selected.mode)}
                  </span>
                  {selected.mode === "draft" || selected.mode === "paused" ? (
                    <button
                      type="button"
                      className="connector-action"
                      disabled={busy}
                      onClick={() => void setMode(selected, "paper")}
                    >
                      Start paper run
                    </button>
                  ) : null}
                  {selected.mode === "paper" ? (
                    <button
                      type="button"
                      className="connector-action is-secondary"
                      disabled={busy}
                      onClick={() => void setMode(selected, "paused")}
                    >
                      Pause
                    </button>
                  ) : null}
                </div>
                <div className="agent-detail-section">
                  <span className="tavern-label">Version history</span>
                  {detail.versions.slice(0, 3).map((version) => (
                    <div className="agent-version" key={version.id}>
                      <strong>v{version.version}</strong>
                      <span>{formatDate(version.createdAt)}</span>
                      <small>
                        {String(
                          version.strategySpec.brief ??
                            "Manual strategy settings",
                        )}
                      </small>
                    </div>
                  ))}
                </div>
                <p className="agent-detail-note">
                  Execution permissions are deliberately not enabled here.
                  Exchange binding, risk limits, backtests, and approval gates
                  come before any live order path.
                </p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
