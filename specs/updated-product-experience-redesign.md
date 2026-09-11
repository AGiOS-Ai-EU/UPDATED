# UPDATED — End-to-End Product Experience Redesign

Status: design foundation · 2026-09-11  
Branch: `codex/award-winning-product-redesign`

## 1. Product thesis

UPDATED is the desktop intelligence layer that lets a person speak or type a
question, receive an evidence-backed answer, and act on that answer in the app
where they are already working.

The product is not “another chat window” and not merely “voice dictation.” Its
distinctive promise is:

> Ask naturally. See what is known, uncertain, or contested. Act without losing
> your place.

The product must make three things feel unusually good:

1. **Capture** — voice is immediate, visible, interruptible, and recoverable.
2. **Trust** — every important claim exposes its evidence and uncertainty.
3. **Action** — useful output can be inserted, transformed, copied, or continued
   without forcing the user through a dashboard.

## 2. Real problems to solve

### Knowledge workers

- Search returns links, while chat returns prose whose provenance is difficult to
  inspect.
- Research interrupts the current task through tab switching and context loss.
- Voice tools often fail silently, transcribe inaccurately, or paste into the
  wrong place.
- AI products expose providers, models, keys, and technical settings before the
  user has experienced value.
- A long answer gives no fast indication of what is primary, independent,
  recent, weak, or disputed.

### Regulated and evidence-sensitive teams

- They need a reproducible answer trail rather than an attractive summary.
- They need to distinguish direct evidence from commentary and aggregation.
- They cannot accept fabricated fallback results or hidden provider failures.
- They need clear data-boundary, retention, and local/cloud indicators.

### Accessibility and mobility

- Users with repetitive-strain, vision, reading, language, or motor constraints
  need keyboard-first and voice-first operation without losing full control.
- Error recovery must never depend on color, hover, or a tiny transient toast.

## 3. Target users and jobs

### Beta wedge

Primary beta user: **evidence-sensitive professionals** in legal, compliance,
finance, policy, research, and executive operations.

Reason: they feel the strongest pain from unsupported AI answers, browser-tab
research drift, and unverifiable pasted output. If UPDATED wins trust here, the
lighter knowledge-worker version becomes easier rather than harder.

### The focused professional

“Help me answer, rewrite, compare, or verify something without leaving the app
I am using.”

### The evidence-led researcher

“Show me the answer, the strongest sources, the disagreements, and what remains
unknown.”

### The privacy-conscious operator

“Let me know where processing happens, what is stored, and how to keep sensitive
work local.”

### The accessibility-first user

“Let me operate the product reliably by voice, keyboard, switch control, or
screen reader.”

## 4. Brand system

### Name architecture

- Product: **UPDATED**
- Endorsement: **by AGICY.AI**
- Spoken shorthand: “Updated”
- Descriptor: **Evidence-first desktop intelligence**

The product should not retain visible Freestyle naming. “Freestyle” may remain
in internal package identifiers only until a safe technical migration is made.

### Brand idea: the living margin

UPDATED behaves like a beautifully edited research document whose margin comes
alive: sources, uncertainty, actions, and history sit beside the answer rather
than being buried under it.

### Voice

- Precise, calm, candid, and useful.
- State uncertainty directly: “Two sources disagree on the date.”
- State system limitations directly: “The second provider did not respond.”
- Never claim agreement from one provider.
- Never celebrate routine actions with exclamation marks or confetti.

### Visual direction: editorial instrument

Keep the warm-paper foundation, serif display voice, mono evidence metadata,
and restrained olive accent. Evolve it with:

- stronger information hierarchy;
- an evidence rail that reads like annotated research;
- a single animated “signal line” representing listening, searching, and
  reasoning states;
- deliberate use of whitespace as a confidence signal;
- subtle spatial continuity between the desktop pill and the full workspace.

The identity should feel closer to a premium editorial tool and scientific
instrument than a SaaS dashboard.

## 5. Product architecture

The product has three connected surfaces.

### 5.1 The Capture Pill

The pill is the fastest path and appears over the user’s current app.

States:

`ready → requesting permission → listening → transcribing → researching → answer/action → delivered`

Requirements:

- The first useful feedback appears in under 100 ms.
- Capture-to-answer has measured p50 and p95 budgets for STT, retrieval, model
  response, evidence assessment, and final render.
- Live level confirms that the correct microphone is hearing the user.
- Elapsed time and a visible Stop action are always available.
- Escape cancels. Releasing the configured key submits.
- Empty audio, denial, offline state, timeout, and service failure each have a
  distinct recovery action.
- Paste/replace never reports a verified success unless delivery is confirmed.
- If the original app anchor is lost, the result goes to clipboard and says so.

Delivery states:

- **Verified** — accessibility read-back or app adapter confirms the inserted
  text matches the intended output.
- **Dispatched** — input was sent, but the target app cannot be read back.
- **Clipboard** — UPDATED could not safely write, so the result is on the
  clipboard for manual paste.

### 5.2 The Answer Sheet

A compact side sheet opens when an answer needs inspection or follow-up.

It contains:

- a one-sentence direct answer;
- a structured explanation sized to the question;
- inline claim markers;
- a source stack grouped as Primary, Independent, Context, or Disputed;
- an honest provider-health note;
- actions: Insert, Replace selection, Copy, Open source, Continue;
- a persistent “What is uncertain?” control when confidence is limited.

### 5.3 The Research Workspace

The full desktop window is for history, deeper comparison, configuration, and
audit—not the mandatory starting point.

Primary navigation:

1. **Today** — recent questions, dictations, and actions as a coherent timeline.
2. **Research** — saved evidence threads and source comparison.
3. **Library** — vocabulary, reusable formats, and saved instructions.
4. **Automations** — scheduled or repeated work with clear permissions.
5. **Settings** — devices, privacy, providers, accessibility, and advanced
   controls.

Models and providers are not primary navigation. They belong in Settings > AI
and are summarized in plain language.

## 6. Core end-to-end flows

### First run

1. Promise: “Ask, verify, and write anywhere.”
2. Choose language(s), microphone, and hold/toggle interaction.
3. Explain processing boundary with one honest Local / AGICY Cloud choice.
4. Request microphone and accessibility permissions at the moment they are used.
5. Run a practice task in a safe simulated document.
6. Confirm the first successful delivery.
7. Offer advanced model/provider control only after success.

Success metric: installation to first successful output in under three minutes,
without requiring a model decision.

### Ask and verify

1. Hold the shortcut and ask a question.
2. Pill shows listening, then source discovery progress.
3. Direct answer appears first with per-claim verification states.
4. Evidence markers reveal supporting and disputing sources.
5. User inserts the answer or opens the Answer Sheet for deeper inspection.

Claims may be `pending verification`, `verified`, `contested`, `unsupported`,
or `unassessed`. Insert waits for verified/contested/unassessed labels to be
rendered, or clearly marks pending claims in the inserted text.

### Transform selected text

1. Select text in any app.
2. Invoke UPDATED and say “Make this shorter for the board.”
3. Preview the exact change as a compact diff.
4. Replace, copy, or cancel.
5. A short-lived Undo remains available only while no user input has occurred
   since the replace. After that, UPDATED offers restore-original-to-clipboard.

### Continue a research thread

1. Open the Answer Sheet from a prior result.
2. Ask a follow-up by voice or text.
3. The product shows whether new sources changed the conclusion.
4. Save the thread only when the user names or pins it.

## 7. Trust model

Every answer must expose five independently computed attributes:

- **Source class** — primary, independent, context, or unknown.
- **Coverage** — which claims have direct support.
- **Freshness** — publication and event date, shown separately when relevant.
- **Disagreement** — claim-level contradiction, never title similarity.
- **Retrieval health** — provider success, timeout, or degraded mode.

Production behavior:

- No mock sources.
- No “providers agree” state unless at least two real providers returned
  evidence from independent origins.
- Canonical URL collapse, ownership awareness, and near-duplicate detection run
  before corroboration is counted.
- No authoritative badge based only on hostname substring matching.
- No hidden fallback from live search to demo data.
- Generated prose and retrieved evidence remain visually distinguishable.
- Retrieved text is always data, never instruction. It cannot alter system
  behavior, tool permissions, destination apps, or automation schedules.
- Automations cannot write into external apps without per-run confirmation in v1.

Award-calibre answer shape:

- `Known` when primary evidence is strong and no material conflict is found.
- `Contested` when independent origins conflict.
- `Unassessed` when the product lacks enough evidence or the relevant evaluator
  is below threshold.

The honesty line is always visible:

`3 of 4 providers responded · 5 independent origins · 1 contested claim`

### Evidence evaluation

Trust signals ship only when they are measured.

- Maintain a gold set of at least 300 claims across legal/compliance, finance,
  and general research, including Greek/English code-switching and Cyprus
  statutory queries.
- Track provenance type per claim: `captured`, `verified`, `assessed`, or
  `seed`.
- Release thresholds:
  - source-class precision for `Primary` >= 0.95;
  - independent-origin precision >= 0.95;
  - material-disagreement recall >= 0.80;
  - unsupported-claim false-negative rate <= 0.05.
- Any trust attribute below threshold renders as `unassessed`, not guessed.
- One-key "this is wrong" captures the answer, evidence snapshot, and user
  correction locally; opt-in examples feed the gold set.

### Audit receipts

Inserted or copied researched text can include a compact receipt link or marker
that resolves to a hash-sealed evidence snapshot. Exportable audit bundles
include JSON, PDF, source hashes, timestamps, provider health, and app delivery
state.

## 8. Interaction and motion

Motion communicates state change rather than decoration.

- A single signal line changes character across listening, retrieval, and answer
  states.
- The Capture Pill expands into the Answer Sheet using shared geometry.
- Source markers settle into the margin beside the claims they support.
- Insert/replace animates as a short directional handoff, followed by Undo.
- Reduced-motion mode replaces spatial movement with opacity and text updates.
- No looping decorative motion outside an active operation.

## 9. Accessibility standard

Target WCAG 2.2 AA for every desktop and mobile surface.

- Full keyboard operation and visible focus.
- Screen-reader announcements for state transitions, not audio-level frames.
- Minimum 44×44 pointer targets for touch/coarse input.
- 200% zoom without clipped controls or hidden actions.
- Text alternatives for source status and charts.
- Captions/transcripts for every audio example.
- A no-animation mode and an option to disable sound cues independently.
- Permission errors include exact OS recovery instructions.

## 10. Privacy and safety

- Tokens live in the OS credential vault, never plaintext SQLite.
- Telemetry is off until explicit consent and never includes email/name by
  default.
- Every action that writes into another app is previewable and reversible.
- Shell/process execution is unavailable through ordinary API settings.
- Local API uses a random process-scoped token and loopback-only binding.
- Remote operation requires explicit authentication, TLS, rate limits, and
  capability-scoped permissions.
- The UI clearly distinguishes local, AGICY-hosted, and third-party processing.

Data-flow modes:

| Mode | Leaves device | Stored by default | Intended use |
| --- | --- | --- | --- |
| Local | Nothing beyond update/license checks | Local history only, user-controlled | Sensitive dictation and drafting |
| AGICY Cloud | Audio/text needed for hosted STT, retrieval, or model calls | No audio retention by default; minimal account/session logs | Default signed-in experience |
| Third-party providers | Query/audio/text sent to configured provider | Governed by provider policy and user/org settings | Advanced research/model choice |

Threat model additions:

- Indirect prompt injection is treated as a first-class risk.
- Retrieved pages, PDFs, emails, and tool output cannot grant permissions or
  request writes.
- Scheduled work that could change external state requires confirmation in v1.
- Local diagnostics can be exported by the user without telemetry.

## 11. Mobile role

Mobile is a companion, not a compressed desktop dashboard.

Initial scope:

- voice and text research;
- evidence inspection;
- saved threads;
- share-sheet transformation;
- handoff to desktop.

Desktop-only controls, local models, deep provider settings, and OS-wide paste
automation do not appear on mobile.

## 12. Experience metrics

Measure outcomes, not decorative engagement.

- Trust-evaluation precision/recall against the gold set.
- First successful result rate.
- Median capture-to-first-feedback latency.
- Median and p95 capture-to-answer latency by STT, retrieval, model response,
  evidence assessment, and render stage.
- Successful delivery rate by target application.
- Verified, Dispatched, and Clipboard delivery rates by target application.
- Correction rate after transcription.
- Percentage of material claims with direct evidence.
- Source-open rate for contested/low-confidence answers.
- Recovery success after permission, network, and provider errors.
- Seven-day return after first successful result.

Telemetry cannot be the only measurement source. Beta requires a consented
design-partner cohort and local diagnostic exports so per-app delivery and
accessibility failures remain measurable when telemetry is off.

## 13. Implementation sequence

### Phase 0 — safety and truth

- Close unauthenticated command-execution paths.
- Replace plaintext session storage with OS credential-vault access.
- Remove production mocks and dishonest agreement states.
- Make voice failure/fallback behavior explicit and tested.
- Add the licensing/provenance checklist.
- Add the evidence-evaluation harness and initial gold-set schema.
- Add an indirect prompt-injection threat model and v1 automation write gate.

### Phase 1 — brand and shell

- Replace visible Freestyle branding with UPDATED by AGICY.AI.
- Rewrite `DESIGN.md` as the UPDATED design-system contract.
- Consolidate navigation around Today, Research, Library, Automations, Settings.
- Establish the Answer Sheet and signal-line primitives.

### Phase 2 — first-run and capture

- Rebuild onboarding around one successful ask/dictate/insert journey.
- Unify pill states and recovery actions.
- Add device confidence, permission diagnostics, and honest delivery states.

### Phase 3 — evidence workspace

- Implement claim-linked sources, retrieval health, freshness, and disagreement.
- Add thread comparison, save/pin, and exportable audit trail.

### Phase 4 — action layer

- Preview, diff, insert, replace, copy, undo, and anchor-loss recovery.
- Add safe app-specific delivery adapters and telemetry-free diagnostics.

### Phase 5 — mobile companion and refinement

- Build the companion scope and desktop handoff.
- Complete accessibility, localization, performance, installation, updater, and
  cross-platform verification matrices.

## 14. Non-goals for beta

- Fully autonomous external-app writing from scheduled Automations.
- Claim-level badges for domains without measured evaluator quality.
- Provider/model configuration as a primary user journey.
- Replacing the local Electron/Hono architecture with Rakazo.
- Mobile parity with desktop OS-wide automation.

## 15. Licensing and provenance

Current repo evidence says this checkout is MIT: `LICENSE` lists Freestyle and
AGICY.Ai copyright under MIT, `NOTICE` identifies UPDATED as a derivative fork
of Freestyle, and `ARCHITECTURE-MAP.md` says the older FSL-1.1 reference is
obsolete for this checkout.

Commercial release still requires a legal/provenance gate:

- Re-read `LICENSE`, `NOTICE`, upstream license history, package manifests, and
  vendored assets before each release.
- Keep Freestyle copyright and license notices wherever required.
- Do not use Freestyle trademarks or visible naming in the UPDATED product.
- Document which modules are upstream-derived, AGICY-modified, and clean-room
  AGICY code.
- No paid public release until counsel signs off on the provenance record or the
  affected dictation core is clean-room reimplemented.

## 16. Failure and recovery matrix

Engineering must turn the prose requirements into a testable state matrix.

Minimum rows:

| State | Failure | User-visible recovery |
| --- | --- | --- |
| Permission | microphone denied | OS-specific permission path and retry |
| Capture | silence or wrong device | device picker, level test, retry |
| STT | blank transcript | never success; retry, switch provider, or type |
| Retrieval | provider timeout | degraded answer or unavailable with health note |
| Evidence | evaluator below threshold | render `unassessed` |
| Insert | read-back unavailable | `Dispatched`, not `Verified` |
| Insert | anchor lost | copy to clipboard |
| Undo | user typed after replace | restore original to clipboard |
| Automation | write requested | per-run confirmation required |

## 17. Release gates

No public beta until:

- the P0 security paths are closed;
- licensing/provenance has counsel sign-off or an explicit clean-room plan;
- all search evidence is real or the feature declares itself unavailable;
- trust badges pass the evidence-evaluation thresholds;
- independent-origin corroboration is implemented before agreement copy appears;
- AGICY authentication powers the default experience;
- voice cannot return a blank success;
- Local / AGICY Cloud / third-party data flows are documented in-product;
- indirect prompt-injection protections are tested;
- telemetry is consented and local diagnostic export works;
- Windows code signing and macOS signing/notarization are release-ready;
- installer, update, rollback, and data migration are tested;
- Windows and macOS complete the first-run-to-delivery journey;
- accessibility and privacy checks pass;
- the dependency audit has no critical advisory and every remaining high
  advisory has an accepted mitigation.
