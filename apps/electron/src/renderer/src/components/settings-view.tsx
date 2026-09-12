import {
  filterLanguageOptions,
  INDUSTRY_LABELS,
  type Industry,
  industrySchema,
  MAX_LANGUAGES,
  normalizeLanguageList,
  resolveLanguageOptions,
} from "@freestyle-voice/validations";
import { ModelProviderAvatar } from "@renderer/components/model-provider-avatar";
import { applyAppearanceToDocument } from "@renderer/lib/apply-appearance";
import {
  ACCENT_OPTIONS,
  APPEARANCE_PRESETS,
  DEFAULT_LLM_MODEL_ID,
  getUpdatedLlmModel,
  TEXT_SCALE_OPTIONS,
  UI_LOCALES,
  UPDATED_LLM_MODELS,
} from "@renderer/lib/updated-models";
import "../model-picker.css";
import { AuthSignInControls } from "@renderer/components/auth-sign-in";
import { NotificationsHistory } from "@renderer/components/notifications-history";
import {
  acceleratorsEqual,
  formatAcceleratorKeys,
  useHotkeyRecorder,
} from "@renderer/hooks/use-hotkey-recorder";
import { apiFetch } from "@renderer/lib/api";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { LANGUAGES } from "@renderer/lib/languages";
import { queryKeys, settingsQueryOptions } from "@renderer/lib/query";
import { replaceSetting, settingsForView } from "@renderer/lib/settings";
import { useCloudConfig } from "@renderer/lib/use-cloud-config";
import {
  type SocialProvider,
  useLinkedAccounts,
  useLinkSocial,
  useProfileFields,
  useRefreshAccountsOnFocus,
  useUnlinkSocial,
  useUpdateName,
  useUpdateProfileFields,
} from "@renderer/lib/use-profile";
import { SpriteBadge } from "@renderer/sprites/badge";
import {
  type CompanionForm,
  DEFAULT_COMPANION_FORM,
  parseCompanionForm,
} from "@shared/companion";
import type { InputMode } from "@shared/dictation-prefs";
import { getDefaultHotkey } from "@shared/hotkey-defaults";
import { getDefaultRemixHotkey } from "@shared/remix";
import {
  parseInputMode,
  parseSearchProviderMode,
} from "@shared/search-settings";
import { SETTINGS_KEYS } from "@shared/settings-keys";
import { SPRITES_INFO } from "@shared/sprites";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type SettingsPage =
  | "root"
  | "profile"
  | "billing"
  | "notifications"
  | "dictation"
  | "search"
  | "talk"
  | "appearance"
  | "models"
  | "application"
  | "permissions"
  | "data";

const PAGE_TITLES: Record<Exclude<SettingsPage, "root">, string> = {
  profile: "Profile",
  billing: "Billing & Usage",
  notifications: "Notifications",
  dictation: "Dictation",
  search: "Search",
  talk: "Talk & Summon",
  appearance: "Appearance & Language",
  models: "Models",
  application: "Application",
  permissions: "Permissions",
  data: "Data",
};

export function profileAvatarInitial(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  return (name?.trim() || email?.trim() || "?").slice(0, 1).toUpperCase();
}

function ProfileAvatar({
  image,
  name,
  email,
}: {
  image: string | null | undefined;
  name: string | null | undefined;
  email: string | null | undefined;
}): React.JSX.Element {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const src = image && image !== failedImage ? image : null;

  if (src) {
    return (
      <img
        className="tavern-set-avatar"
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailedImage(src)}
      />
    );
  }

  return (
    <span className="tavern-set-avatar is-empty" aria-hidden="true">
      {profileAvatarInitial(name, email)}
    </span>
  );
}

function useServerSettings(): {
  settings: Record<string, string> | null;
  setSetting: (key: string, value: string) => void;
} {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(settingsQueryOptions());
  const update = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await apiFetch(`/api/settings/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!response.ok) throw new Error("Could not save settings.");
    },
    onMutate: async ({ key, value }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.settings });
      const previous = queryClient.getQueryData<Record<string, string>>(
        queryKeys.settings,
      );
      queryClient.setQueryData(
        queryKeys.settings,
        replaceSetting(previous ?? {}, key, value),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKeys.settings, context?.previous);
    },
    onSuccess: (_data, { key }) => {
      window.api.reloadDictationPrefs();
      if (key === SETTINGS_KEYS.remixHotkey) window.api.reloadRemixHotkey();
      if (key === SETTINGS_KEYS.hotkey || key === SETTINGS_KEYS.hotkeyMode) {
        window.api.reloadHotkey();
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
  });

  const setSetting = useCallback(
    (key: string, value: string): void => update.mutate({ key, value }),
    [update],
  );

  return {
    settings: settingsForView(settingsQuery.data, settingsQuery.isError),
    setSetting,
  };
}

function NavRow({
  label,
  detail,
  onClick,
}: {
  label: string;
  detail?: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button type="button" className="tavern-set-row" onClick={onClick}>
      <span className="tavern-set-label">{label}</span>
      <span className="tavern-set-detail">
        {detail ? `${detail} ` : ""}
        <span className="tavern-set-chevron">›</span>
      </span>
    </button>
  );
}

function ChoiceRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className="tavern-set-row is-static">
      <span className="tavern-set-label">{label}</span>
      <div className="tavern-set-seg">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`tavern-set-seg-btn${value === opt.id ? " is-on" : ""}`}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  on,
  disabled,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="tavern-set-row is-static">
      <span className="tavern-set-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        className={`tavern-set-switch${on ? " is-on" : ""}`}
        onClick={() => onChange(!on)}
      >
        <span className="tavern-set-knob" />
      </button>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div className="tavern-set-row is-static">
      <span className="tavern-set-label">{label}</span>
      <span className="tavern-set-detail">{value}</span>
    </div>
  );
}

function ActionRow({
  label,
  action,
  pending,
  danger,
  onClick,
}: {
  label: string;
  action: string;
  pending?: boolean;
  danger?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <div className="tavern-set-row is-static">
      <span className="tavern-set-label">{label}</span>
      <button
        type="button"
        className={`tavern-set-action${danger ? " is-danger" : ""}`}
        disabled={pending}
        onClick={onClick}
      >
        {action}
      </button>
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <div className="tavern-set-row is-static">
      <span className="tavern-set-label">{label}</span>
      <select
        className="tavern-set-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value || "__default__"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SectionLabel({ children }: { children: string }): React.JSX.Element {
  return <div className="tavern-set-section">{children}</div>;
}

function HotkeyRow({
  label,
  accel,
  target,
  isBlocked,
  onSaved,
}: {
  label: string;
  accel: string;
  target: "dictation" | "remix";
  isBlocked: (accel: string) => boolean;
  onSaved: (accel: string) => void;
}): React.JSX.Element {
  const recorder = useHotkeyRecorder(onSaved, { target, isBlocked });
  const recording = recorder.state !== "idle";

  return (
    <div className="tavern-set-row is-static">
      <span className="tavern-set-label">{label}</span>
      {recording ? (
        <span className="tavern-set-keys is-recording">
          {recorder.liveModifiers.length > 0
            ? recorder.liveModifiers.join(" + ")
            : "Press keys…"}
          {recorder.blockedNotice ? " · already taken" : ""}
          {recorder.needsModifierOrMouseButton ? " · add a modifier" : ""}
          <button
            type="button"
            className="tavern-set-keys-cancel"
            onClick={() => recorder.cancelRecording()}
          >
            ×
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="tavern-set-keys"
          onClick={() => recorder.startRecording()}
        >
          {formatAcceleratorKeys(accel).map((k) => (
            <kbd key={k} className="tavern-kbd">
              {k}
            </kbd>
          ))}
          <span className="tavern-set-keys-change">Change</span>
        </button>
      )}
      {!recording && recorder.blockedNotice ? (
        <span className="tavern-set-hint">
          That combination is already taken.
        </span>
      ) : null}
      {!recording && recorder.invalidReleaseNotice ? (
        <span className="tavern-set-hint">Hold a modifier with the key.</span>
      ) : null}
    </div>
  );
}

function AccountCard({
  onOpenProfile,
}: {
  onOpenProfile: () => void;
}): React.JSX.Element {
  const auth = useCloudAuth();

  if (auth.user && auth.phase === "signed_in") {
    return (
      <button
        type="button"
        className="tavern-set-card is-clickable"
        onClick={onOpenProfile}
      >
        <div className="tavern-set-profile">
          <ProfileAvatar
            image={auth.user.image}
            name={auth.user.name}
            email={auth.user.email}
          />
          <div className="tavern-set-profile-text">
            <div className="tavern-set-card-title">
              {auth.user.name || "Signed in"}
            </div>
            <div className="tavern-set-card-sub">{auth.user.email}</div>
            <button
              type="button"
              className="tavern-set-link"
              onClick={(e) => {
                e.stopPropagation();
                void window.api.openExternal("https://agicy.ai/updated/usage");
              }}
            >
              View UPDATED usage
            </button>
          </div>
          <span className="tavern-set-chevron">›</span>
        </div>
      </button>
    );
  }

  return <AuthSignInControls variant="card" />;
}

function SignedOutHint(): React.JSX.Element {
  return (
    <p className="tavern-set-hint">
      Sign in from the Settings home to manage this.
    </p>
  );
}

function NameEditor(): React.JSX.Element {
  const auth = useCloudAuth();
  const updateName = useUpdateName();
  const currentName = auth.user?.name ?? "";
  const [name, setName] = useState(currentName);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const trimmed = name.trim();
  const dirty = trimmed !== currentName.trim();

  const save = (): void => {
    if (!dirty || !trimmed) return;
    setSaved(false);
    updateName
      .mutateAsync(trimmed)
      .then(() => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="tavern-set-field">
      <label className="tavern-set-field-label" htmlFor="tavern-profile-name">
        Name
      </label>
      <div className="tavern-set-field-line">
        <input
          id="tavern-profile-name"
          className="tavern-set-input"
          value={name}
          maxLength={120}
          placeholder="Your name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              e.stopPropagation();
              setName(currentName);
            }
          }}
        />
        {dirty ? (
          <button
            type="button"
            className="tavern-set-action"
            disabled={!trimmed || updateName.isPending}
            onClick={save}
          >
            {updateName.isPending ? "Saving…" : "Save"}
          </button>
        ) : saved ? (
          <span className="tavern-set-saved">✓ Saved</span>
        ) : null}
      </div>
      {updateName.isError ? (
        <p className="tavern-notice">
          {updateName.error instanceof Error
            ? updateName.error.message
            : "Could not update name"}
        </p>
      ) : null}
    </div>
  );
}

const NO_INDUSTRY = "";

function ProfessionalDetails(): React.JSX.Element {
  const { data: profile } = useProfileFields(true);
  const updateProfile = useUpdateProfileFields();
  const [industry, setIndustry] = useState<Industry | "">("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [reseed, setReseed] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const parsed = industrySchema.safeParse(profile.industry);
    setIndustry(parsed.success ? parsed.data : "");
    setJobTitle(profile.jobTitle ?? "");
    setCompany(profile.company ?? "");
    setReseed(true);
  }, [profile]);

  const savedIndustry = industrySchema.safeParse(profile?.industry).success
    ? (profile?.industry as Industry)
    : "";
  const industryWillChange = industry !== savedIndustry && industry !== "";
  const dirty =
    industry !== savedIndustry ||
    jobTitle.trim() !== (profile?.jobTitle ?? "") ||
    company.trim() !== (profile?.company ?? "");

  const save = (): void => {
    if (!dirty) return;
    setSaved(false);
    updateProfile
      .mutateAsync({
        industry: industry === "" ? null : industry,
        jobTitle: jobTitle.trim() || null,
        company: company.trim() || null,
        updatePreferences: reseed,
      })
      .then(() => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <>
      <SectionLabel>Professional details</SectionLabel>
      <div className="tavern-set-field">
        <label
          className="tavern-set-field-label"
          htmlFor="tavern-profile-industry"
        >
          Industry
        </label>
        <select
          id="tavern-profile-industry"
          className="tavern-set-select is-wide"
          value={industry}
          onChange={(e) => setIndustry(e.target.value as Industry | "")}
        >
          <option value={NO_INDUSTRY}>Not specified</option>
          {industrySchema.options.map((value) => (
            <option key={value} value={value}>
              {INDUSTRY_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <div className="tavern-set-field">
        <label className="tavern-set-field-label" htmlFor="tavern-profile-job">
          Job title
        </label>
        <input
          id="tavern-profile-job"
          className="tavern-set-input"
          value={jobTitle}
          maxLength={120}
          placeholder="e.g. Product Manager"
          onChange={(e) => setJobTitle(e.target.value)}
        />
      </div>
      <div className="tavern-set-field">
        <label
          className="tavern-set-field-label"
          htmlFor="tavern-profile-company"
        >
          Company
        </label>
        <input
          id="tavern-profile-company"
          className="tavern-set-input"
          value={company}
          maxLength={120}
          placeholder="e.g. Acme Inc."
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>
      {industryWillChange ? (
        <ToggleRow
          label="Refresh tone & vocabulary for this industry"
          on={reseed}
          onChange={setReseed}
        />
      ) : null}
      {dirty ? (
        <button
          type="button"
          className="tavern-approve-btn tavern-approve-allow"
          disabled={updateProfile.isPending}
          onClick={save}
        >
          {updateProfile.isPending ? "Saving…" : "Save changes"}
        </button>
      ) : saved ? (
        <span className="tavern-set-saved">✓ Saved</span>
      ) : null}
      {updateProfile.isError ? (
        <p className="tavern-notice">
          {updateProfile.error instanceof Error
            ? updateProfile.error.message
            : "Could not update profile"}
        </p>
      ) : null}
    </>
  );
}

const PROVIDERS: Array<{ id: SocialProvider; label: string }> = [
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
];

function ConnectedAccounts(): React.JSX.Element {
  const { data: linked, isLoading } = useLinkedAccounts(true);
  const linkSocial = useLinkSocial();
  const unlinkSocial = useUnlinkSocial();
  useRefreshAccountsOnFocus(true);

  const connectedCount = linked?.length ?? 0;

  return (
    <>
      <SectionLabel>Connected accounts</SectionLabel>
      {isLoading ? (
        <p className="tavern-set-hint">Loading…</p>
      ) : (
        PROVIDERS.map((provider) => {
          const isConnected = linked?.includes(provider.id) ?? false;
          const busy =
            (linkSocial.isPending && linkSocial.variables === provider.id) ||
            (unlinkSocial.isPending && unlinkSocial.variables === provider.id);
          const lastMethod = isConnected && connectedCount <= 1;
          return (
            <div key={provider.id} className="tavern-set-row is-static">
              <span className="tavern-set-label">
                {provider.label}
                {isConnected ? (
                  <span className="tavern-set-check is-ok">✓</span>
                ) : null}
              </span>
              <button
                type="button"
                className="tavern-set-action"
                disabled={busy || lastMethod}
                title={lastMethod ? "Your only sign-in method" : undefined}
                onClick={() =>
                  isConnected
                    ? unlinkSocial.mutate(provider.id)
                    : linkSocial.mutate(provider.id)
                }
              >
                {busy ? "…" : isConnected ? "Disconnect" : "Connect"}
              </button>
            </div>
          );
        })
      )}
    </>
  );
}

function ProfilePage(): React.JSX.Element {
  const auth = useCloudAuth();
  if (!auth.user) return <SignedOutHint />;

  return (
    <>
      <div className="tavern-set-profile">
        <ProfileAvatar
          image={auth.user.image}
          name={auth.user.name}
          email={auth.user.email}
        />
        <div className="tavern-set-profile-text">
          <div className="tavern-set-card-title">
            {auth.user.name || "Signed in"}
          </div>
          <div className="tavern-set-card-sub">{auth.user.email}</div>
        </div>
      </div>
      <NameEditor />
      <ProfessionalDetails />
      <ConnectedAccounts />
      <SectionLabel>Session</SectionLabel>
      <button
        type="button"
        className="tavern-approve-btn"
        onClick={() => void auth.signOut()}
      >
        Sign out
      </button>
    </>
  );
}

function BillingPage(): React.JSX.Element {
  const auth = useCloudAuth();

  if (!auth.user) return <SignedOutHint />;

  return (
    <>
      <p className="tavern-set-hint is-lead">
        Plan and inference credits live on your AGICY account — not inside this
        desktop billing form. Desktop Pro checkout is paused until it uses the
        same Stripe wallet as agicy.ai.
      </p>
      <SectionLabel>UPDATED on agicy.ai</SectionLabel>
      <ActionRow
        label="UPDATED usage"
        action="Open ↗"
        onClick={() =>
          void window.api.openExternal("https://agicy.ai/updated/usage")
        }
      />
      <ActionRow
        label="UPDATED billing"
        action="Open ↗"
        onClick={() =>
          void window.api.openExternal("https://agicy.ai/updated/billing")
        }
      />
      <p className="tavern-set-hint">
        Hosted STT debits your AGICY wallet (shown on UPDATED usage). On-device
        whisper dictation is planned and is not included in this beta.
      </p>
    </>
  );
}

function parseLanguages(
  raw: string | undefined,
  legacy: string | undefined,
): string[] {
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr))
        return arr.filter(
          (x): x is string => typeof x === "string" && x !== "auto",
        );
    } catch {}
  }
  if (legacy && legacy !== "auto") return [legacy];
  return [];
}

function LanguagesEditor({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}): React.JSX.Element {
  const auth = useCloudAuth();
  const { data: cloudConfig } = useCloudConfig(!!auth.user);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const options = useMemo(
    () =>
      resolveLanguageOptions(cloudConfig?.suggestedLanguages, [
        { code: "auto", label: "Auto-detect" },
        ...LANGUAGES.map((l) => ({ code: l.id, label: l.label })),
      ]),
    [cloudConfig?.suggestedLanguages],
  );

  const labelFor = (code: string): string =>
    options.find((o) => o.code === code)?.label ?? code;

  const matches = useMemo(
    () =>
      filterLanguageOptions(options, query).filter(
        (o) => !selected.includes(o.code),
      ),
    [options, query, selected],
  );

  const add = (code: string): void => {
    setAdding(false);
    setQuery("");
    if (code === "auto") {
      onChange([]);
      return;
    }
    onChange([...selected, code].slice(0, MAX_LANGUAGES));
  };

  return (
    <div className="tavern-set-langs">
      <div className="tavern-set-chips">
        {selected.length === 0 ? (
          <span className="tavern-set-chip is-auto">Auto-detect</span>
        ) : (
          selected.map((code) => (
            <span key={code} className="tavern-set-chip">
              {labelFor(code)}
              <button
                type="button"
                className="tavern-set-chip-x"
                aria-label={`Remove ${labelFor(code)}`}
                onClick={() => onChange(selected.filter((c) => c !== code))}
              >
                ×
              </button>
            </span>
          ))
        )}
        {selected.length < MAX_LANGUAGES ? (
          <button
            type="button"
            className="tavern-set-chip is-add"
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? "Done" : "+ Add"}
          </button>
        ) : null}
      </div>
      {adding ? (
        <div className="tavern-set-addlist">
          <input
            ref={(el) => el?.focus()}
            className="tavern-set-input"
            value={query}
            placeholder="Search languages"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setAdding(false);
                setQuery("");
              }
            }}
          />
          <div className="tavern-set-addlist-body">
            {matches.slice(0, 30).map((o) => (
              <button
                key={o.code}
                type="button"
                className="tavern-set-addlist-row"
                onClick={() => add(o.code)}
              >
                {o.label}
              </button>
            ))}
            {matches.length === 0 ? (
              <span className="tavern-set-hint">No matches</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MicrophoneRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (deviceId: string) => void;
}): React.JSX.Element {
  const [devices, setDevices] = useState<
    Array<{ deviceId: string; label: string }>
  >([]);

  useEffect(() => {
    void (async () => {
      try {
        const status = await window.api.checkMicPermission();
        if (status !== "granted") return;
        let inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "audioinput",
        );
        if (inputs.some((d) => !d.label)) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          for (const t of stream.getTracks()) t.stop();
          inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
            (d) => d.kind === "audioinput",
          );
        }
        setDevices(
          inputs.map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`,
          })),
        );
      } catch {}
    })();
  }, []);

  return (
    <SelectRow
      label="Microphone"
      value={value}
      options={[
        { value: "", label: "System default" },
        ...devices.map((d) => ({ value: d.deviceId, label: d.label })),
      ]}
      onChange={onChange}
    />
  );
}

function DictationPage({
  value,
  setSetting,
}: {
  value: (key: string, fallback?: string) => string;
  setSetting: (key: string, value: string) => void;
}): React.JSX.Element {
  const languages = parseLanguages(
    value(SETTINGS_KEYS.languages),
    value(SETTINGS_KEYS.language),
  );
  const translateOn = value(SETTINGS_KEYS.translateMode) === "true";
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  useEffect(() => window.api.onHotkeyError(setHotkeyError), []);

  const setLanguages = (next: string[]): void => {
    const normalized = normalizeLanguageList(next);
    setSetting(SETTINGS_KEYS.languages, JSON.stringify(normalized));
    if (normalized.length !== 1 && translateOn)
      setSetting(SETTINGS_KEYS.translateMode, "false");
  };

  return (
    <>
      <p className="tavern-set-hint is-lead">
        Dictation types for you. Hold the hotkey in any app, speak, and let go —
        your words are cleaned up and typed right where your cursor is.
      </p>
      <SectionLabel>Speech recognition</SectionLabel>
      <p className="tavern-set-hint">
        Hosted voice uses AGICY Deepgram EU and debits your account credits.
        There is no Deepgram API key field in this beta — bring-your-own
        Deepgram is not wired yet. Local whisper (when enabled in your build)
        does not need a cloud key.
      </p>
      <HotkeyRow
        label="Hotkey"
        accel={value(SETTINGS_KEYS.hotkey) || getDefaultHotkey()}
        target="dictation"
        isBlocked={(accel) =>
          acceleratorsEqual(
            accel,
            value(SETTINGS_KEYS.remixHotkey) || getDefaultRemixHotkey(),
          )
        }
        onSaved={(accel) => {
          setHotkeyError(null);
          setSetting(SETTINGS_KEYS.hotkey, accel);
        }}
      />
      {hotkeyError ? <p className="tavern-notice">{hotkeyError}</p> : null}
      <ChoiceRow
        label="Press style"
        value={value(SETTINGS_KEYS.hotkeyMode, "hold")}
        options={[
          { id: "hold", label: "Hold" },
          { id: "toggle", label: "Toggle" },
        ]}
        onChange={(id) => {
          setSetting(SETTINGS_KEYS.hotkeyMode, id);
          window.api.setHotkeyMode(id === "toggle" ? "toggle" : "hold");
        }}
      />
      <MicrophoneRow
        value={value(SETTINGS_KEYS.micDeviceId)}
        onChange={(id) => setSetting(SETTINGS_KEYS.micDeviceId, id)}
      />
      <SectionLabel>Languages</SectionLabel>
      <LanguagesEditor selected={languages} onChange={setLanguages} />
      <ToggleRow
        label="Translate to selected language"
        on={translateOn && languages.length === 1}
        disabled={languages.length !== 1}
        onChange={(next) =>
          setSetting(SETTINGS_KEYS.translateMode, String(next))
        }
      />
      <SectionLabel>Output</SectionLabel>
      <ChoiceRow
        label="Deliver to"
        value={value(SETTINGS_KEYS.dictationDestination, "cursor")}
        options={[
          { id: "cursor", label: "Cursor" },
          { id: "composer", label: "Chat" },
        ]}
        onChange={(id) => setSetting(SETTINGS_KEYS.dictationDestination, id)}
      />
      <ChoiceRow
        label="Method"
        value={value(SETTINGS_KEYS.outputMode, "paste")}
        options={[
          { id: "paste", label: "Paste" },
          { id: "clipboard", label: "Clipboard" },
        ]}
        onChange={(id) => setSetting(SETTINGS_KEYS.outputMode, id)}
      />
      <SectionLabel>Sound</SectionLabel>
      <ToggleRow
        label="Start & stop sounds"
        on={value(SETTINGS_KEYS.soundEnabled, "true") !== "false"}
        onChange={(next) =>
          setSetting(SETTINGS_KEYS.soundEnabled, next ? "true" : "false")
        }
      />
      <ChoiceRow
        label="Other audio"
        value={value("audio_playback_mode", "off")}
        options={[
          { id: "off", label: "Leave" },
          { id: "duck", label: "Duck" },
          { id: "pause", label: "Pause" },
        ]}
        onChange={(id) => setSetting("audio_playback_mode", id)}
      />
    </>
  );
}

function SearchPage({
  value,
  setSetting,
}: {
  value: (key: string, fallback?: string) => string;
  setSetting: (key: string, value: string) => void;
}): React.JSX.Element {
  const inputMode = parseInputMode(value(SETTINGS_KEYS.inputMode));
  const providerMode = parseSearchProviderMode(
    value(SETTINGS_KEYS.searchProviderMode),
  );
  const [keyStatus, setKeyStatus] = useState<{
    configured: boolean;
    encryptionAvailable: boolean;
  } | null>(null);
  const [braveDraft, setBraveDraft] = useState("");
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string>("");
  const [logMessage, setLogMessage] = useState<string | null>(null);
  const [egressPath, setEgressPath] = useState<string>("");
  const [egressEvents, setEgressEvents] = useState<
    Array<{
      timestamp: string;
      category: string;
      destination: string;
      status: number | null;
      requestBytes: number | null;
      authorization: string;
      surface: string;
    }>
  >([]);

  const refreshKeyStatus = useCallback((): void => {
    void window.api
      .getSearchKeyStatus()
      .then((status) =>
        setKeyStatus({
          configured: status.configured,
          encryptionAvailable: status.encryptionAvailable,
        }),
      )
      .catch(() => setKeyStatus(null));
  }, []);

  const refreshEgress = useCallback((): void => {
    void apiFetch("/api/transparency/egress?limit=12")
      .then(async (response) => {
        if (!response.ok) throw new Error("ledger-unavailable");
        return (await response.json()) as {
          path?: string;
          events?: typeof egressEvents;
        };
      })
      .then((payload) => {
        setEgressPath(payload.path ?? "");
        setEgressEvents(payload.events ?? []);
      })
      .catch(() => {
        setEgressPath("");
        setEgressEvents([]);
      });
  }, []);

  useEffect(() => {
    refreshKeyStatus();
    void window.api
      .getDivergenceLogPath()
      .then(setLogPath)
      .catch(() => setLogPath(""));
    refreshEgress();
  }, [refreshEgress, refreshKeyStatus]);

  const setInputMode = (mode: InputMode): void => {
    setSetting(SETTINGS_KEYS.inputMode, mode);
    void window.api.setInputMode(mode);
  };

  const saveBraveKey = (): void => {
    const trimmed = braveDraft.trim();
    if (!trimmed) {
      setKeyMessage("Enter a Brave Search API key.");
      return;
    }
    void window.api.setBraveSearchKey(trimmed).then((ok) => {
      if (ok) {
        setBraveDraft("");
        setKeyMessage("Brave key saved to encrypted storage.");
        refreshKeyStatus();
      } else {
        setKeyMessage(
          keyStatus?.encryptionAvailable === false
            ? "Encrypted storage is unavailable on this system."
            : "Could not save Brave key.",
        );
      }
    });
  };

  const clearBraveKey = (): void => {
    void window.api.clearBraveSearchKey().then((ok) => {
      setKeyMessage(ok ? "Brave key cleared." : "Could not clear Brave key.");
      refreshKeyStatus();
    });
  };

  const revealLog = (): void => {
    void window.api.revealDivergenceLog().then((result) => {
      if (result.ok) {
        setLogPath(result.path);
        setLogMessage("Opened divergence log in file manager.");
      } else {
        setLogMessage(result.error);
      }
    });
  };

  const copyLogPath = (): void => {
    void navigator.clipboard.writeText(logPath).then(
      () => setLogMessage("Log path copied."),
      () => setLogMessage("Could not copy path."),
    );
  };

  return (
    <>
      <p className="tavern-set-hint is-lead">
        Search mode routes the hotkey transcript to certificate results instead
        of pasting. Keys stay in encrypted OS storage — never in SQLite.
      </p>

      <SectionLabel>Input mode</SectionLabel>
      <ChoiceRow
        label="Hotkey delivers"
        value={inputMode}
        options={[
          { id: "dictation", label: "Dictation" },
          { id: "search", label: "Search" },
        ]}
        onChange={(id) =>
          setInputMode(id === "search" ? "search" : "dictation")
        }
      />

      <SectionLabel>Providers</SectionLabel>
      <ChoiceRow
        label="Provider set"
        value={providerMode}
        options={[
          { id: "dual", label: "Dual" },
          { id: "single", label: "Single" },
        ]}
        onChange={(id) =>
          setSetting(
            SETTINGS_KEYS.searchProviderMode,
            id === "single" ? "single" : "dual",
          )
        }
      />
      <p className="tavern-set-hint">
        Dual runs two providers and surfaces CONTESTED when they diverge. Single
        disables divergence pairing.
      </p>

      <SectionLabel>Brave Search (BYOK)</SectionLabel>
      <p className="tavern-set-hint">
        Paste your own Brave Search API key for live web results. Keys stay in
        encrypted OS storage — never in SQLite. Without a key, production
        search is unavailable; mock providers are for local demos only.
      </p>
      <InfoRow
        label="Key status"
        value={
          keyStatus === null
            ? "…"
            : keyStatus.configured
              ? "Configured"
              : "Not set"
        }
      />
      <div className="tavern-set-row is-static">
        <span className="tavern-set-label">API key</span>
        <input
          className="tavern-set-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste Brave Search key"
          value={braveDraft}
          onChange={(event) => setBraveDraft(event.target.value)}
        />
      </div>
      <div className="tavern-set-row is-static">
        <span className="tavern-set-label" />
        <div className="tavern-set-seg">
          <button
            type="button"
            className="tavern-set-seg-btn"
            onClick={saveBraveKey}
          >
            Save
          </button>
          <button
            type="button"
            className="tavern-set-seg-btn"
            onClick={clearBraveKey}
            disabled={!keyStatus?.configured}
          >
            Clear
          </button>
        </div>
      </div>
      {keyMessage ? <p className="tavern-set-hint">{keyMessage}</p> : null}

      <SectionLabel>Divergence log</SectionLabel>
      <ActionRow label="Reveal JSONL log" action="Open" onClick={revealLog} />
      <ActionRow label="Copy log path" action="Copy" onClick={copyLogPath} />
      {logPath ? (
        <p className="tavern-set-hint tavern-mono">{logPath}</p>
      ) : null}
      {logMessage ? <p className="tavern-set-hint">{logMessage}</p> : null}

      <SectionLabel>Transparency ledger</SectionLabel>
      <p className="tavern-set-hint">
        UPDATED records destination, category, size, status, and authorization
        for outbound requests. It never stores audio, transcripts, API keys, or
        search text.
      </p>
      <ActionRow
        label="Refresh egress activity"
        action="Refresh"
        onClick={refreshEgress}
      />
      {egressEvents.length === 0 ? (
        <p className="tavern-set-hint">No outbound activity recorded yet.</p>
      ) : (
        <div className="tavern-set-ledger" role="list" aria-label="Recent outbound activity">
          {egressEvents.map((event, index) => (
            <div className="tavern-set-ledger-row" role="listitem" key={`${event.timestamp}-${index}`}>
              <span>
                {event.category} · {event.surface}
              </span>
              <span>
                {event.destination} · {event.status ?? "—"} · {event.requestBytes ?? 0} B
              </span>
            </div>
          ))}
        </div>
      )}
      {egressPath ? <p className="tavern-set-hint tavern-mono">{egressPath}</p> : null}
    </>
  );
}

function ApplicationPage({
  onReplayIntro,
  value,
  setSetting,
}: {
  onReplayIntro: () => void;
  value: (key: string, fallback?: string) => string;
  setSetting: (key: string, value: string) => void;
}): React.JSX.Element {
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [companionForm, setCompanionForm] = useState<CompanionForm>(
    DEFAULT_COMPANION_FORM,
  );
  const [companionEnabled, setCompanionEnabled] = useState(false);
  const [version, setVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "none" }
    | { kind: "failed" }
    | { kind: "available"; version: string; downloaded: boolean }
  >({ kind: "idle" });
  const agentOsEnabled =
    value(SETTINGS_KEYS.agentOsEnabled, "false") === "true";

  useEffect(() => {
    void window.api
      .getLaunchAtStartup()
      .then(setLaunchAtStartup)
      .catch(() => {});
    void window.api
      .getAutoUpdate()
      .then(setAutoUpdate)
      .catch(() => {});
    void window.api
      .getAppVersion()
      .then(setVersion)
      .catch(() => {});
    void window.api
      .companionForm()
      .then(setCompanionForm)
      .catch(() => {});
    void window.api
      .getCompanionEnabled()
      .then(setCompanionEnabled)
      .catch(() => {});
    const offForm = window.api.onCompanionForm(setCompanionForm);
    const offEnabled = window.api.onCompanionEnabled(setCompanionEnabled);
    return () => {
      offForm?.();
      offEnabled?.();
    };
  }, []);

  const checkForUpdates = (): void => {
    setUpdateStatus({ kind: "checking" });
    void window.api
      .checkForUpdate()
      .then((result) => {
        setUpdateStatus(
          result
            ? {
                kind: "available",
                version: result.version,
                downloaded: result.downloadState === "downloaded",
              }
            : { kind: "none" },
        );
      })
      .catch(() => setUpdateStatus({ kind: "failed" }));
  };

  return (
    <>
      <SectionLabel>Widget</SectionLabel>
      <ToggleRow
        label="Show desktop companion"
        on={companionEnabled}
        onChange={(next) => {
          setCompanionEnabled(next);
          window.api.setCompanionEnabled(next);
        }}
      />
      <p className="tavern-set-hint">
        Optional floating sprite in the screen corner. Off by default — UPDATED
        is voice-first; hold the hotkey without a companion.
      </p>
      {companionEnabled ? (
        <>
          <div className="tavern-set-row is-static">
            <span className="tavern-set-label">Sprite</span>
            <div className="tavern-sprite-pick">
              {Object.values(SPRITES_INFO).map((s) => {
                const id = parseCompanionForm(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`tavern-sprite-pick-btn${
                      companionForm === id ? " is-on" : ""
                    }`}
                    onClick={() => {
                      setCompanionForm(id);
                      window.api.setCompanionForm(id);
                    }}
                  >
                    <SpriteBadge form={id} size={24} />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
          <ActionRow label="Intro" action="Replay" onClick={onReplayIntro} />
          <p className="tavern-set-hint">
            Replay the first-run intro for the selected sprite.
          </p>
        </>
      ) : null}
      <SectionLabel>App</SectionLabel>
      <ToggleRow
        label="Enable host agent tools"
        on={agentOsEnabled}
        onChange={(next) =>
          setSetting(SETTINGS_KEYS.agentOsEnabled, next ? "true" : "false")
        }
      />
      <p className="tavern-set-hint">
        Off by default. When on, Bash / Write / Edit still ask for confirmation
        and only touch ~/.updated/agent-workspace. Sandboxed agency belongs in
        AGIBOT — this host path is transitional.
      </p>
      <ToggleRow
        label="Launch at login"
        on={launchAtStartup}
        onChange={(next) => {
          setLaunchAtStartup(next);
          window.api.setLaunchAtStartup(next);
        }}
      />
      <ToggleRow
        label="Install updates automatically"
        on={autoUpdate}
        onChange={(next) => {
          setAutoUpdate(next);
          window.api.setAutoUpdate(next);
        }}
      />
      <ActionRow
        label={
          updateStatus.kind === "none"
            ? "Up to date"
            : updateStatus.kind === "failed"
              ? "Couldn't check for updates"
              : updateStatus.kind === "available"
                ? `v${updateStatus.version} available`
                : "Updates"
        }
        action={updateStatus.kind === "checking" ? "Checking…" : "Check now"}
        pending={updateStatus.kind === "checking"}
        onClick={checkForUpdates}
      />
      {updateStatus.kind === "available" ? (
        <button
          type="button"
          className="tavern-approve-btn tavern-approve-allow"
          onClick={() => {
            if (updateStatus.downloaded) window.api.installUpdate();
            else window.api.downloadUpdate();
          }}
        >
          {updateStatus.downloaded ? "Restart to update" : "Download update"}
        </button>
      ) : null}
      {version ? <InfoRow label="Version" value={`v${version}`} /> : null}
    </>
  );
}

function PermissionMark({
  state,
}: {
  state: "ok" | "no" | "wait";
}): React.JSX.Element {
  return (
    <span className={`tavern-set-check is-${state}`}>
      {state === "ok" ? "✓" : state === "no" ? "✕" : "…"}
    </span>
  );
}

function PermissionsPage(): React.JSX.Element {
  const [mic, setMic] = useState<string | null>(null);
  const [ax, setAx] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = (): void => {
      void window.api
        .checkMicPermission()
        .then((v) => alive && setMic(v))
        .catch(() => {});
      void window.api
        .checkAccessibilityPermission()
        .then((v) => alive && setAx(v))
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <>
      <div className="tavern-set-row is-static">
        <span className="tavern-set-label">
          Microphone
          <PermissionMark
            state={mic === "granted" ? "ok" : mic === null ? "wait" : "no"}
          />
        </span>
        {mic !== null && mic !== "granted" ? (
          <button
            type="button"
            className="tavern-set-action"
            onClick={() => {
              if (mic === "denied") window.api.openMicSettings();
              else void window.api.requestMicPermission();
            }}
          >
            {mic === "denied" ? "Open Settings ↗" : "Allow"}
          </button>
        ) : null}
      </div>
      <p className="tavern-set-hint">Needed to hear you dictate and talk.</p>
      <div className="tavern-set-row is-static">
        <span className="tavern-set-label">
          Accessibility
          <PermissionMark
            state={ax === true ? "ok" : ax === null ? "wait" : "no"}
          />
        </span>
        {ax === false ? (
          <button
            type="button"
            className="tavern-set-action"
            onClick={() => window.api.openAccessibilitySettings()}
          >
            Open Settings ↗
          </button>
        ) : null}
      </div>
      <p className="tavern-set-hint">
        Needed to paste text at your cursor and read what you've highlighted.
      </p>
    </>
  );
}

function DataPage({
  onThreadsCleared,
}: {
  onThreadsCleared: () => void;
}): React.JSX.Element {
  const [clearingChats, setClearingChats] = useState(false);
  const [clearingBrain, setClearingBrain] = useState(false);
  const [brainCleared, setBrainCleared] = useState(false);
  const [exporting, setExporting] = useState(false);

  const clearChats = (): void => {
    if (!window.confirm("Delete every conversation? This can't be undone."))
      return;
    setClearingChats(true);
    void apiFetch("/api/agent/thread/clear", { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("clear failed");
        onThreadsCleared();
      })
      .catch(() => {})
      .finally(() => setClearingChats(false));
  };

  const clearBrain = (): void => {
    if (
      !window.confirm(
        "Erase every brain file — memories, notes, and todos? Export a copy first if you want one. This can't be undone.",
      )
    )
      return;
    setClearingBrain(true);
    void apiFetch("/api/brain/clear", { method: "POST" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
        } | null;
        if (!res.ok || !data?.ok) throw new Error("clear failed");
        setBrainCleared(true);
        window.setTimeout(() => setBrainCleared(false), 2000);
      })
      .catch(() => {})
      .finally(() => setClearingBrain(false));
  };

  const exportBrain = (): void => {
    setExporting(true);
    void apiFetch("/api/brain/export")
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          files?: Array<{ path: string; content: string }>;
        };
        if (!data.ok || !data.files) throw new Error("export failed");
        const blob = new Blob([JSON.stringify(data.files, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "updated-brain.json";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {})
      .finally(() => setExporting(false));
  };

  return (
    <>
      <SectionLabel>Chats</SectionLabel>
      <ActionRow
        label="Clear chat history"
        action={clearingChats ? "Clearing…" : "Clear…"}
        pending={clearingChats}
        danger
        onClick={clearChats}
      />
      <p className="tavern-set-hint">
        Deletes every conversation on this Mac and starts fresh.
      </p>
      <SectionLabel>Brain</SectionLabel>
      <ActionRow
        label="Export your brain"
        action={exporting ? "Exporting…" : "Download"}
        pending={exporting}
        onClick={exportBrain}
      />
      <ActionRow
        label={brainCleared ? "Brain cleared" : "Clear brain"}
        action={clearingBrain ? "Clearing…" : "Clear…"}
        pending={clearingBrain}
        danger
        onClick={clearBrain}
      />
      <p className="tavern-set-hint">
        Erases every memory, note, and todo from your brain in the cloud.
      </p>
      <SectionLabel>Diagnostics</SectionLabel>
      <ActionRow
        label="Log files"
        action="Open folder"
        onClick={() => void window.api.openLogsFolder()}
      />
    </>
  );
}

function AppearancePage({
  value,
  setSetting,
}: {
  value: (key: string, fallback?: string) => string;
  setSetting: (key: string, value: string) => void;
}): React.JSX.Element {
  const preset = value(SETTINGS_KEYS.appearancePreset, "vasilikos-light");
  const accent = value(SETTINGS_KEYS.appearanceAccent, "copper");
  const textScale = value(SETTINGS_KEYS.textScale, "comfortable");
  const uiLocale = value(SETTINGS_KEYS.uiLocale, "en");
  const reduceMotion = value(SETTINGS_KEYS.reduceMotion, "false") === "true";

  useEffect(() => {
    applyAppearanceToDocument({
      preset,
      accent,
      textScale,
      uiLocale,
      reduceMotion,
    });
  }, [preset, accent, textScale, uiLocale, reduceMotion]);

  return (
    <>
      <p className="tavern-set-hint is-lead">
        Colors follow AGICY playground (Vasilikos paper + copper). Larger text
        and high contrast help older readers; language picks the panel UI locale
        shared with agicy.ai/updated.
      </p>
      <SectionLabel>Theme</SectionLabel>
      {APPEARANCE_PRESETS.map((p) => (
        <AppearanceChoiceRow
          key={p.id}
          label={p.label}
          detail={p.note}
          selected={preset === p.id}
          onSelect={() => setSetting(SETTINGS_KEYS.appearancePreset, p.id)}
        />
      ))}
      <SectionLabel>Accent</SectionLabel>
      <div className="tavern-set-row is-static">
        <span className="tavern-set-label">Accent color</span>
        <div className="tavern-sprite-pick">
          {ACCENT_OPTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`tavern-sprite-pick-btn${accent === a.id ? " is-on" : ""}`}
              onClick={() => setSetting(SETTINGS_KEYS.appearanceAccent, a.id)}
            >
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: a.color,
                  display: "inline-block",
                }}
              />
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <SectionLabel>Text size</SectionLabel>
      {TEXT_SCALE_OPTIONS.map((t) => (
        <AppearanceChoiceRow
          key={t.id}
          label={t.label}
          detail={t.note}
          selected={textScale === t.id}
          onSelect={() => setSetting(SETTINGS_KEYS.textScale, t.id)}
        />
      ))}
      <SectionLabel>Language</SectionLabel>
      <p className="tavern-set-hint">
        Panel language (eight hub languages). Dictation languages stay under
        Dictation.
      </p>
      <div className="tavern-sprite-pick" style={{ flexWrap: "wrap" }}>
        {UI_LOCALES.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`tavern-sprite-pick-btn${uiLocale === l.id ? " is-on" : ""}`}
            onClick={() => setSetting(SETTINGS_KEYS.uiLocale, l.id)}
          >
            {l.nativeLabel}
          </button>
        ))}
      </div>
      <SectionLabel>Motion</SectionLabel>
      <ToggleRow
        label="Reduce motion"
        on={reduceMotion}
        onChange={(next) =>
          setSetting(SETTINGS_KEYS.reduceMotion, next ? "true" : "false")
        }
      />
      <p className="tavern-set-hint">
        Softens animations for vestibular sensitivity and
        prefers-reduced-motion.
      </p>
    </>
  );
}

function ModelsPage({
  value,
  setSetting,
}: {
  value: (key: string, fallback?: string) => string;
  setSetting: (key: string, value: string) => void;
}): React.JSX.Element {
  const selected = value(SETTINGS_KEYS.llmModel, DEFAULT_LLM_MODEL_ID);
  const active = getUpdatedLlmModel(selected);

  return (
    <>
      <p className="tavern-set-hint is-lead">
        Same provider marks as the playground composer. AGICY Auto is a routing
        label for forthcoming model selection; pick a specific model for cleanup
        and chat today.
      </p>
      <SectionLabel>Active model</SectionLabel>
      <div className="tavern-set-row is-static">
        <span className="tavern-set-label">Current</span>
        <span
          className="tavern-set-value"
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <ModelProviderAvatar model={active} size={20} />
          {active.name}
        </span>
      </div>
      <SectionLabel>Models</SectionLabel>
      <ul className="updated-model-picker-list" style={{ maxHeight: "none" }}>
        {UPDATED_LLM_MODELS.map((m) => {
          const on = m.apiId === active.apiId;
          return (
            <li key={m.apiId}>
              <button
                type="button"
                className={`updated-model-picker-option${on ? " is-selected" : ""}`}
                onClick={() => setSetting(SETTINGS_KEYS.llmModel, m.apiId)}
              >
                <ModelProviderAvatar model={m} size={22} />
                <span className="updated-model-picker-option-text">
                  <span className="updated-model-picker-option-name">
                    {m.name}
                  </span>
                  <span className="updated-model-picker-option-meta">
                    {m.provider}
                    {m.note ? ` · ${m.note}` : ` · ${m.tier}`}
                  </span>
                </span>
                {on ? (
                  <span className="updated-model-picker-check" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="tavern-set-hint">
        Voice STT stays on AGICY hosted Deepgram EU (account credits). This list
        is for LLM cleanup and chat via AGICY — desktop does not accept OpenAI /
        Anthropic / etc. API keys yet. Manage connectors and any vault keys on{" "}
        <button
          type="button"
          className="tavern-set-link"
          onClick={() =>
            void window.api.openExternal("https://agicy.ai/dashboard")
          }
        >
          agicy.ai/dashboard
        </button>
        .
      </p>
      <SectionLabel>Bring your own keys</SectionLabel>
      <p className="tavern-set-hint">
        In this desktop beta you can BYOK <strong>Brave Search</strong> under
        Settings → Search. LLM and Deepgram BYOK are not available in-app yet.
      </p>
    </>
  );
}

function AppearanceChoiceRow({
  label,
  detail,
  selected,
  onSelect,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`tavern-set-row${selected ? " is-on" : ""}`}
      onClick={onSelect}
      style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
    >
      <span className="tavern-set-label">{label}</span>
      {detail ? <span className="tavern-set-value">{detail}</span> : null}
    </button>
  );
}

export function SettingsView({
  onClose,
  onThreadsCleared,
  onReplayIntro,
  onOpenThread,
}: {
  onClose: () => void;
  onThreadsCleared: () => void;
  onReplayIntro: () => void;
  onOpenThread?: (threadId: string) => void;
}): React.JSX.Element {
  const [page, setPage] = useState<SettingsPage>("root");
  const { settings, setSetting } = useServerSettings();
  const [version, setVersion] = useState("");

  useEffect(() => {
    void window.api
      .getAppVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  if (settings === null)
    return <div className="tavern-empty">Loading settings…</div>;

  const value = (key: string, fallback = ""): string =>
    settings[key] ?? fallback;

  if (page !== "root") {
    return (
      <>
        <button
          type="button"
          className="tavern-file-back"
          onClick={() => setPage("root")}
        >
          ← {PAGE_TITLES[page]}
        </button>
        {page === "profile" ? (
          <ProfilePage />
        ) : page === "billing" ? (
          <BillingPage />
        ) : page === "notifications" ? (
          <>
            <SectionLabel>History</SectionLabel>
            <NotificationsHistory {...(onOpenThread ? { onOpenThread } : {})} />
          </>
        ) : page === "dictation" ? (
          <DictationPage value={value} setSetting={setSetting} />
        ) : page === "search" ? (
          <SearchPage value={value} setSetting={setSetting} />
        ) : page === "talk" ? (
          <>
            <p className="tavern-set-hint is-lead">
              Talking is how you ask UPDATED to do things. Hold the talk key,
              say what you need, and it lands in the chat when you let go — the
              agent takes it from there. Summon opens this panel from anywhere.
            </p>
            <HotkeyRow
              label="Talk to UPDATED"
              accel={
                value(SETTINGS_KEYS.remixHotkey) || getDefaultRemixHotkey()
              }
              target="remix"
              isBlocked={(accel) =>
                acceleratorsEqual(
                  accel,
                  value(SETTINGS_KEYS.hotkey) || getDefaultHotkey(),
                )
              }
              onSaved={(accel) => setSetting(SETTINGS_KEYS.remixHotkey, accel)}
            />
            <InfoRow label="Summon the panel" value="⌥ Space" />
          </>
        ) : page === "appearance" ? (
          <AppearancePage value={value} setSetting={setSetting} />
        ) : page === "models" ? (
          <ModelsPage value={value} setSetting={setSetting} />
        ) : page === "application" ? (
          <ApplicationPage
            onReplayIntro={onReplayIntro}
            value={value}
            setSetting={setSetting}
          />
        ) : page === "permissions" ? (
          <PermissionsPage />
        ) : (
          <DataPage onThreadsCleared={onThreadsCleared} />
        )}
      </>
    );
  }

  return (
    <>
      <button type="button" className="tavern-file-back" onClick={onClose}>
        ← Settings
      </button>
      <AccountCard onOpenProfile={() => setPage("profile")} />
      <NavRow label="Billing & Usage" onClick={() => setPage("billing")} />
      <NavRow label="Notifications" onClick={() => setPage("notifications")} />
      <NavRow
        label="Dictation"
        detail={value(SETTINGS_KEYS.hotkey) || getDefaultHotkey()}
        onClick={() => setPage("dictation")}
      />
      <NavRow
        label="Search"
        detail={
          parseInputMode(value(SETTINGS_KEYS.inputMode)) === "search"
            ? "Search mode"
            : "Dictation mode"
        }
        onClick={() => setPage("search")}
      />
      <NavRow
        label="Talk & Summon"
        detail={value(SETTINGS_KEYS.remixHotkey) || getDefaultRemixHotkey()}
        onClick={() => setPage("talk")}
      />
      <NavRow
        label="Models"
        detail={
          getUpdatedLlmModel(
            value(SETTINGS_KEYS.llmModel, DEFAULT_LLM_MODEL_ID),
          ).name
        }
        onClick={() => setPage("models")}
      />
      <NavRow
        label="Appearance & Language"
        detail={value(SETTINGS_KEYS.uiLocale, "en").toUpperCase()}
        onClick={() => setPage("appearance")}
      />
      <NavRow label="Application" onClick={() => setPage("application")} />
      <NavRow label="Permissions" onClick={() => setPage("permissions")} />
      <NavRow label="Data" onClick={() => setPage("data")} />
      {version ? (
        <div className="tavern-set-version">UPDATED v{version}</div>
      ) : null}
    </>
  );
}
