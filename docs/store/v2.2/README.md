# Store copy — v2.2.0

"What's new" text for the **v2.2.0** submission (iOS buildNumber 33 / Android versionCode 43, built from `78db31b`).
Scope is everything merged after the live 2.1.0 build (`11d2190`, 2026-08-19).

| File | Where it goes | Limit | Count |
|------|---------------|-------|-------|
| `ios-whats-new.txt` | App Store **What's New in This Version** | 4000 | 1427 |
| `android-whats-new.txt` | Google Play **What's new** (release notes) | 500 | 371 |

Description, short description, subtitle, and promotional text are unchanged from v2.0 (`docs/store/v2.0/`).

## Sources / accuracy decisions

- **Models** (#177): defaults and picker contents from `src/config/providers/modelRegistry.ts` (`DEFAULT_PROVIDER_MODELS`) and `src/config/modelConfigs.ts` (`CURATED_MODEL_IDS`). Only models visible in the picker are named. GPT-6 Sol is intentionally omitted: it is not curated on mobile (GPT-4.1 keeps the slot for Expert Mode temperature control).
- **Mistral Large 3** is not called out: it stayed available (paid Mistral tiers) and was never removed from a shipped mobile build.
- **Image input** for DeepSeek Flash and GLM-5.3 Flash/FlashX: `supportsVision` in the catalog plus per-model adapter gating (#177).
- **Create Studio**: GPT Image 2.5 Flare is the OpenAI image default (`src/config/imageGenerationModels.ts`); Grok Imagine 2.0's 21:9 and 5:2 ratios come from `XAI_IMAGINE_2_ASPECT_RATIOS`.
- **Multi-AI chat** (#179): speaker labels and group-chat instructions so each AI knows who said what.
- **Fixes**: Sonar Deep Research empty answers (#177, `minOutputTokens`); Claude streaming dropped characters (#187); out-of-credit message `API_BILLING_REQUIRED` (#173, `src/errors/messages/UserFriendlyMessages.ts`); Expo SDK 57 patch set (#176) as "updated app platform".
- Not mentioned (no user-visible effect in the app): server-side `functions/` changes (#168, #170, #172, #175, #178), dependency and audit chores, Crashlytics noise filtering.
