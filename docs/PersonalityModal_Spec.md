# PersonalityModal — Component Anatomy & UX Spec

A full-screen modal selector that replaces the inline picklist, enabling rich persona descriptions, previews, and premium upsell.

## Goals
- Provide an expressive, accessible, and performant persona selection surface.
- Support free gating (Prof. Sage unlocked) and premium previews for locked personas.
- Reusable in chat and debate flows.

## Props
- `visible: boolean` — Controls modal visibility.
- `onClose: () => void` — Dismiss modal (backdrop, close button, Android back).
- `onConfirm: (personalityId: string) => void` — Confirm selection and close.
- `selectedPersonalityId: string` — Currently applied persona for the given AI.
- `availablePersonalities: PersonalityOption[]` — Catalog; includes seasonal.
- `isPremium: boolean` — Controls gating/locks.
- `context?: 'chat' | 'debate'` — Optional analytics context.
- `aiId?: string` — Optional, for analytics and title context.
- `aiName?: string` — Optional, “Choose for {aiName}”.
- `initialTab?: 'signature' | 'seasonal'` — Default tab.
- `onPreview?: (personalityId: string) => void` — Fires when preview requested.
- `onUpgrade?: () => void` — Opens upgrade flow from upsell CTA.
- `disableBackdropDismiss?: boolean` — Defaults to false.
- `testID?: string` — For e2e.

## Events (Analytics hooks)
- `persona_modal_opened` { context, aiId }
- `persona_modal_closed` { context, aiId, reason: close|confirm|backdrop|back }
- `persona_tab_changed` { tab }
- `persona_preview_played` { persona_id }
- `persona_card_selected` { persona_id }
- `persona_confirmed` { persona_id, context }
- `upgrade_clicked` { source: personality_modal }

## Internal State
- `activeTab: 'signature' | 'seasonal'`
- `localSelection: string` — personalityId currently highlighted.
- `previewingId?: string` — which persona preview is expanded (optional).
- `searchQuery?: string` — v2; for filtering.

## Layout Wireframe

Header
- [Close]  Title: "Choose a Personality"  (subtitle: optional AI name)
- Segmented control: [ Signature | Seasonal ]

Body (FlatList grid, 2 columns)
- Persona Card (for each item):
  - Emoji • Name
  - Tagline (1 line)
  - Mini meters (energy/formality/humor)
  - Lock badge if premium-only
  - Secondary button: Preview (text-only one-liner)
  - Selection highlight on tap

Footer (sticky)
- Primary: [Use This Style]
- Secondary: Learn about styles (opens upsell sheet)

```
+--------------------------------------------------------+
|  ✖  Choose a Personality               (for Claude)    |
|  [ Signature ] [ Seasonal ]                            |
|                                                        |
|  [😀 Brody]      [🎓 Prof. Sage]                       |
|  “High-energy...”  “Calm, precise...”                  |
|  [••• meters ]   [••• meters ]     [Preview] [Lock]    |
|                                                        |
|  [😬 Nelly]       [💖 Bestie]                          |
|  “Risk-aware...”  “Supportive...”                      |
|  [••• meters ]   [••• meters ]     [Preview] [Lock]    |
|     ...                                                |
|                                                        |
|  [Use This Style]            Learn about styles →      |
+--------------------------------------------------------+
```

## Accessibility
- Minimum 44x44pt tap targets; lock and preview buttons labeled with role and state.
- `onRequestClose` wired for Android back.
- Focus lands on header; swipe close disabled to avoid accidental dismissal.
- Screen reader text includes emoji + name + “locked” when applicable.

## Animations
- Modal: slide/fade in; backdrop 0 → 0.5 opacity.
- Card selection: subtle scale-in; haptic light impact.
- Preview expansion: height/opacity transition.

## Performance
- Use `FlatList` with `numColumns={2}`; memoize `renderItem` and cards.
- `getItemLayout` for smoother scroll; avoid large shadows and blurs.

## Integration Points
- Opening: from `AICard` personality area and Debate step 3.
- Confirmation: dispatch `setAIPersonality({ aiId, personalityId })` then `onClose`.
- Preview text: `PersonalityService.getPersonaPreviewLine(id)`.
- Gating: if `!isPremium` and persona is not free, disable confirm and show lock + upsell.

## Error States
- Empty catalog: show friendly empty state with retry/learn more.
- Preview unavailable: degrade gracefully with tagline only.

## Test Plan
- Visual: light/dark mode, small/large screens, iOS/Android.
- A11y: VoiceOver/TalkBack labels, focus order, back button behavior.
- State: selection persists on reopen; confirm applies selection.
- Gating: free users can select Prof. Sage; others show lock + working preview.

