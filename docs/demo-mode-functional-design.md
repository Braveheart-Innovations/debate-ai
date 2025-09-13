## Demo Mode — Functional Design

This document defines the Demo Mode user experience, flows, and constraints.

### Scope
- Available without sign-in; no live AI calls
- Three providers: Claude, OpenAI, Gemini
- Screens: Home/Chat, Debate, Compare, History

### Global UX
- Demo Banner: compact pill (“Demo Mode: Simulated content. No API calls.”); tap opens trial CTA
- Watermark: optional diagonal DEMO background (future)
- Gating: Send/Continue/Export/Provider-change show trial CTA

### Home / Selection
- Show only Claude, OpenAI, Gemini tiles with default models
  - Claude: Opus 4.1
  - OpenAI: GPT‑5
  - Gemini: 2.5 Pro
- Selection count rules remain unchanged

### Chat
- Flow
  - Select 1, 2, or 3 AIs
  - Auto-start a mapped sample using Pack routing
  - Streaming appears natural; user typing allowed, Send shows trial CTA
- Controls
  - Replay sample, Next sample, 1× / 1.5× (future small controls)
- Content
  - 2 samples per combination (7 combos total: 3 singles, 3 pairs, 1 trio)

### Debate
- Flow
  - Select 2 AIs; choose persona (default, George, Prof. Sage)
  - Start plays a pre-recorded debate for provider pair + persona
  - Alternating responses; voting UI can remain visible (non-functional in Demo)
- Content
  - At least 1 sample per pair per persona (9 total), expandable

### Compare
- Flow
  - Select left/right AI
  - Auto-start a sample with two pre-recorded answers
  - Side-by-side display; divergence/continue shows CTA
- Content
  - 2 samples per provider pair (6 total)

### History
- Demo sessions saved for replay; Continue shows CTA
- Bulk delete allowed; Export gated

### Error States
- Missing sample mapping: fall back to generic simulated responses with “Simulated” copy
- Pack parsing failure: log error; show banner; hide auto-start

### Analytics (future)
- Banner impressions, attempted sends/continues, CTA taps, sample replays, speed changes

### Accessibility
- All demo images include alt text
- Streaming announces updates for screen readers
- Color contrast meets WCAG AA

### Localization
- Copy in banners/CTAs supports i18n; content pack may remain EN-only initially

