# Demo Mode Implementation Guide (Full Version)

This is the complete implementation plan for **Demo Mode** in the DebateAI app. Demo Mode must convincingly mimic live functionality while clearly signaling its limitations, to entice users into starting a trial.

---

## 1) Product goals & guardrails

**Goals**
- Let users *feel* the real product: streaming, typing latency, tool calls, images, debates, side‑by‑side comparisons, and history.
- Minimize cognitive dissonance: the UI works as expected; we clearly label “Demo” and lock only live actions.
- Optimize conversion: every blocked action pivots to a single, consistent **Start 7‑Day Free Trial** CTA.

**Guardrails**
- Demo is clearly labeled at the banner, watermark, and disabled controls.
- No live calls: API keys, providers, and purchases are gated behind the trial wall.
- No fake claims: use “Simulated” on generated content/tool outputs.

---

## 2) UX surfaces (per screen) + copy

### Global
- **Demo watermark**: subtle diagonal “DEMO” pattern on message backgrounds at 6% opacity.
- **Lock semantics**: anything “live” shows a small lock icon and a hover/press tooltip: “Live feature — available in Free Trial.”
- **CTA**: use your existing **Start 7‑Day Free Trial** button as the single primary affordance.

### A. Chat
- **Banner**: sticky, compact pill (“Demo Mode: Simulated chat. No API calls.”). Tap = opens explainer sheet with CTA.
- **Input bar**:
  - Users can type. On **Send**, we insert their bubble (greyed + lock badge) and show a toast:
    - “Demo Mode can’t send messages. Start a free trial to chat for real.”
- **Playback**:
  - Pre‑recorded sessions stream in with token‑like cadence.
  - Support: markdown, code blocks with syntax highlight, tool‑call ribbons (e.g., “Image generation”), citations, and inline images.
- **Advanced features, simulated**:
  - **Image generation**: show a “Generating…” placeholder that resolves to pre‑rendered images with a “Simulated” chip.
  - **Tool calls**: render tool‑UI strips with a “Demo” tag.

### B. Debate
- **Banner**: “Demo Mode: Pre‑recorded debates from Presets.”
- **Preset debates** (at least 6; serious + playful):
  - “Nuclear vs Renewable for baseload power”
  - “Should homework be abolished?”
  - “Open‑weights vs closed‑weights models”
  - “Colonize Mars: imperative or hubris?”
  - “Pineapple on pizza”
  - “Is AGI alignment the real bottleneck?”
- **Playback**: timed alternating messages, optional interjections, and a simple “judge’s summary” ending. Add **Replay** and **1× / 1.5×** speed.

### C. Compare
- **Banner**: “Demo Mode: Sample comparisons across providers, models, and personas.”
- **Tabs**: Provider ▸ Model ▸ Persona.
- **Runs to include**:
  - **Providers**: same prompt across 3–4 providers.
  - **Models**: e.g., “fast vs large”.
  - **Personas**: “Socratic Mentor,” “Pragmatic Engineer,” “Creative Strategist.”
- **UI**: show token/time columns (simulated), collapsible outputs, “Why this differs” explainer.

### D. History
- Fully functional list/grid of past **Demo** sessions.
- Detail view opens and replays. **Continue** button shows lock hover: “Continue requires Free Trial.”
- Bulk actions allowed; **Export** shows lock.

---

## 3) Artwork & banners

- **Chat**: speech‑bubble mosaic + “DEMO MODE” pill.
- **Debate**: split “VS” lightning motif.
- **Compare**: columns with sliders/checks motif.
- **History**: stacked paper + clock/glyph.

---

## 4) Architecture

- `AccountState`: `{ isTrialActive: boolean; isPaid: boolean }`
- `DemoState`: `{ enabled: boolean; packVersion: string; }`
- `isDemo = !account.isTrialActive && !account.isPaid`

Adapters:
- `VirtualChatAdapter` feeds events from recorded logs to chat UI.
- `VirtualDebateAdapter` and `VirtualCompareAdapter` similar.

Playback engine streams deltas with delays.

---

## 5) Data model (Demo Content Pack v1)

```ts
export interface DemoPackV1 {
  version: '1';
  locale: 'en-US';
  chats: DemoChat[];
  debates: DemoDebate[];
  compares: DemoCompare[];
  historyRefs: DemoHistoryRef[];
  assets: Record<string, string>;
  meta: { build: string; createdAt: string };
}
```

Events include: message, stream, tool-start, tool-end, image-grid, pause, divider.

---

## 6) Rendering integration

- Implement playback adapters conforming to live adapter interfaces.
- Message components unchanged; they consume the same props.

---

## 7) Content pipeline

- **Recorder** (dev‑only): captures real sessions and exports JSON + assets.
- **Curate**: remove sensitive data.
- **Pack**: bundle JSON + assets.
- **Load**: ship bundle, refresh optionally from CDN.

---

## 8) Gating & paywall glue

- Intercept Send in Chat → locked user bubble + toast + CTA.
- Continue in History → locked with CTA.
- Copy: “This is Demo Mode. Real requests require a Free Trial.”

---

## 9) Analytics

- Impressions: demo banners.
- Engagement: replays, scrolls, speed changes.
- Friction: attempted sends/continues.
- Conversion: CTA taps.

---

## 10) Accessibility & i18n

- Alt text on demo images.
- VoiceOver announcements for streaming.
- WCAG AA banners.
- All copy localized.

---

## 11) Legal/brand safety

- If real provider names used, show disclaimer: “Simulated samples.”
- Build flag to switch to neutral names.

---

## 12) Performance

- Bundle budget: ≤8 MB compressed.
- Convert demo images to WebP.
- Lazy‑load heavy sessions.

---

## 13) QA checklist

- Streaming cadence natural at 1×/1.5×.
- Image grid appears with chips.
- Input sends greyed bubble.
- Offline works.
- Dark mode banners readable.
- History items deny Continue with correct lock copy.

---

## 14) Milestones

1. Scaffold & gating
2. Playback engine
3. Data & assets
4. Screen integrations
5. Recorder
6. Polish
7. Hardening

---

## 15) Definition of Done

- Each screen has banners + CTAs.
- At least 6 demo chats, 4 debates, 6 compares.
- Replay works, Continue locked.
- Images/tool calls simulated believably.
- Analytics firing.
- No live calls possible in Demo.

---

## 16) Example code snippets

```ts
export const useEntitlements = () => {
  const account = useAccount();
  const isDemo = !account.isTrialActive && !account.isPaid;
  return { isDemo };
};
```

---

## 17) Risks & mitigations

- Over‑promise → mark “Simulated”.
- Bundle bloat → compress, lazy load.
- Legal risk → disclaimers, neutral mode.

---

## 18) Documentation updates

- `README.md`: overview.
- `docs/demo-content.md`: schema, authoring, assets.
- `docs/analytics.md`: funnel events.

---

## 19) Content shipping plan

- Chats: Kyoto itinerary, React Native refactor, SQL CTE, logo ideation, kid‑friendly transformers, multi‑AI discussions.
- Debates: renewables vs nuclear, homework, Mars, pineapple, AGI alignment.
- Compares: provider, model, persona comparisons.

---
