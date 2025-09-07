**Title**
- Symposium AI — BYOK, Demo Mode, and Subscription Implementation Guide

**Scope & Goal**
- Ship an iOS‑first, BYOK‑only app with a truthful Demo Mode and a $7.99/month subscription (7‑day free trial). Keep COGS at zero, minimize ops overhead, and leverage the existing codebase with targeted changes.

**Key Decisions**
- Generation is BYOK‑only. No hosted keys, no proxy, no server spend.
- Demo Mode bundles recorded examples for Debate, Round‑Robin, and Compare with clear disclosure.
- Subscription gates first‑party features only (orchestration, history tools, personalities library, exports, analytics). Generation still requires keys.
- Providers: Recommended = Claude, Gemini, ChatGPT, Perplexity; the other 5 labeled Beta.

**Repository Integration Summary**
- BYOK storage already exists via `src/services/APIKeyService.ts` and `src/services/secureStorage.ts`.
- Provider registry at `src/config/aiProviders.ts` and model logic under `src/config/providers` and `src/config/modelConfigs.ts`.
- Adapters: `src/services/ai/` with `AdapterFactory` and provider adapters for 9 providers.
- Subscription placeholder: `src/hooks/useSubscriptionStatus.ts` with a dev override that must be removed.
- API config UI: `src/screens/APIConfigScreen.tsx` with `APIProviderList` rendering provider rows.

**What You’ll Implement**
- Provider tiering (Recommended vs. Beta) in `aiProviders` and UI sorting in `APIProviderList`.
- Demo Mode assets and playback screens (Debate, Round‑Robin, Compare) with a Samples library entry point.
- Subscription: $7.99/month with 7‑day trial using `react-native-iap` (or RevenueCat if you later prefer). Wire real entitlement into `useSubscriptionStatus` and remove the dev override.
- UX gates: generation requires BYOK; Premium gates advanced features.

**1) Provider Tiering (Recommended vs. Beta)**
- File: `src/config/aiProviders.ts`
- Change: add a `tier: 'recommended' | 'beta'` field; mark:
  - `claude`, `openai`, `google`, `perplexity` → `tier: 'recommended'`
  - `mistral`, `cohere`, `together`, `deepseek`, `grok` → `tier: 'beta'`
- UI updates:
  - File: `src/components/organisms/APIProviderList.tsx`
  - Sort providers by `tier` first (`recommended` on top), then by name.
  - Add a small `Beta` chip for `tier==='beta'` and collapse an “Advanced providers (Beta)” section by default.
- Optional copy (in provider rows): one‑line guidance per recommended provider, e.g. “Claude — best at long‑form reasoning”, “Perplexity — answers with sources”.

Implementation sketch:
- Add type and field in `AIProvider` interface
- Update existing provider objects with `tier`
- In `APIProviderList`, split `providers` into two arrays and render Recommended first; render Beta under a collapsible panel.

**2) BYOK Gating (No Keys → Demo)**
- Files: `src/services/APIKeyService.ts`, `src/screens/HomeScreen.tsx` (or the primary landing screen), `src/hooks/useAPIKeys.ts`.
- Behavior:
  - If `APIKeyService.hasAnyKeys()` is false, show “Try Samples” CTA and “Connect Providers” CTA.
  - When the user adds any key, enable live generation for configured providers.
- Error surface: Normalize common provider errors in a central error helper so the UI can show “Invalid key”, “Model unavailable”, etc.

Steps:
- Add a selector/hook that returns `hasAnyKeys` (you already have `APIKeyService.hasAnyKeys()`; expose via `useAPIKeys`).
- In Home/entry screen, branch the empty state: Samples library + Providers setup.

**3) Demo Mode (Recorded Examples)**
- Assets path: `src/assets/samples/`
- Services: `src/services/samples/` with a tiny loader/validator and TypeScript types for three schemas.
- Screens: `src/screens/Samples/`
  - `SamplesHome.tsx` — lists categories and items (Debate, Round‑Robin, Compare)
  - `DebateSampleScreen.tsx`, `RoundRobinSampleScreen.tsx`, `CompareSampleScreen.tsx` — playback UIs
- Navigation: add a tab or menu entry “Samples”; reachable from Home empty‑state.
- Disclosure UI: persistent banner “Recorded example — no live AI call”; details drawer (date, provider notes, “edited for brevity” if applicable).

Schemas (use from BYOK-IAP-Demo-Mode.md)
- Reuse the JSON examples already documented in `docs/BYOK-IAP-Demo-Mode.md` under “Demo Asset Schema”.

Notes
- Keep total JSON size under ~2–3 MB across 15–20 samples.
- For provider names, only show if the sample truly came from that provider; otherwise label speakers “AI A / AI B”.

**4) Subscription ($7.99/mo, 7‑day Trial)**
- Library: `react-native-iap` (existing docs already included). RevenueCat remains an option later.
- Product IDs
  - iOS: `com.yourcompany.symposium.premium.monthly`
  - Android: `premium_monthly` (base plan `monthly` with 7‑day free trial offer)
- Trial: configure a 7‑day trial in both stores. No server required at v1.

Code changes
- New module: `src/services/payments/IAPService.ts` (follow `docs/IAP_IMPLEMENTATION_PLAN.md` skeleton but set price and product IDs to $7.99 SKUs, and enable 7‑day trial).
- Store wiring: integrate with your Redux store; update subscription in state on successful purchase/restore; persist locally for offline.
- Hook: update `src/hooks/useSubscriptionStatus.ts`
  - Remove the development override `subscription || 'pro'`.
  - Read from Redux subscription slice populated by IAP events.
  - Add `isTrialActive()` and `getDaysRemaining()` using purchase info or cached trial start.
- UI:
  - Add “Upgrade to Premium” screen with benefits focused on first‑party features (do not mention unlocking third‑party models).
  - Add “Start 7‑day free trial” CTA; show a non‑blocking banner from Day 5 of trial.

Gating matrix (client‑only)
- BYOK gate: New generation (Debate, Round‑Robin, Compare) requires at least one valid provider key.
- Premium gates: custom formats/rubrics, exports, folders/tags, analytics dashboards, large personality library (e.g., >3 custom personalities).
- Demo Mode always accessible.

Minimal integration points in codebase
- `src/hooks/useSubscriptionStatus.ts`: remove mock default and wire to store; add trial helpers.
- `src/screens/APIConfigScreen.tsx`: show Premium‑only indicators where applicable (e.g., Expert mode configs) using `isPremium`.
- `src/components/organisms/APIProviderList.tsx`: show fine‑grained hints, but keep BYOK independent of Premium.

**5) Copy & App Review Notes**
- Review note (App Store Connect):
  - “The app is fully usable on first launch with recorded examples demonstrating the debate and analysis features. Connecting an AI API key is optional and only required to generate new content. We do not sell access to third‑party services; Premium unlocks first‑party features like custom formats, analytics, and exports. API keys are stored locally on device only. Demo content is clearly labeled as recorded and not a live AI call.”
- Paywall copy: sell structure, coaching, analytics, exports, organization; avoid “unlock GPT‑4/Claude”.
- Demo banners: “Recorded example — no live AI call.”

**6) Concrete File‑by‑File Changes**
- `src/config/aiProviders.ts`
  - Add `tier` field to `AIProvider` interface
  - Set tiers for 9 providers as above
  - Optional: add `recommendedReason?: string`
- `src/components/organisms/APIProviderList.tsx`
  - Sort by `tier`; render Recommended section, Advanced (Beta) collapsible section
  - Add small `Beta` chip and optional `recommendedReason` line
- `src/hooks/useSubscriptionStatus.ts`
  - Remove dev override defaulting to `pro`
  - Read from Redux; implement `isTrialActive`, `getDaysRemaining`
- `src/services/payments/IAPService.ts`
  - New file: connection init, get products, purchase, restore, listeners; update store on entitlement changes; safe teardown on unmount
- `src/screens/Purchase/Upgrade.tsx`
  - New screen: feature list, price display ($7.99), “Start 7‑day free trial”, Restore Purchases
- `src/screens/Samples/…`
  - New screens (3) + `SamplesHome.tsx` as entry point
- `src/services/samples/…`
  - New loader/validator + types; reads JSON from `src/assets/samples/`
- `src/navigation/…`
  - Add Samples route; link from Home empty state
- `src/constants/featureFlags.ts`
  - Centralize booleans for demo banners, trial messaging, etc.

**7) Pricing & Config Updates**
- Update `docs/IAP_IMPLEMENTATION_PLAN.md` to $7.99/month and “7‑day trial”.
- Update `docs/IAP_CONFIGURATION.md` with a top “Update Note” block reflecting: product renamed to Symposium AI, monthly $7.99, 7‑day trial, BYOK‑only generation.

**8) QA Checklist**
- Fresh install (no keys, no premium): Samples accessible; generation gated; paywall reachable.
- Trial start: premium features available; BYOK still required for live runs.
- Trial end: premium features lock; paywall flows; restore works.
- BYOK: key save/validate; first run completes; provider error messages are human‑readable.
- Providers UI: Recommended section on top; Beta collapsed by default.

**9) Milestone Plan (Solo‑friendly)**
- M1: Provider tiering + Home empty‑state gates
- M2: Samples service + Samples screens + 10–15 assets
- M3: IAP service + Upgrade screen + `useSubscriptionStatus` wiring
- M4: Copy polish + App Privacy + Review Notes + TestFlight

**10) Risks & Deferrals**
- Do not attempt Android in v1; add later.
- Avoid server‑side receipt validation at v1; rely on store restore for non‑consumable/sub trial; add server later if needed.
- Keep Round‑Robin generation out of v1 if the UI is not ready; include as recorded samples.

**Appendix — Sample JSON Schemas**
- See `docs/BYOK-IAP-Demo-Mode.md` for ready‑to‑use schema examples for Debate, Round‑Robin, and Compare.

