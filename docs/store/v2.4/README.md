# Store copy — v2.4.0

"What's new" text and App Review notes for the **v2.4.0** submission (marketing and runtime version 2.4.0).
Scope is every mobile change merged after the 2.3.0 build (`ba1bdc1`). The `[analyze]`, `[sync]`, `[sandbox]` and
`functions/` commits in that range do not touch the mobile app's `src/` and are left out.

| File | Where it goes | Limit | Count |
|------|---------------|-------|-------|
| `ios-whats-new.txt` | App Store **What's New in This Version** | 4000 | 1319 |
| `android-whats-new.txt` | Google Play **What's new** (release notes) | 500 | 469 |
| `app-review-notes.txt` | App Store Connect **App Review Information → Notes** | 4000 | 1088 |

Description, short description, subtitle, and promotional text are unchanged from v2.0 (`docs/store/v2.0/`).
Play reviewer access is in Play Console → App content → Sign in details ("User Account" + "Reviewer steps"), updated 2026-10-14.

## Sources / accuracy decisions

- **Speech length** (#272): Brief / Balanced / Detailed row in Debate setup's Format card, remembered across launches,
  pre-filled by Rematch; word targets per turn (openings 100 / 190 / 350). Not gated by Demo Mode, so App Review sees it.
- **Same length on every AI** (#272): live check 72/72 Gemini speeches within 20% of target; before, Claude ran 1.95x
  and ChatGPT 1.25x their intended length (handoff doc, "Length experiment").
- **Debate personalities** (#272 Phase 3): debate persona prompts built from debate text only; blind attribution 31/32.
  "Every debate starts fresh" and Rematch pre-fill: #252.
- **No dead ends** (#272): blocked Send (Chat, Compare, Studio) and Start (Debate) open the picker or the missing piece;
  Add key opens that provider's card; Studio/Chat point Runway or ElevenLabs keys to the tab where they work; a key
  pasted into an empty card is saved on leave. These answer the Play "Unresponsive app" warning of 2026-10-14.
- **First-tap picks** (#272): PagedSheet pushed-page dead zone fixed; keyboardShouldPersistTaps on sheet lists.
- **Models** (#272): Claude Haiku 5.5, Gemini 4 Argon, Gemini 3.6 Flash (replaces 3.5 Flash in the picker), DeepSeek
  V4 Pro (restored), Nano Banana 2.1 (images). Retiring Sonnet 4.5, Haiku 4.5, Gemini 3.5 Flash and Grok Imagine
  Quality map to successors. Mistral Large 4 is cataloged but not in the picker, so it is not named.
- **Continue / Try again for failed replies** (#206, `65499762`); **Claude key check** (#271).
- Already delivered to 2.3.0 users by OTA before this build: #206, #252, #256. The 2.4 JavaScript also ships as an
  OTA to runtime 2.3.0, so most users see these changes before the store update.
- Not mentioned (no user-visible effect): eval harness (#262), tests, the "Add key" chip line fix, help copy.
