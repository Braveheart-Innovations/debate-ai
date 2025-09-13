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
- Content pack: `src/assets/demo/demo-pack.v1.json` (DemoPackV1 schema)
- Loader: `DemoContentService` provides routing helpers and pack cache
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

### Data Model (DemoPackV1)
- `chats: DemoChat[]` with `events: DemoMessageEvent[]`
- `debates: DemoDebate[]` with alternating assistant events and `speakerProvider`/`speakerPersona`
- `compares: DemoCompare[]` with `runs[0].columns[]` and assistant events
- `routing: { chat, debate, compare }`: maps combo keys to IDs
  - Provider combos: `claude+openai`, `claude+openai+google`, etc.
  - Personas: `:default`, `:George`, `:Prof. Sage` suffix for debate

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
- Data: `src/assets/demo/demo-pack.v1.json`

