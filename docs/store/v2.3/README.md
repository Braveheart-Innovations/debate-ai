# Store copy — v2.3.0

"What's new" text and App Review notes for the **v2.3.0** submission (iOS buildNumber 34 / Android versionCode 46).
Scope is everything merged after the 2.2.0 build (`78db31b`).

| File | Where it goes | Limit | Count |
|------|---------------|-------|-------|
| `ios-whats-new.txt` | App Store **What's New in This Version** | 4000 | 1041 |
| `android-whats-new.txt` | Google Play **What's new** (release notes) | 500 | 323 |
| `app-review-notes.txt` | App Store Connect **App Review Information → Notes** | 4000 | ~1440 |

Description, short description, subtitle, and promotional text are unchanged from v2.0 (`docs/store/v2.0/`).

## Sources / accuracy decisions

- **Voice dictation** (#352c11b): `useDictation` + `MicButton` in ComposerShell (Chat, Create), ChatInputBar (Compare), RichTopicInput (custom debate motion). Platform recognizer (`expo-speech-recognition`), `addsPunctuation: true`, interim results. Permission strings in `app.json`.
- **Cut-off replies + Continue** (#17bbc70): `truncated` lifecycle status and the Continue / Try again pill in `MessageBubble`.
- **Trial terms** (#1093169, #3915df7): intro price phase disclosed; trial offered only when the store account is eligible (the Play 2.2.0 rejection).
- Not mentioned (no user-visible effect): tests/lint/type cleanup, `functions/` firebase-admin bump.
