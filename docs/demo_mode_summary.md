# Demo Mode Implementation Guide (Summary)

This is a quick reference for Demo Mode in the DebateAI app.

---

## Purpose
Demo Mode entices users to start a free trial by showcasing realistic, simulated sessions.

---

## Key Screens
- **Chat**: Users can type but cannot send. Pre‑recorded sessions show streaming, images, and tool calls.
- **Debate**: Pre‑recorded debates on preset topics (serious + playful).
- **Compare**: Sample comparisons across providers, models, personas.
- **History**: Past demo sessions viewable; “Continue” locked.

---

## Architecture
- Uses **Virtual Adapters** with recorded JSON logs.
- Playback engine simulates streaming and delays.
- `isDemo = !trial && !paid`.

---

## Content
- 6+ demo chats
- 4–6 debates
- 6 compare examples

---

## UX Conventions
- Banner + watermark labeling Demo Mode.
- Locked actions show a toast and a **Start 7‑Day Free Trial** CTA.

---

## Conversion Hooks
- Attempting to send, continue, or change provider always routes to trial CTA.

---

## Definition of Done
- All 4 screens demoed.
- Replay works; Continue locked.
- Streaming + images believable.
- Analytics firing.
- No live API calls possible.
