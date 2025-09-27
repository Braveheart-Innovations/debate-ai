## Demo Mode — Technical Design

This document describes the architecture, components, and data flow for Demo Mode.

### Goals
- Zero live API calls in Demo
- High-fidelity playback through the existing streaming pipeline
- Minimal conditional UI branches; reuse production codepaths

### High-Level Architecture
- Flag: `isDemo = membershipStatus === 'demo'` via `useFeatureAccess()`
- Virtual adapters: `VirtualDemoAdapter` implements `sendMessage` and `streamMessage`
- Factory switch: `AdapterFactory` returns `VirtualDemoAdapter` when Demo is enabled
- Playback routing: `DemoPlaybackRouter` primes provider queues from content pack and serves responses per provider call
- Recording manifest: generated from `scripts/demo/recordings/*.json` via `scripts/demo/build-recordings-manifest.js`
- Loader: `DemoContentService` filters the manifest by provider combo and rotates through samples
- UI: Regular Chat/Debate/Compare screens; Demo Banner; CTA gating for live actions

### Components
- VirtualDemoAdapter
  - `getCapabilities()` advertises streaming enabled
  - `sendMessage` / `streamMessage` ask `DemoPlaybackRouter` for the next response for the provider, else fallback to a generic simulated response
- DemoPlaybackRouter
  - Maintains `providerQueues: Record<'claude'|'openai'|'google', string[]>`
  - `primeChat(sample)`: prime first-turn answers for all selected providers
  - `primeDebate(sample)`: prime multiple sequential turns by parsing assistant events
  - `primeCompare(sample)`: prime single-turn answers per side by parsing column events
  - `nextProviderResponse(provider)`: shift and return next response
- DemoContentService
  - `getPack()` caches imported JSON
  - `comboKey(providers)` and rotation tracking per key
  - `getChatSampleForProviders(providers)`, `getDebateSampleForProviders(providers, persona)`, `getCompareSampleForProviders(providers)`
- Gating helpers
  - `DemoBanner` and `showTrialCTA()` for consistent trial prompts

### Data Model
- Source files: JSON recordings in `scripts/demo/recordings` captured via record mode
- Manifest: `src/assets/demo/recordingsManifest.ts` enumerates recordings with providers, titles, and data payloads
- Provider combos normalized as `claude+openai(+google)`, independent of persona selection
- Persona metadata kept in recording IDs/titles but does not gate availability

### UI Integration
- Chat
  - On first render in Demo with selected AIs and empty messages: `getChatSampleForProviders` → `primeChat` → add user message → invoke `sendAIResponses`
- Compare
  - On first render in Demo with both AIs: `getCompareSampleForProviders` → `primeCompare` → add user message → call `aiService.sendMessage` for both sides
- Debate
  - On start in Demo: derive persona key from selected personalities → `getDebateSampleForProviders` → `primeDebate` → run orchestrator; adapters return queued responses per provider

### Persona Handling
- Supported: `default`, `George`, `Prof. Sage`
- Debate routing keys: `providerCombo:Persona`
- `speakerPersona` optional in events for clarity

### Recording Workflow (local dev)
- Enable **Record Mode** in the app.
- Run `npm run demo:bridge` in the repo root. The bridge listens on `http://127.0.0.1:8889`, captures recordings sent via **Append to Pack (dev)**, mirrors them into `scripts/demo/recordings/`, and reruns the manifest builder automatically.
- When you stop a recording, choose **Append to Pack (dev)**. The new sample becomes available immediately in Demo pickers.
- If you skip the bridge, copy the JSON into `scripts/demo/recordings/` manually and run `npm run demo:build-recordings` to refresh the manifest.

### Safety And Guarantees
- No network: Factory forces `VirtualDemoAdapter` in Demo
- Truthfulness: banners + simulated copy; optionally watermark & chips
- Size: favor WebP and concise content; lazy-load heavy packs in future

### Extensibility
- Add more providers by extending allowlist and content
- Add tool/image events by including relevant `DemoMessageEvent` types; adapters pass events up via `onEvent`
- CDN updates: allow pack refresh and fallback to bundled pack

### Files
- Services: `src/services/demo/*`, `src/services/ai/adapters/demo/VirtualDemoAdapter.ts`
- UI: screens `ChatScreen`, `CompareScreen`, `DebateScreen`
- Recordings: `scripts/demo/recordings`
- Manifest + helpers: `scripts/demo/build-recordings-manifest.js`, `src/assets/demo/recordingsManifest.ts`
