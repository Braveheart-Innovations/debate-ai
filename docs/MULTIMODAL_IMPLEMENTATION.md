# Multimodal Capabilities Implementation Guide

This document defines an iterative plan to add multimodal features (image upload, document/PDF upload, image generation, voice) to Symposium AI, aligned with the current codebase and BYOK (bring-your-own-key) model where user API keys are stored with `expo-secure-store`.

## Guiding Principles
- Reuse existing structures: `src/services/ai/*` adapters, `src/services/images/ImageService.ts`, `src/config/modelConfigs.ts`, `src/config/providerCapabilities.ts`, and the modal pattern used by `ImageGenerationModal`.
- BYOK everywhere: never hardcode or bundle provider keys; read per-user keys from Secure Store at call time. Fail gracefully if missing.
- Single source of truth: prefer `modelConfigs` capability flags (`supportsVision`, `supportsDocuments`, `supportsImageInput`, `supportsImageGeneration`, `supportsVoiceInput`, `supportsVoiceOutput`, `supportsRealtime`) and extend `providerCapabilities` only where provider-specific toggles are needed (e.g., image generation sizes/models).
- Progressive delivery: implement smallest vertical slices with explicit acceptance criteria.

## Capability Discovery (Dev‑Only)
Goal: keep runtime UX static and predictable; use discovery tools only during development to keep configs up‑to‑date as providers evolve.

- Inputs: use testing keys from `.env.local` only (never the user’s Secure Store keys).
- Outputs: JSON snapshots and generated docs of provider models and capabilities, plus suggested patches to `src/config/modelConfigs.ts` and `src/config/providerCapabilities.ts`.
- Frequency: run before releases or when a provider announces updates.

Artifacts and locations
- `scripts/api-discovery/*.js`: per‑provider discovery scripts (existing Claude scripts) and a unified `discover-all-models.js` entry.
- `scripts/api-discovery/output/{provider}-models.json`: raw model lists.
- `scripts/api-discovery/output/{provider}-capabilities.json`: summarized capabilities per model.
- `docs/api-integration/providers/{provider}/models.md`: human‑readable model catalog (generated).

Process
1) Read keys from `.env.local` and validate presence per provider.
2) List models via provider APIs; enrich with known capability flags (vision/docs/voice/image-gen).
3) Write JSON + regenerate `models.md` for each provider.
4) Open a PR to update `modelConfigs.ts`/`providerCapabilities.ts` based on changes.

## Architecture & Integration
- UI components:
  - Reuse modal pattern from `src/components/organisms/chat/ImageGenerationModal.tsx` for new modals (ImageUploadModal, DocumentUploadModal, VoiceModal). Keep `Box`, `Typography`, `SheetHeader`. Use `Animated` or `react-native-reanimated`; don’t introduce `lucide-react-native`.
  - A small `MultimodalButton` + optional icon row can be implemented using existing atoms/molecules.
- Services:
  - Image generation: extend `src/services/images/ImageService.ts` to support additional providers behind the same call site.
  - Image/Document input and Voice: add methods on existing provider adapters under `src/services/ai/adapters/*`, matching how attachments are already formatted in `aiAdapter.ts` and provider-specific adapters (Claude, Gemini handle documents; OpenAI documents unsupported via API—surface explicit messages as done today).
- Capability evaluation in app:
  - Drive UI exclusively from `modelConfigs` + `providerCapabilities` (no runtime probing).
  - Discovery never runs in production; it is a dev script that informs config updates.

## Phased Delivery & Acceptance Criteria
Phase 0 – Discovery foundation
- Add `CapabilityDiscovery` with stubs for image input, document (PDF), and voice (transcription) probes.
- Acceptance: With valid keys, discovery returns a merged capability map; failures don’t crash and are cached as “unknown/unsupported”.

Phase 1 – Config alignment
- Extend `ProviderCapabilities` only for image generation (sizes/models) and keep other modality flags in `modelConfigs`.
- Acceptance: `useMultimodalCapabilities` hook returns accurate availability for selected models based on `modelConfigs` (without probes).

Phase 2 – UI scaffolding
- Add `MultimodalButton` and disabled states with reason tooltips. Create empty modals for ImageUpload, DocumentUpload, Voice that follow the `ImageGenerationModal` pattern.
- Acceptance: Button shows available modalities; disabled ones show provider-specific reasons.

Phase 3 – Services wiring
- Wire Image Upload → existing adapters’ image parts. Wire Document Upload → Claude/Gemini adapters (PDF base64 parts). Voice (transcription) → provider endpoints (e.g., OpenAI Whisper) only when keys are present.
- Acceptance: Each modality executes a minimal end-to-end happy-path with real keys (BYOK), cancellable and retryable.

Phase 4 – Discovery & config update (Dev‑only)
- Run `npm run discover:models` and regenerate provider `models.md` docs; review diffs.
- Acceptance: Open PR updates for `modelConfigs.ts`/`providerCapabilities.ts` reflect API reality; app behavior remains static.

Phase 5 – Testing & hardening
- Add Jest tests for the hook, discovery merge logic, and adapter parameter shaping. Manual checks for permission-denied, oversized files, and network errors.

## BYOK, Security, and Privacy
- Keys: stored/retrieved via `expo-secure-store`; never logged; presence is required per‑provider before enabling actions.
- Inputs: validate MIME type, dimensions/pages, and size before upload; cap base64 payloads to avoid OOM.
- Errors: unify cancel/retry UX with `ImageGenerationModal` pattern; show actionable errors (missing key, unsupported modality, provider error).

## Notes & Non‑Goals
- No new global service registries; keep logic close to existing adapters/services.
- Don’t implement on-device PDF parsing unless a specific product need emerges; prefer provider-native ingestion (Claude/Gemini) and inform users where OpenAI lacks PDF upload support.
- Voice realtime/tts can be added later; start with transcription.

---
This plan lets us deliver visible value early (button, states, one happy path) while we iteratively refine capability accuracy through BYOK‑aware discovery, without introducing parallel infrastructure or drifting from existing code patterns.
