export const SETTINGS_KEYS = {
  advancedMode: "advanced_mode",
  cleanupAppAssignments: "cleanup_app_assignments",
  cleanupCustomPrompt: "cleanup_custom_prompt",
  cleanupEmailTone: "cleanup_email_tone",
  cleanupIntensity: "cleanup_intensity",
  cleanupOverallTone: "cleanup_overall_tone",
  cleanupPersonalTone: "cleanup_personal_tone",
  cleanupWorkTone: "cleanup_work_tone",
  remixHotkey: "remix_hotkey",
  freestyleCloudPanelExpanded: "freestyle_cloud_panel_expanded",
  hotkey: "hotkey",
  hotkeyMode: "hotkey_mode",
  historyPaused: "history_paused",
  historyRetentionDays: "history_retention_days",
  // Legacy singular language key. Kept for one-time migration reads only;
  // the canonical setting is now `languages` (a JSON array of ISO codes).
  language: "language",
  languages: "languages",
  llmCleanup: "llm_cleanup",
  micDeviceId: "mic_device_id",
  networkCaCertPath: "network_ca_cert_path",
  networkProxyUrl: "network_proxy_url",
  outputMode: "output_mode",
  dictationDestination: "dictation_destination",
  soundEnabled: "sound_enabled",
  translateMode: "translate_mode",
  inputMode: "input_mode",
  /** dual (default) | single — Gate 6 provider selection for divergence. */
  searchProviderMode: "search_provider_mode",
  /** Playground-equivalent: chat/cleanup LLM model id */
  llmModel: "llm_model",
  /** UI locale: en|zh|hi|de|es|el|it|fr */
  uiLocale: "ui_locale",
  /** Appearance preset: vasilikos-light|copper-glow|high-contrast|aegean-depth */
  appearancePreset: "appearance_preset",
  /** Accent: copper|cyan */
  appearanceAccent: "appearance_accent",
  /** Text scale: comfortable|large|xlarge — age-friendly readability */
  textScale: "text_scale",
  /** Reduce motion / animations for accessibility */
  reduceMotion: "reduce_motion",
  /** Opt-in native alerts when AGICY arena agents open or close a trade. */
  cryptoTradeNotifications: "crypto_trade_notifications",
  /**
   * Host agent-os tools (Bash/files). Default off — transitional until AGIBOT
   * sandboxes own agency. When on, Bash/Write/Edit still require confirmation.
   */
  agentOsEnabled: "agent_os_enabled",
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];
