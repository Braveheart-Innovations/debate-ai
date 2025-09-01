# Personality System — Comprehensive Implementation Plan

This plan delivers a premium-feeling, memorable personality system that respects React Native community standards, follows atomic design principles, and elevates engagement across chat and debate experiences.

## Goals
- Delight users with 7–8 signature, named personas that feel distinct and memorable.
- Keep one high‑quality persona fully available to free users (not a “lite” version).
- Simplify from 12 generic options to a curated set with strong voice definitions and previews.
- Maintain a clean architecture: centralized config, reusable UI primitives, and clear premium gating.
- Ship quickly with a safe rollout, telemetry, and space for seasonal packs.

## Principles
- React Native standards: accessible touch targets, haptics for key interactions, performant lists, platform-safe animations, and proper state via Redux/hooks.
- Atomic design: atoms (badges, chips), molecules (cards, selectors), organisms (pickers/sections), screens (setup flows), services (prompt building, analytics).
- Premium UX: named characters, emoji signatures, taglines, previews, and featured pairings.
- Respectful voice: persona tics are subtle, never caricatured; safety and helpfulness first.

---

## Persona Lineup (Curated)
Core set (8) + 2 rotating seasonal slots. Each includes: name, emoji, tagline, voice rules, debate moves, constraints, signature touches, guardrails.

- Prof. Sage (Professor) — 🎓
  - Tagline: Calm, precise, citation‑friendly.
  - Voice rules: formal ≥ medium; no slang; define terms; cite sources when relevant.
  - Debate moves: structured arguments; definitions first; reference evidence.
  - Constraints: short paragraphs; numbered steps for complex points.
  - Signature: “Defined terms:” “Evidence suggests …”.
  - Guardrails: never fabricate citations.

- Brody (Dude Bro) — 🏈
  - Tagline: High‑energy; playbook thinking; straight talk.
  - Voice rules: short sentences; decisive; occasional sports/gym analogies.
  - Debate moves: call the shot; simplify to a play; rally close.
  - Constraints: max one analogy per answer; no insult; avoid stereotypes.
  - Signature: “Here’s the play:” “Let’s go.”

- Jordan (The Pragmatist) — 🧭
  - Tagline: Tradeoffs, then a workable plan.
  - Voice rules: surface risks succinctly; decide; propose 2–3 concrete steps.
  - Debate moves: list key tradeoffs; recommend pragmatic path; outline next actions.
  - Constraints: stay decisive; no fear‑mongering; always a clear recommendation.
  - Signature: “Tradeoffs on the table …” “Here’s a workable plan.”

- Bestie (Your New Best Friend) — 💖
  - Tagline: Warm, supportive, collaborative.
  - Voice rules: empathetic; inclusive language; empower the user.
  - Debate moves: reframes; find common ground; action steps.
  - Constraints: never toxic positivity; acknowledge tradeoffs.
  - Signature: “You’ve got this.” “Let’s map it out.”

- Ivy (Skeptic) — 🔍
  - Tagline: Evidence-first; “how do we know?”
  - Voice rules: fact-checking tone; quantify uncertainty; avoid overclaiming.
  - Debate moves: burden of proof; counterexamples; falsifiability.
  - Constraints: avoid pedantry; offer paths to validate.
  - Signature: “What would falsify this?” “Cite your sources.”

- Zenji (Zen Master) — 🧘
  - Tagline: Calm balance; reframes extremes.
  - Voice rules: minimalism; analogies; balanced perspectives.
  - Debate moves: middle way; principle extraction; de-escalation.
  - Constraints: avoid vagueness; end with a clear takeaway.
  - Signature: “Consider the middle path …”.

- George (The Satirist) — 🎤
  - Tagline: Observational, acerbic wit (PG/PG‑13).
  - Voice rules: clever irony; one zinger max; keep it constructive.
  - Debate moves: expose contradictions; punchy reframes; end with a sharp insight.
  - Constraints: no slurs or personal attacks; no profanity by default.
  - Signature: “Funny how …”, one clean zinger sparingly.

- Devlin (Devil’s Advocate) — 😈
  - Tagline: Steelman the other side; pressure-test.
  - Voice rules: respectful challenge; contrast assumptions; consider inversions.
  - Debate moves: counterexamples; reverse the hypothesis; red-team.
  - Constraints: avoid bad faith; never contrarian for its own sake.
  - Signature: “Let’s stress-test that.”

Free access decision:
- Free users get Prof. Sage as the single selectable persona (solid, credible, enticing). Balanced “Default” remains as the baseline system style when no persona is selected.

Seasonal packs (2 slots)
- Examples: Quinn — The Enforcer (assertive, policy‑forward 📎), Ellis — The Traditionalist (old‑school, practical 🧱), Scout — The Storyteller (narrative 📖), Optimist, Nerd. Rotated monthly.

---

## Architecture & Data Model
- Central config: `src/config/personalities.ts`
  - Replace current generic list with curated personas + seasonal registry.
  - Include: id, name, emoji, description/tagline, systemPrompt, debatePrompt, traits (formality/humor/energy/empathy), voice constraints, signature touches.
- Personality service: `src/services/debate/PersonalityService.ts`
  - Update `getAvailablePersonalities(isPremium)` to return: default + Prof. Sage for free; all + seasonal when premium.
  - Keep trait and debate modifier mapping; tune per curated set.
  - Add helper: `getPersonaPreviewLine(id)` for teaser copy.
- Prompt builders:
  - Debate: `DebatePromptBuilder` already injects `getDebatePrompt(id)` — expand prompts with per-persona “moves” reminders using a short, safe rubric.
  - Chat: continue setting `adapter.setTemporaryPersonality` via `useAIResponsesWithStreaming`.
- State:
  - Keep `aiPersonalities` mapping per AI.
  - Add optional `seasonalEnabled: string[]` in config if we want remote toggles later.

---

## UI/UX — Atomic Design Mapping
- Atoms
  - `PersonalityBadge` (exists): ensure emoji + name + lock; add tiny energy/formality/humor meters (3-dot bar).
  - `PersonalityChip` (exists): keep emoji; show lock for premium.
- Molecules
  - Personality Card: emoji, name, tagline, 3 mini-meters, “Preview” button (plays one sample line), subtle gradient.
  - Persona Meter: compact component for 3 traits.
- Organisms
  - `PersonalityPicker` (migrate to modal): replace inline picklist with a modal-based selector (details below); for free users, show Prof. Sage unlocked and others locked with “Preview” CTA; upsell inline.
  - `DebatePersonalitySelector` (update): show featured pairings and suggest combinations; show the two selected AIs with their current personas.
  - `DynamicAISelector` / `AICard`: when selected, open the PersonalityPicker as a sheet; keep model selector aligned beneath.
- Screens
  - Debate setup, step 3: retitle “Set the Tone” and highlight featured combo suggestions.
  - Upsell sheet: “All Signature Styles + Seasonal Packs” with sample lines.

RN community standards
- Accessibility: minimum 44x44pt tap targets; role/label/Hint set; color-contrast verified; no emoji-only labels (always text + emoji).
- Performance: avoid heavy re-renders (memoize lists); use `FlatList` for long grids; keep animations at 60fps (Reanimated, light shadows).
- Haptics: light impact on select; success on upgrade; no excessive vibration.

- Haptics: light impact on select; success on upgrade; no excessive vibration.

---

## Modal Selector Migration (from picklist to modal)

Why: More room for enriched content (taglines, meters, previews, locks, upsell), clearer scanning, and better premium storytelling.

User flow
- Tap “Personality” on an AI card (or in Debate step 3) → open modal.
- Browse Signature and Seasonal tabs; search/filter optional in v2.
- Tap a card to select; play “Preview” for locked personas; confirm selection.
- Modal closes → selection applied to the specific AI.

Component architecture
- New organism: `PersonalityModal` in `src/components/organisms/debate/PersonalityModal.tsx` (generic; usable in chat and debate contexts).
  - Uses existing `ModalHeader` molecule (title, close) and RN `Modal` (slide, `overFullScreen`, `transparent`).
  - Body: `FlatList` grid of Persona Cards (molecule) for performance; each card shows emoji, name, tagline, mini-meters, lock state, and a “Preview” tertiary button.
  - Footer: primary “Use This Style” button disabled until a selection is highlighted; secondary “Learn about styles” link to upsell.
  - Tabs (Signature | Seasonal) as simple segmented control atop list.

Design details
- Modal sizing: full-screen on mobile; safe area padding; backdrop with 0.5 opacity.
- Animations: fade/slide for modal; scale-in on card selection (Reanimated, light-only).
- Accessibility: `onRequestClose` wired; focus on header; swipe-to-close disabled to avoid accidental dismiss; labels include emoji + text; minimum 44x44 targets.
- Android back: closes modal via `onRequestClose`.

State & integration
- Entry points: replace `PersonalityPicker` dropdown trigger inside `AICard` with an “Open PersonalityModal(aiId, currentPersonalityId)` callback.
- Store: continue to dispatch `setAIPersonality({ aiId, personalityId })` on confirm. Local modal state for visibility/selection.
- Premium gating: free users see Prof. Sage unlocked; other cards show lock with working preview + upsell CTA.
- Sample previews: call `PersonalityService.getPersonaPreviewLine(id)`; render text-only preview inline (no network required).

RN standards & performance
- Use `FlatList` with `numColumns={2}` (or responsive) and `getItemLayout` for smooth scroll.
- Memoize cards; avoid re-renders by keying list on `isPremium` + persona catalog version.
- Keep shadows light; avoid blurred backdrops that hurt Android perf.

Migration steps
1. Add `PersonalityModal` with static data; wire into one entry point behind a feature flag `enablePersonalityModal`.
2. Replace current dropdown in `PersonalityPicker` usage within `AICard` to open modal when flag is on.
3. QA accessibility, Android back, and z-index interactions with other sheets/modals.
4. Remove legacy dropdown path; keep component as wrapper that opens modal for API stability.
5. Rollout flag → default on.

Acceptance additions
- Selecting a persona via modal updates the AI and closes modal; locked personas remain non-selectable but previewable.
- Back button and swipe gestures do not cause accidental loss of selection; unsaved changes confirmation not required (selection is applied only on confirm).

---

## Premium Gating & Copy
- Free: `default` baseline (no selection) + selectable “Prof. Sage”.
- Premium: unlock all signature + seasonal.
- Replace marketing copy:
  - From: “12 Unique AI Personalities”
  - To: “All Signature Styles + Seasonal Packs”
- CTA microcopy: “Hear a sample” on locked personas; play in-voice one-liner + dim backdrop; button “Unlock Styles”.

Files to update (no code now; for implementation):
- `src/components/molecules/profile/FreeTierCTA.tsx` (copy)
- `src/screens/WelcomeScreen.tsx` (copy)
- `src/components/organisms/PersonalityPicker.tsx` (UI, preview button)
- `src/components/organisms/debate/DebatePersonalitySelector.tsx` (featured pairs)

---

## Featured Pairings (Showcase)
Display 3–4 combo tiles, each with a one‑line banter preview:
- Prof. Sage vs Brody — Order vs swagger.
- Bestie vs Ivy — Empathy vs scrutiny.
- Zenji vs Devlin — Equanimity vs pressure‑testing.
- George vs Jordan — Wit vs pragmatism.

---

## Analytics
Events (with minimal PII, opt-in per app policy):
- `persona_preview_played` { persona_id }
- `persona_selected` { persona_id, context: chat|debate }
- `persona_pairing_suggested` { pair_ids }
- `upgrade_clicked` { source: picker|upsell_sheet }
- `debate_started` { persona_ids }

Success metrics
- Preview → upgrade conversion; persona engagement (select rate); debate completion rate; retention by persona selection.

---

## QA & Safety
- Voice guardrails: no caricature; retain factuality; respect content policies.
- Non-English/localization: emojis universal; names are neutral; copy strings ready for i18n.
- A11y: VoiceOver labels, focus order, keyboard nav on web.
- Latency: prompts remain concise; persona rubric max ~2–3 lines.

---

## Migration Plan
- Deprecate generic 12; map old IDs to new where possible:
  - analytical → Prof. Sage
  - skeptic → Ivy
  - zen → Zenji
  - contrarian/debater → Devlin
  - comedian/sarcastic/optimist/nerdy/dramatic → seasonal pack bucket
- For existing sessions with deprecated IDs, fallback to mapped persona or `default`.
- Update copy references to “12 personalities”.

---

## Work Breakdown
1) Content & Config
- Define curated personas in `src/config/personalities.ts` with: systemPrompt, debatePrompt, traits, sign-offs, constraints.
- Add `getPersonaPreviewLine(id)` per persona.

2) Personality Service
- Update gating to: free => default + Prof. Sage; premium => all + seasonal.
- Provide `getFeaturedPairings()` with sample banter.

3) UI/UX
- Implement `PersonalityModal` (grid, previews, locks) and wire from `AICard`/Debate step.
- Replace inline picklist with modal presentation; keep a thin wrapper for API stability.
- Add Persona Meter molecule; refine Badge/Chip.
- Update `DebatePersonalitySelector` to show featured pairs and suggestions.
- Ensure `DynamicAISelector` sheet-wiring remains smooth (no z-index issues).

4) Copy & Upsell
- Replace “12 Unique AI Personalities” copy in FreeTierCTA/Welcome.
- Add upsell sheet with sample previews.

5) Telemetry
- Emit events on preview/select/upgrade.

6) QA/Polish
- A11y pass; haptics tuning; animation polish.
- Prompt length validation; performance checks.

---

## Acceptance Criteria
- Free users can select Prof. Sage; all others show lock + working preview.
- Debates and chats clearly reflect persona voice within safe guardrails.
- Featured pairings appear with sample banter; selection is one tap.
- Copy updated across surfaces; no “12” references remain.
- No regressions in streaming, debate flows, or model selection.

---

## Rollout
- Phase 1 (week 1): Config + gating + updated picker; copy changes; Prof. Sage free.
- Phase 2 (week 2): Featured pairings + previews + analytics.
- Phase 3 (week 3): Seasonal pack framework + content; A/B test upsell language.

---

## Risks & Mitigations
- Overbearing tics: keep signature touches low frequency; add tests/spot checks.
- Prompt inflation: keep rubric compact; reuse across chat/debate.
- Choice paralysis: curated set, featured combos, and one-tap suggestions.
- Perception risk: ensure “Brody/Nelly” voices are respectful and not stereotypes.

---

## Open Questions
- Final names vs internal IDs (e.g., `prof_sage` vs display “Prof. Sage”).
- Seasonal cadence (monthly vs bi‑monthly) and content source.
- Whether to allow a second rotating free preview persona during promos.

---

## Next Steps
- Approve lineup and free‑persona choice (Prof. Sage).
- I’ll implement the config + gating + picker updates, then wire previews and featured pairings.
