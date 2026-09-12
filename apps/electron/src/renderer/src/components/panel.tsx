import "../overlay.css";
import "../tavern.css";
import "../updated-design.css";
import "../model-picker.css";

import { useChat } from "@ai-sdk/react";
import { AuthSignInControls } from "@renderer/components/auth-sign-in";
import { BrainFiles } from "@renderer/components/brain-files";
import { Capabilities } from "@renderer/components/capabilities";
import { ConnectSuggestions } from "@renderer/components/connect-suggestions";
import { ConnectedApps } from "@renderer/components/connected-apps";
import { Markdown } from "@renderer/components/markdown";
import { ModelPickerButton } from "@renderer/components/model-picker-button";
import { NotesTab } from "@renderer/components/notes-tab";
import { OnboardingGate, useOnboarding } from "@renderer/components/onboarding";
import { OpenerCards } from "@renderer/components/opener-cards";
import { PanelRail } from "@renderer/components/panel-rail";
import { SearchTab } from "@renderer/components/search-tab";
import { SettingsView } from "@renderer/components/settings-view";
import { Spark } from "@renderer/components/spark";
import { ThreadHistory } from "@renderer/components/thread-history";
import { TodosTab } from "@renderer/components/todos-tab";
import {
  type AgentToolCall,
  agentToolTier,
  DECLINED_OUTPUT,
  describeAgentAction,
  executeAgentTool,
} from "@renderer/lib/agent-tools";
import { capture } from "@renderer/lib/analytics";
import { apiFetch, initApiBase, refreshApiBase } from "@renderer/lib/api";
import { applyAppearanceToDocument } from "@renderer/lib/apply-appearance";
import { CloudAuthProvider, useCloudAuth } from "@renderer/lib/auth-context";
import { resetBrainCache } from "@renderer/lib/brain-fs";
import { composerAction } from "@renderer/lib/composer-action";
import { Recorder } from "@renderer/lib/recorder";
import { seedMessageFor } from "@renderer/lib/onboarding-core";
import {
  connectorConnectionsQueryOptions,
  createQueryClient,
  invalidateThreads,
  latestThreadQueryOptions,
  prependThreadToHistory,
  queryKeys,
  settingsQueryOptions,
} from "@renderer/lib/query";
import { installGlobalErrorHandlers } from "@renderer/lib/report-error";
import { useSpriteEmitter } from "@renderer/lib/sprite-emitter";
import { getThread, type ThreadState } from "@renderer/lib/threads";
import { highlightToolJson, toolJson } from "@renderer/lib/tool-json";
import {
  connectorToolkitSlug,
  type ToolPhase,
  toolPresentation,
} from "@renderer/lib/tool-presentation";
import { DEFAULT_LLM_MODEL_ID } from "@renderer/lib/updated-models";
import { SpriteBadge } from "@renderer/sprites/badge";
import { type CompanionForm, DEFAULT_COMPANION_FORM } from "@shared/companion";
import type { InputMode } from "@shared/dictation-prefs";
import { PANEL_MAX_WIDTH, PANEL_MIN_WIDTH, type PanelTab } from "@shared/panel";
import { SETTINGS_KEYS } from "@shared/settings-keys";
import { SPRITES_INFO } from "@shared/sprites";
import {
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

const TAB_PLACEHOLDER: Record<PanelTab, string> = {
  chat: "Ask anything, or point at something on screen.",
  search: "Search the open web with certificate-style citations.",
  history: "Past conversations land here — pick one to continue it.",
  todos: "Nothing to do yet.",
  notes: "No notes yet.",
  brain:
    "Everything UPDATED knows lives here — scheduled tasks, memories, notes, skills, todos.",
  apps: "Connect the apps you live in, and UPDATED can work them for you.",
};

function ShikiJson({ value }: { value: unknown }): React.JSX.Element {
  const source = toolJson(value);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setHtml(null);
    void highlightToolJson(source)
      .then((highlighted) => {
        if (active) setHtml(highlighted);
      })
      .catch(() => {
        // A readable, unhighlighted JSON block remains available on failure.
      });
    return () => {
      active = false;
    };
  }, [source]);

  if (!html) {
    return (
      <pre className="tavern-tool-code">
        <code>{source}</code>
      </pre>
    );
  }

  return (
    <div
      className="tavern-tool-code"
      // Shiki renders escaped source code; tool-json.test.ts guards this contract.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ToolMark({ partType }: { partType: string }): React.JSX.Element {
  const slug = connectorToolkitSlug(partType);
  const [failed, setFailed] = useState(false);
  const connections = useQuery(connectorConnectionsQueryOptions());
  const logo = slug
    ? (connections.data?.find((connection) => connection.toolkitSlug === slug)
        ?.toolkitLogo ?? null)
    : null;

  if (!logo || failed) {
    return (
      <span className="tavern-tool-mark" aria-hidden="true">
        ✦
      </span>
    );
  }
  return (
    <img
      className="tavern-tool-icon"
      src={logo}
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  );
}

function ToolChip({
  partType,
  input,
  output,
  phase = "done",
}: {
  partType: string;
  input: unknown;
  output: unknown;
  phase?: ToolPhase;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const presentation = toolPresentation(partType, phase, input);
  const running = phase === "running";
  const hasInput =
    input !== undefined &&
    input !== null &&
    (typeof input !== "object" || Object.keys(input).length > 0);
  const hasOutput =
    output !== undefined &&
    output !== null &&
    (typeof output !== "object" ||
      Object.keys(output).some((key) => key !== "ok"));
  const canExpand = hasInput || hasOutput || running;

  const tone = running
    ? " is-running"
    : phase === "declined" || phase === "failed"
      ? " is-inert"
      : "";

  return (
    <div className={`tavern-tool${tone}`}>
      <button
        type="button"
        className="tavern-tool-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!canExpand}
      >
        <ToolMark partType={partType} />
        <span className="tavern-tool-label">
          {presentation.title}
          {presentation.detail ? ` · ${presentation.detail}` : ""}
        </span>
        {running ? (
          <span
            className="tavern-tool-spinner"
            role="status"
            aria-label="Working"
          />
        ) : null}
        {canExpand ? (
          <span className="tavern-tool-caret" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="tavern-tool-detail">
          {hasInput ? (
            <>
              <span className="tavern-tool-heading">Request</span>
              <ShikiJson value={input} />
            </>
          ) : null}
          {hasOutput ? (
            <>
              <span className="tavern-tool-heading">Result</span>
              <ShikiJson value={output} />
            </>
          ) : running ? (
            <>
              <span className="tavern-tool-heading">Result</span>
              <span className="tavern-tool-waiting">Working…</span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function isPlaceholderText(text: string): boolean {
  return text.trim() === "...";
}

function messageText(message: UIMessage): string {
  return message.parts
    .flatMap((part) =>
      part.type === "text" && !isPlaceholderText(part.text) && part.text
        ? [part.text]
        : [],
    )
    .join("\n\n");
}

function MessageActions({
  role,
  copied,
  disabled,
  onCopy,
  onEdit,
  onRegenerate,
}: {
  role: UIMessage["role"];
  copied: boolean;
  disabled: boolean;
  onCopy: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
}): React.JSX.Element {
  return (
    <div className="tavern-msg-actions">
      <button
        type="button"
        className={`tavern-msg-action${copied ? " is-copied" : ""}`}
        onClick={onCopy}
        aria-label={copied ? "Message copied" : "Copy message"}
        title={copied ? "Copied" : "Copy message"}
      >
        <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
      </button>
      {role === "user" && onEdit ? (
        <button
          type="button"
          className="tavern-msg-action"
          disabled={disabled}
          onClick={onEdit}
          aria-label="Edit and resend message"
          title="Edit and resend"
        >
          <span aria-hidden="true">✎</span>
        </button>
      ) : null}
      {role === "assistant" && onRegenerate ? (
        <button
          type="button"
          className="tavern-msg-action"
          disabled={disabled}
          onClick={onRegenerate}
          aria-label="Regenerate response"
          title="Regenerate response"
        >
          <span aria-hidden="true">↻</span>
        </button>
      ) : null}
    </div>
  );
}

function ChatMessage({
  message,
  copied,
  disabled,
  editing,
  editDraft,
  onCopy,
  onEdit,
  onEditDraftChange,
  onCancelEdit,
  onResendEdit,
  onRegenerate,
}: {
  message: UIMessage;
  copied: boolean;
  disabled: boolean;
  editing: boolean;
  editDraft: string;
  onCopy: () => void;
  onEdit: () => void;
  onEditDraftChange: (text: string) => void;
  onCancelEdit: () => void;
  onResendEdit: () => void;
  onRegenerate: () => void;
}): React.JSX.Element {
  const text = messageText(message);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) editInputRef.current?.focus();
  }, [editing]);

  if (message.role === "user") {
    return (
      <div className="tavern-msg tavern-msg-user-wrap">
        {editing ? (
          <div className="tavern-msg-edit">
            <textarea
              className="tavern-msg-edit-input"
              value={editDraft}
              rows={2}
              ref={editInputRef}
              aria-label="Edit message"
              onMouseDown={() => window.api.panelRequestFocus()}
              onChange={(event) => onEditDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  onResendEdit();
                }
              }}
            />
            <div className="tavern-msg-edit-actions">
              <button type="button" onClick={onCancelEdit}>
                Cancel
              </button>
              <button
                type="button"
                className="is-primary"
                disabled={!editDraft.trim() || disabled}
                onClick={onResendEdit}
              >
                Send again
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="tavern-msg-user">{text}</div>
            <MessageActions
              role={message.role}
              copied={copied}
              disabled={disabled}
              onCopy={onCopy}
              onEdit={onEdit}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="tavern-msg tavern-msg-assistant-wrap">
      <div className="tavern-msg-assistant-content">
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (!part.text || isPlaceholderText(part.text)) return null;
            return (
              <div key={`${message.id}-${i}`} className="tavern-msg-assistant">
                <Markdown text={part.text} />
              </div>
            );
          }
          if (part.type === "tool-suggest_connections") {
            const tool = part as { state?: string; output?: unknown };
            if (tool.state !== "output-available") return null;
            return (
              <ConnectSuggestions
                key={`${message.id}-${i}`}
                output={tool.output}
              />
            );
          }
          if (part.type.startsWith("tool-")) {
            const tool = part as {
              state?: string;
              input?: unknown;
              output?: { ok?: boolean; reason?: string };
            };
            // Rendering only completed calls left a 16-step run looking like
            // one pulsing dot, and hid every refusal from the transcript.
            if (
              tool.state === "input-streaming" ||
              tool.state === "input-available"
            ) {
              return (
                <ToolChip
                  key={`${message.id}-${i}`}
                  partType={part.type}
                  input={tool.input}
                  output={undefined}
                  phase="running"
                />
              );
            }
            if (tool.state === "output-error") {
              return (
                <ToolChip
                  key={`${message.id}-${i}`}
                  partType={part.type}
                  input={tool.input}
                  output={tool.output}
                  phase="failed"
                />
              );
            }
            if (tool.state !== "output-available") return null;
            const failed = tool.output?.ok === false;
            return (
              <ToolChip
                key={`${message.id}-${i}`}
                partType={part.type}
                input={tool.input}
                output={tool.output}
                phase={
                  failed
                    ? tool.output?.reason === "user-declined"
                      ? "declined"
                      : "failed"
                    : "done"
                }
              />
            );
          }
          return null;
        })}
      </div>
      {text ? (
        <MessageActions
          role={message.role}
          copied={copied}
          disabled={disabled}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
        />
      ) : null}
    </div>
  );
}

async function openThreadById(threadId: string): Promise<ThreadState | null> {
  try {
    const res = await apiFetch(`/api/agent/thread/${threadId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      thread: { id: string; messages: UIMessage[] } | null;
    };
    return data.thread
      ? { id: data.thread.id, messages: data.thread.messages }
      : null;
  } catch {
    return null;
  }
}

function newThread(): ThreadState {
  return { id: crypto.randomUUID(), messages: [] };
}

function touchesBrain(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      part.type === "tool-brain_write" ||
      part.type === "tool-brain_edit" ||
      part.type === "tool-brain_delete",
  );
}

function touchesScheduled(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      part.type === "tool-scheduled_task_create" ||
      part.type === "tool-scheduled_task_update" ||
      part.type === "tool-scheduled_task_delete",
  );
}

function PanelTail(): React.JSX.Element {
  // A manga balloon tail. The card fill reaches up through the panel's border
  // and hard shadow so the bubble opens into the tail; the ink stroke draws
  // only the two side curves, meeting the border's cut ends with round caps.
  return (
    <svg
      className="tavern-tail"
      viewBox="0 0 56 46"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 3 L12 5.5 C15.5 15 17.5 28 17 41 C27 27 37 15 44 5.5 L44 3 Z"
        fill="var(--updated-field, #ffffff)"
      />
      <path
        d="M12 5.5 C15.5 15 17.5 28 17 41 C27 27 37 15 44 5.5"
        fill="none"
        stroke="var(--updated-ink, #16211f)"
        strokeWidth="0.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PanelResizeHandle(): React.JSX.Element {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<number | null>(null);

  const widthFor = (e: React.PointerEvent<HTMLDivElement>): number => {
    const d = drag.current;
    if (!d) return window.innerWidth;
    const next = d.startWidth + (e.screenX - d.startX);
    return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, next));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return;
    const width = widthFor(e);
    drag.current = null;
    pending.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    window.api.panelResizeWidth(width);
    window.api.panelCommitWidth();
  };

  return (
    <div
      className="tavern-resize-handle"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startX: e.screenX, startWidth: window.innerWidth };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        pending.current = widthFor(e);
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          if (pending.current === null) return;
          window.api.panelResizeWidth(pending.current);
          pending.current = null;
        });
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}

function PanelRoot(): React.JSX.Element {
  const [thread, setThread] = useState<ThreadState | null>(null);
  const queryClient = useQueryClient();
  const latestQuery = useQuery(latestThreadQueryOptions());
  const selectionRef = useRef(0);

  const switchThread = useCallback((next: ThreadState) => {
    selectionRef.current += 1;
    setThread(next);
  }, []);

  useEffect(() => {
    const off = window.api.onPanelOpenThread((threadId) => {
      const selection = ++selectionRef.current;
      void invalidateThreads(queryClient);
      void getThread(threadId)
        .catch(() => null)
        .then((picked) => {
          if (!picked || selectionRef.current !== selection) return;
          queryClient.setQueryData(queryKeys.threads.detail(threadId), picked);
          setThread(picked);
        });
    });
    const offNotifications = window.api.onNotificationsChanged(() => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.threads.list("scheduled"),
      });
    });
    return () => {
      off?.();
      offNotifications?.();
    };
  }, [queryClient]);

  useEffect(() => {
    if (latestQuery.isPending) return;
    setThread((current) => current ?? latestQuery.data ?? newThread());
  }, [latestQuery.data, latestQuery.isPending]);

  if (!thread) return <div className="tavern tavern-panel" />;
  return (
    <PanelInner key={thread.id} thread={thread} onSwitchThread={switchThread} />
  );
}

function PanelInner({
  thread,
  onSwitchThread,
}: {
  thread: ThreadState;
  onSwitchThread: (thread: ThreadState) => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<PanelTab>("chat");
  const queryClient = useQueryClient();
  const auth = useCloudAuth();
  const onboarding = useOnboarding(!!auth.user);
  const [spriteForm, setSpriteForm] = useState<CompanionForm>(
    DEFAULT_COMPANION_FORM,
  );

  useEffect(() => {
    void window.api
      .getInputMode()
      .then(setInputMode)
      .catch(() => {});
    const offMode = window.api.onInputModeChanged(setInputMode);
    const offVoiceSearch = window.api.onPanelSearchQuery((query) => {
      setTab("search");
      setSettingsOpen(false);
      setCapabilitiesOpen(false);
      setVoiceSearchQuery(query);
    });
    return () => {
      offMode?.();
      offVoiceSearch?.();
    };
  }, []);

  useEffect(() => {
    void window.api
      .companionForm()
      .then(setSpriteForm)
      .catch(() => {});
    const offForm = window.api.onCompanionForm(setSpriteForm);
    return () => offForm?.();
  }, []);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) {
      window.api.setCompanionProductVisible(false);
      setTab("search");
      return;
    }
    if (onboarding.status === "loading") return;
    window.api.setCompanionProductVisible(onboarding.status === "done");
  }, [auth.user, auth.loading, onboarding.status]);

  const settingsQuery = useQuery(settingsQueryOptions());
  const llmModelId =
    settingsQuery.data?.[SETTINGS_KEYS.llmModel] ?? DEFAULT_LLM_MODEL_ID;

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    applyAppearanceToDocument({
      preset: s[SETTINGS_KEYS.appearancePreset],
      accent: s[SETTINGS_KEYS.appearanceAccent],
      textScale: s[SETTINGS_KEYS.textScale],
      uiLocale: s[SETTINGS_KEYS.uiLocale],
      reduceMotion: s[SETTINGS_KEYS.reduceMotion] === "true",
    });
  }, [settingsQuery.data]);

  const setLlmModel = useCallback(
    (id: string) => {
      void apiFetch(`/api/settings/${SETTINGS_KEYS.llmModel}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: id }),
      }).then((res) => {
        if (res.ok) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
        }
      });
    },
    [queryClient],
  );

  const [updateStatus, setUpdateStatus] = useState<{
    version: string | null;
    downloadState: "idle" | "downloading" | "downloaded";
  }>({ version: null, downloadState: "idle" });

  useEffect(() => {
    void window.api
      .getUpdateStatus()
      .then(setUpdateStatus)
      .catch(() => {});
    const offUpdate = window.api.onUpdateStatus(setUpdateStatus);
    return () => offUpdate?.();
  }, []);
  const [draft, setDraft] = useState("");
  const [musicBusy, setMusicBusy] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<AgentToolCall[]>([]);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("dictation");
  const [voiceSearchQuery, setVoiceSearchQuery] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const musicRecorderRef = useRef<Recorder | null>(null);
  const dictationBaseRef = useRef<string | null>(null);
  // Whether the current draft arrived by voice, so message_sent can say so.
  const dictatedRef = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        body: { threadId: thread.id },
        fetch: ((input: string | URL | Request, init?: RequestInit) =>
          apiFetch(
            typeof input === "string" ? input : "/api/agent",
            init ?? {},
          )) as typeof fetch,
      }),
    [thread.id],
  );

  const {
    messages,
    sendMessage,
    regenerate,
    stop,
    status,
    addToolOutput,
    setMessages,
  } = useChat({
    id: thread.id,
    messages: thread.messages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: ({ messages: finished }) => {
      queryClient.setQueryData(queryKeys.threads.detail(thread.id), {
        id: thread.id,
        messages: finished,
      });
      void invalidateThreads(queryClient);
      if (finished.length === 0) return;
      const last = finished[finished.length - 1];
      if (last?.role !== "assistant") return;
      if (touchesBrain(last)) {
        resetBrainCache();
        void queryClient.invalidateQueries({ queryKey: queryKeys.brain.all });
      }
      if (touchesScheduled(last)) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.scheduled.tasks,
        });
      }
      const text = messageText(last);
      if (!text) return;
      window.api.agentTurnFinished({
        threadId: thread.id,
        excerpt: text.slice(0, 140),
      });
    },
    onToolCall: async ({ toolCall }) => {
      const call: AgentToolCall = {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        input: toolCall.input,
      };
      const tier = await agentToolTier(call);
      if (tier === "confirmed") {
        setApprovals((prev) => [...prev, call]);
        return;
      }
      const output =
        tier === "free"
          ? await executeAgentTool(call)
          : { ok: false, reason: `unknown tool: ${call.toolName}` };
      addToolOutput({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output,
      });
    },
    onError: (err) => {
      const message = typeof err.message === "string" ? err.message : "";
      setNotice(
        message.includes("cloud_auth_required") || message.includes("401")
          ? "Sign in with your AGICY account."
          : message.includes("thread_too_long")
            ? "This conversation is too long to continue. Start a new one from the menu."
            : message && message !== "[object Object]"
              ? message
              : "That didn't go through. Try again.",
      );
    },
  });

  useEffect(() => {
    if (status === "submitted" || status === "streaming") return;
    if (thread.messages.length > messages.length) setMessages(thread.messages);
  }, [thread.messages, messages.length, setMessages, status]);

  const startedRef = useRef(thread.messages.length > 0);
  useEffect(() => {
    if (startedRef.current || messages.length === 0) return;
    startedRef.current = true;
    prependThreadToHistory(queryClient, {
      id: thread.id,
      title: "New conversation",
      updatedAt: Date.now(),
      origin: "user",
    });
  }, [messages.length, queryClient, thread.id]);

  const busy = status === "submitted" || status === "streaming";
  const action = composerAction(status);

  useEffect(() => {
    return () => musicRecorderRef.current?.destroy();
  }, []);

  const recognizeMusic = async (): Promise<void> => {
    if (musicBusy || busy || tab !== "chat") return;
    const recorder = musicRecorderRef.current ?? new Recorder();
    musicRecorderRef.current = recorder;
    setMusicBusy(true);
    setNotice("Listening for music… 6 seconds");
    try {
      await recorder.start();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 6_000));
      const audio = await recorder.stop();
      if (!audio) throw new Error("No audio captured");
      const form = new FormData();
      form.append("audio", audio, "music.wav");
      const response = await apiFetch("/api/music/recognize", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as {
        matched?: boolean;
        track?: { artist?: string; title?: string; songLink?: string | null };
        message?: string;
        error?: string;
      } | null;
      if (payload?.error === "music_recognition_not_configured") {
        setNotice("Music recognition is not configured on this AGICY server yet.");
      } else if (!response.ok) {
        setNotice(payload?.message ?? "Music recognition failed. Try another clip.");
      } else if (payload?.matched && payload.track) {
        const label = `${payload.track.title ?? "Unknown track"} — ${payload.track.artist ?? "Unknown artist"}`;
        setNotice(
          payload.track.songLink
            ? `Identified: ${label} · ${payload.track.songLink}`
            : `Identified: ${label}`,
        );
      } else {
        setNotice("No confident match. Try moving closer to the speaker and record again.");
      }
    } catch (error) {
      recorder.cancel();
      const message = error instanceof Error ? error.message : "Unknown recording error";
      setNotice(
        message.includes("Permission") || message.includes("permission")
          ? "Microphone access is required to identify music."
          : "Could not capture music. Try again.",
      );
    } finally {
      setMusicBusy(false);
    }
  };
  // The spark loader holds the floor until the first response text streams in;
  // once text is flowing, the growing message itself is the indicator.
  const lastMessage = messages[messages.length - 1];
  const awaitingText =
    status === "submitted" ||
    (status === "streaming" &&
      (!lastMessage ||
        lastMessage.role !== "assistant" ||
        !messageText(lastMessage)));

  useSpriteEmitter(messages, approvals.length, busy);

  const send = (): void => {
    const text = draft.trim();
    if (!text || tab !== "chat" || busy || approvals.length > 0) return;
    capture("message_sent", {
      source: dictatedRef.current ? "dictated" : "typed",
      chars: text.length,
      threadIsNew: messages.length === 0,
    });
    dictatedRef.current = false;
    setNotice(null);
    setDraft("");
    void sendMessage({ text });
  };

  const stopGeneration = (): void => {
    if (!busy) return;
    stop();
  };

  const copyMessage = (message: UIMessage): void => {
    const text = messageText(message);
    if (!text) return;
    void window.api
      .remixSetClipboard(text)
      .then((result) => {
        if (!result.ok) throw new Error("copy-failed");
        setCopiedMessageId(message.id);
        window.setTimeout(
          () =>
            setCopiedMessageId((current) =>
              current === message.id ? null : current,
            ),
          1_500,
        );
      })
      .catch(() => setNotice("Could not copy that message."));
  };

  const startEditingMessage = (message: UIMessage): void => {
    const text = messageText(message);
    if (message.role !== "user" || !text || busy || approvals.length > 0)
      return;
    setEditingMessageId(message.id);
    setEditDraft(text);
  };

  const cancelEditingMessage = (): void => {
    setEditingMessageId(null);
    setEditDraft("");
  };

  const resendEditedMessage = (): void => {
    const text = editDraft.trim();
    if (!editingMessageId || !text || busy || approvals.length > 0) return;
    const messageId = editingMessageId;
    cancelEditingMessage();
    setNotice(null);
    void sendMessage({ text, messageId }).catch(() => {
      setNotice("Could not resend that message.");
    });
  };

  const regenerateMessage = (message: UIMessage): void => {
    if (message.role !== "assistant" || busy || approvals.length > 0) return;
    setNotice(null);
    void regenerate({ messageId: message.id }).catch(() => {
      setNotice("Could not regenerate that response.");
    });
  };

  const resolveApproval = (call: AgentToolCall, allowed: boolean): void => {
    capture("approval_resolved", { tool: call.toolName, allowed });
    setApprovals((prev) =>
      prev.filter((a) => a.toolCallId !== call.toolCallId),
    );
    void (async () => {
      const output = allowed ? await executeAgentTool(call) : DECLINED_OUTPUT;
      addToolOutput({
        tool: call.toolName,
        toolCallId: call.toolCallId,
        output,
      });
    })();
  };

  useEffect(() => {
    // Every tab renders into the same .tavern-body scroller, so without this
    // guard a streaming turn yanks Settings/History/Brain to the bottom.
    if (tab !== "chat" || settingsOpen) return;
    const el = bodyRef.current;
    if (el && (messages.length > 0 || approvals.length > 0))
      el.scrollTop = el.scrollHeight;
  }, [messages, approvals, tab, settingsOpen]);

  const pinned =
    busy || approvals.length > 0 || auth.signingIn || auth.phase === "approved";
  useEffect(() => {
    window.api.panelSetBusy(pinned);
    return () => window.api.panelSetBusy(false);
  }, [pinned]);

  useEffect(() => {
    // The composer only exists on the chat tab — dictation and explicit
    // focus requests must surface it first.
    const showComposer = (): void => {
      setSettingsOpen(false);
      setTab("chat");
    };
    const offFocus = window.api.onPanelFocusComposer(() => {
      showComposer();
      requestAnimationFrame(() =>
        document.getElementById("panel-composer")?.focus(),
      );
    });
    const offShowSettings = window.api.onPanelShowSettings(() => {
      setSettingsOpen(true);
    });
    const offDictation = window.api.onPanelDictation((ev) => {
      if (ev.kind !== "error") showComposer();
      if (ev.kind === "error") {
        setNotice(ev.text);
        const base = dictationBaseRef.current;
        dictationBaseRef.current = null;
        if (base !== null) setDraft(base);
        return;
      }
      setNotice(null);
      if (ev.kind === "partial" || ev.kind === "final")
        dictatedRef.current = true;
      if (ev.kind === "partial") {
        // Snapshot whatever was typed before this utterance once; every
        // partial then re-renders base + live text, replacing the previous
        // partial rather than stacking on it.
        setDraft((prev) => {
          if (dictationBaseRef.current === null)
            dictationBaseRef.current = prev.trim();
          const base = dictationBaseRef.current;
          return base ? `${base} ${ev.text}` : ev.text;
        });
        return;
      }
      // Final REPLACES the partial tail — appending to the draft here would
      // duplicate the utterance, since the partials already wrote it.
      const base = dictationBaseRef.current;
      dictationBaseRef.current = null;
      setDraft((prev) => {
        const anchor = base ?? prev.trim();
        return anchor ? `${anchor} ${ev.text}` : ev.text;
      });
    });
    window.api.panelRendererReady();
    return () => {
      offFocus?.();
      offShowSettings?.();
      offDictation?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") window.api.panelClose();
    };
    const onLeave = (): void => window.api.panelPointerLeft();
    const onEnter = (): void => window.api.panelPointerEntered();
    window.addEventListener("keydown", onKey);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
    };
  }, []);

  const chatActive = tab === "chat";
  const showChat = chatActive && messages.length > 0;

  const selectTab = (id: PanelTab): void => {
    capture("panel_tab_opened", { tab: id });
    setSettingsOpen(false);
    setCapabilitiesOpen(false);
    setTab(id);
  };

  const panelBody = (
    <>
      {!auth.loading &&
      (!auth.user || auth.phase === "approved") &&
      !settingsOpen ? (
        <AuthSignInControls variant="strip" />
      ) : null}
      {capabilitiesOpen ? (
        <>
          <button
            type="button"
            className="tavern-file-back"
            onClick={() => setCapabilitiesOpen(false)}
          >
            ← What UPDATED can do
          </button>
          <Capabilities
            onPrompt={(text) => {
              setCapabilitiesOpen(false);
              setNotice(null);
              void sendMessage({ text });
            }}
            onOpenApps={() => {
              setCapabilitiesOpen(false);
              setTab("apps");
            }}
          />
        </>
      ) : settingsOpen ? (
        <SettingsView
          onClose={() => setSettingsOpen(false)}
          onOpenThread={(threadId) => {
            setSettingsOpen(false);
            setTab("chat");
            void openThreadById(threadId).then((picked) => {
              if (picked) onSwitchThread(picked);
            });
          }}
          onThreadsCleared={() => {
            void invalidateThreads(queryClient);
            onSwitchThread(newThread());
          }}
          onReplayIntro={() => {
            setSettingsOpen(false);
            onboarding.replay();
          }}
        />
      ) : tab === "search" ? (
        <SearchTab
          inputMode={inputMode}
          onInputModeChange={(mode) => {
            setInputMode(mode);
            void window.api.setInputMode(mode);
          }}
          externalQuery={voiceSearchQuery}
          onExternalQueryHandled={() => setVoiceSearchQuery(null)}
        />
      ) : tab === "history" ? (
        <ThreadHistory
          currentId={thread.id}
          onPick={(picked) => {
            if (picked.id === thread.id) setTab("chat");
            else onSwitchThread(picked);
          }}
        />
      ) : tab === "apps" ? (
        <ConnectedApps
          onUseWorkflow={(prompt) => {
            setTab("chat");
            if (pinned) return;
            setNotice(null);
            void sendMessage({ text: prompt });
          }}
        />
      ) : showChat ? (
        <>
          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              copied={copiedMessageId === m.id}
              disabled={pinned}
              editing={editingMessageId === m.id}
              editDraft={editDraft}
              onCopy={() => copyMessage(m)}
              onEdit={() => startEditingMessage(m)}
              onEditDraftChange={setEditDraft}
              onCancelEdit={cancelEditingMessage}
              onResendEdit={resendEditedMessage}
              onRegenerate={() => regenerateMessage(m)}
            />
          ))}
          {approvals.map((call) => (
            <div key={call.toolCallId} className="tavern-approve">
              <span className="tavern-approve-title">
                {SPRITES_INFO[spriteForm].label.toLowerCase()} wants to act
              </span>
              <div className="tavern-approve-text">
                {describeAgentAction(call)}
              </div>
              <div className="tavern-approve-actions">
                <button
                  type="button"
                  className="tavern-approve-btn tavern-approve-allow"
                  onClick={() => resolveApproval(call, true)}
                >
                  Allow
                </button>
                <button
                  type="button"
                  className="tavern-approve-btn"
                  onClick={() => resolveApproval(call, false)}
                >
                  Don't allow
                </button>
              </div>
            </div>
          ))}
          {awaitingText ? (
            <div
              className="tavern-stream-wait"
              role="status"
              aria-label="Thinking"
            >
              <Spark state="idle" size={11} />
            </div>
          ) : null}
        </>
      ) : tab === "todos" ? (
        <TodosTab mascot={SPRITES_INFO[spriteForm].label} />
      ) : tab === "notes" ? (
        <NotesTab />
      ) : tab === "brain" ? (
        <BrainFiles
          root=""
          emptyText={TAB_PLACEHOLDER.brain}
          newLabel="New file"
          onOpenThread={(threadId) => {
            setTab("chat");
            void openThreadById(threadId).then((picked) => {
              if (picked) onSwitchThread(picked);
            });
          }}
        />
      ) : chatActive ? (
        <OpenerCards
          busy={busy}
          onShowAll={() => setCapabilitiesOpen(true)}
          onPrompt={(text) => {
            setNotice(null);
            void sendMessage({ text });
          }}
        />
      ) : (
        <div className="tavern-empty">{TAB_PLACEHOLDER[tab]}</div>
      )}
      {notice ? <p className="tavern-notice">{notice}</p> : null}
    </>
  );

  // Unsigned users get the instrument (search / local STT) without a hard
  // gate — Decision 1. Soft CTA lives in panelBody. Onboarding only after
  // AGICY sign-in.
  if (auth.user && onboarding.status !== "done") {
    return (
      <div className="tavern-shell">
        <div className="tavern tavern-panel">
          {onboarding.status === "show" ? (
            <OnboardingGate
              user={auth.user}
              spriteForm={spriteForm}
              saved={onboarding.saved}
              onDone={(task) => {
                // The landing: the panel opens on a thread that is already
                // about the task. Replays never seed a second thread.
                const replayed = onboarding.saved?.replayed === true;
                onboarding.markDone(task);
                setTab("chat");
                if (task && !replayed) {
                  setNotice(null);
                  void sendMessage(
                    { text: seedMessageFor(task) },
                    { body: { firstTurn: true } },
                  );
                }
              }}
            />
          ) : null}
        </div>
        <PanelTail />
        <PanelResizeHandle />
      </div>
    );
  }

  return (
    <div className="tavern-shell updated-hybrid-shell">
      <PanelRail
        tab={tab}
        settingsOpen={settingsOpen}
        onSelectTab={selectTab}
        onToggleSettings={() => {
          setCapabilitiesOpen(false);
          setSettingsOpen((v) => !v);
        }}
      />
      <div className="updated-glass-frame">
        <div className="tavern tavern-panel">
          <div className="tavern-head">
            <SpriteBadge form={spriteForm} working={busy} size={22} />
            <span className="tavern-head-name">
              updated<i>.</i>
            </span>
            <span className="tavern-head-spacer" />
            {updateStatus.version ? (
              <button
                type="button"
                className={`tavern-head-update${
                  updateStatus.downloadState === "downloaded" ? " is-ready" : ""
                }`}
                title={
                  updateStatus.downloadState === "downloaded"
                    ? `Version ${updateStatus.version} is ready — restart to update`
                    : updateStatus.downloadState === "downloading"
                      ? `Version ${updateStatus.version} is downloading`
                      : `Version ${updateStatus.version} is available`
                }
                disabled={updateStatus.downloadState === "downloading"}
                onClick={() => {
                  if (updateStatus.downloadState === "downloaded") {
                    window.api.installUpdate();
                  } else {
                    window.api.downloadUpdate();
                  }
                }}
              >
                {updateStatus.downloadState === "downloaded"
                  ? "Restart to update"
                  : updateStatus.downloadState === "downloading"
                    ? "Downloading…"
                    : "Update"}
              </button>
            ) : null}
            <button
              type="button"
              className="tavern-head-new"
              title="New conversation"
              disabled={pinned}
              onClick={() => onSwitchThread(newThread())}
            >
              ＋ New
            </button>
            <div className="tavern-window-controls">
              <button
                type="button"
                className="tavern-window-control"
                aria-label="Minimize"
                title="Minimize"
                onClick={() => window.api.panelMinimize()}
              >
                <span aria-hidden="true">−</span>
              </button>
              <button
                type="button"
                className="tavern-window-control"
                aria-label="Maximize or restore"
                title="Maximize or restore"
                onClick={() => window.api.panelToggleMaximize()}
              >
                <span aria-hidden="true">□</span>
              </button>
              <button
                type="button"
                className="tavern-close tavern-window-control"
                aria-label="Close"
                title="Close"
                onClick={() => window.api.panelClose()}
              >
                ×
              </button>
            </div>
          </div>

          <div
            className="tavern-body updated-certificate-body"
            role="tabpanel"
            ref={bodyRef}
          >
            {panelBody}
          </div>

          {chatActive && !settingsOpen && !capabilitiesOpen ? (
            <div className="tavern-composer">
              <div className="tavern-composer-main">
                <button
                  type="button"
                  className="tavern-composer-icon"
                  aria-label="Open tools and attachments"
                  title="Open tools and attachments"
                  onClick={() => setCapabilitiesOpen(true)}
                >
                  <span aria-hidden="true">＋</span>
                </button>
                <textarea
                  id="panel-composer"
                  className="tavern-input"
                  value={draft}
                  rows={1}
                  placeholder="Ask UPDATED anything…"
                  onMouseDown={() => window.api.panelRequestFocus()}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button
                  type="button"
                  className={`tavern-btn tavern-btn-send${action === "stop" ? " is-stop" : ""}`}
                  aria-label={action === "stop" ? "Stop generating" : "Send message"}
                  title={action === "stop" ? "Stop generating" : "Send message"}
                  onClick={action === "stop" ? stopGeneration : send}
                >
                  {action === "stop" ? "■" : "↑"}
                </button>
              </div>
              <div className="tavern-composer-tools">
                <ModelPickerButton
                  value={llmModelId}
                  onChange={setLlmModel}
                  disabled={status === "streaming" || status === "submitted"}
                />
                <button
                  type="button"
                  className="tavern-composer-tool"
                  aria-label="Hold to dictate"
                  title="Hold to dictate"
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    window.api.panelTalkDown();
                  }}
                  onPointerUp={() => window.api.panelTalkUp()}
                  onPointerCancel={() => window.api.panelTalkUp()}
                >
                  <span aria-hidden="true">◉</span>
                  <span>Voice</span>
                </button>
                <button
                  type="button"
                  className={`tavern-composer-tool tavern-composer-tool-music${musicBusy ? " is-active" : ""}`}
                  aria-label="Recognize music"
                  title={musicBusy ? "Listening for music" : "Recognize music"}
                  disabled={musicBusy || busy}
                  onClick={() => void recognizeMusic()}
                >
                  <span aria-hidden="true">{musicBusy ? "◌" : "♫"}</span>
                  <span>{musicBusy ? "Listening…" : "Identify music"}</span>
                </button>
                <span className="tavern-composer-hint">Enter to send · Shift+Enter for a new line</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <PanelTail />
      <PanelResizeHandle />
    </div>
  );
}

initApiBase();
installGlobalErrorHandlers();

const queryClient = createQueryClient();
window.api.onServerChanged(() => {
  void refreshApiBase().then(() => queryClient.invalidateQueries());
});

const container = document.getElementById("root");
if (container)
  createRoot(container).render(
    <QueryClientProvider client={queryClient}>
      <CloudAuthProvider>
        <PanelRoot />
      </CloudAuthProvider>
    </QueryClientProvider>,
  );
