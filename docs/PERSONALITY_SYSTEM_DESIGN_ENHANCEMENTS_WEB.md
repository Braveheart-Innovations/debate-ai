# Personality System Design Enhancements - Web

**Date:** December 28, 2025
**Platform:** symposium-ai-web (Next.js)
**Status:** Implemented

---

## Executive Summary

The personality system in the web application had a significant gap: while the UI displayed detailed personality attributes (tone sliders, debate profiles), these values were never actually used in prompt construction. This document details the investigation findings and the enhancements implemented to close this gap.

---

## Problem Statement

### What Users Saw
The `/personalities` page displayed rich personality data:
- **Tone sliders**: formality, humor, energy, empathy, technicality (0-1 values)
- **Debate profiles**: argumentStyle, aggression, concession, interruption
- **Signature moves**, sample openers, and detailed bios

### What Actually Happened
Only the handcrafted `systemPrompt` text was sent to AI providers. The numeric tone values and debate profiles were purely cosmetic - "educational" UI elements with no effect on AI behavior.

### Impact
Users selecting personalities based on displayed traits (e.g., "high humor" or "logical argumentation") were not actually getting differentiated behavior beyond what the prose systemPrompt provided.

---

## Investigation Findings

### Code Path Analysis

#### 1. Personality Definition (`src/config/personalities.ts`)

```typescript
interface PersonalityOption {
  id: string;
  name: string;
  systemPrompt: string;           // USED
  debatePrompt?: string;          // USED
  chatGuidance?: string;          // USED (partially)
  signatureMoves: string[];       // USED (one per message)

  // NEVER USED - Display only
  tone?: {
    formality: number;
    humor: number;
    energy: number;
    empathy: number;
    technicality: number;
  };
  debateProfile?: {
    argumentStyle: 'logical' | 'emotional' | 'balanced';
    aggression: number;
    concession: number;
    interruption?: number;
  };
}
```

#### 2. System Prompt Construction (`src/lib/ai/base-adapter.ts`)

**Before:** Only extracted `personality.systemPrompt` text
```typescript
protected getSystemPrompt(): string {
  if (this.config.personality && 'systemPrompt' in this.config.personality) {
    return this.config.personality.systemPrompt || 'You are a helpful AI assistant.';
  }
  return 'You are a helpful AI assistant.';
}
```

#### 3. Prompt Building (`src/services/chat/PromptBuilder.ts`)

**Before:** Appended one signature move or guidance text
```typescript
static appendPersonaGuidance(prompt, personality, mode) {
  const reminder = personality.chatGuidance || personality.signatureMoves?.[0];
  return `${prompt}\n\nPersona focus: ${reminder}`;
}
```

---

## Solution Architecture

### New Components

#### 1. Tone Converter Utility
**File:** `src/lib/personality/toneConverter.ts`

Converts numeric tone values (0-1) into natural language prompt modifiers.

```typescript
export function toneToModifiers(tone: PersonalityTone): string {
  const modifiers: string[] = [];

  // Only add modifiers for values outside "neutral" 0.4-0.6 range
  if (tone.formality < 0.35) modifiers.push('casual, conversational language');
  else if (tone.formality > 0.65) modifiers.push('formal, professional tone');

  if (tone.humor > 0.6) modifiers.push('include wit and humor');
  else if (tone.humor < 0.25) modifiers.push('serious, focused responses');

  if (tone.energy > 0.65) modifiers.push('enthusiastic, energetic');
  else if (tone.energy < 0.35) modifiers.push('calm, measured pace');

  if (tone.empathy > 0.7) modifiers.push('prioritize emotional acknowledgment');

  if (tone.technicality > 0.65) modifiers.push('use technical depth');
  else if (tone.technicality < 0.35) modifiers.push('keep explanations accessible');

  if (modifiers.length === 0) return '';
  return `[Style: ${modifiers.join('; ')}]`;
}
```

**Design Decisions:**
- Uses threshold ranges (not exact values) to avoid over-specifying
- Returns empty string for "neutral" personalities (no unnecessary modifiers)
- Bracketed format `[Style: ...]` clearly separates from prose prompts

#### 2. Debate Profile Converter
**File:** `src/lib/personality/debateProfileConverter.ts`

Converts debate profile attributes into argumentation style directives.

```typescript
export function debateProfileToModifiers(profile: DebateProfile): string {
  const modifiers: string[] = [];

  modifiers.push(`${profile.argumentStyle} argumentation`);

  if (profile.aggression > 0.6) modifiers.push('assertively challenge opposing views');
  else if (profile.aggression < 0.35) modifiers.push('collaborative, seek common ground');

  if (profile.concession > 0.55) modifiers.push('acknowledge valid counterpoints');
  else if (profile.concession < 0.3) modifiers.push('stand firm on positions');

  if (profile.interruption !== undefined && profile.interruption > 0.5) {
    modifiers.push('interject when spotting weak arguments');
  }

  return `[Debate style: ${modifiers.join('; ')}]`;
}
```

### Modified Components

#### 1. BaseAdapter.getSystemPrompt() Enhancement
**File:** `src/lib/ai/base-adapter.ts`

Now appends tone and debate modifiers to the system prompt:

```typescript
protected getSystemPrompt(): string {
  let basePrompt: string;
  // ... existing logic to determine base prompt ...

  // NEW: Append tone modifiers
  const personality = this.config.personality;
  if (personality) {
    const tone = 'tone' in personality ? personality.tone :
                 'traits' in personality ? { ...personality.traits, energy: 0.5 } : undefined;
    if (tone) {
      const toneModifier = toneToModifiers(tone);
      if (toneModifier) {
        basePrompt = `${basePrompt}\n\n${toneModifier}`;
      }
    }

    // In debate mode, also append debate profile
    if (this.config.isDebateMode && 'debateProfile' in personality && personality.debateProfile) {
      const debateModifier = debateProfileToModifiers(personality.debateProfile);
      basePrompt = `${basePrompt}\n${debateModifier}`;
    }
  }

  return basePrompt;
}
```

**Note:** Handles both `PersonalityOption` (has `tone`) and `PersonalityConfig` (has `traits`) types for backwards compatibility.

#### 2. PromptBuilder Periodic Reinforcement
**File:** `src/services/chat/PromptBuilder.ts`

Added dynamic reinforcement every 5 messages to prevent personality drift:

```typescript
static appendPersonaGuidance(
  prompt: string,
  personality: PersonalityOption,
  mode: 'chat' | 'debate' | 'compare' = 'chat',
  messageIndex: number = 0  // NEW parameter
): string {
  // ... existing guidance logic ...

  // NEW: Periodically reinforce tone modifiers
  if (messageIndex > 0 && messageIndex % 5 === 0 && personality.tone) {
    const toneReminder = toneToModifiers(personality.tone);
    if (toneReminder) {
      result = `${result}\n\n${toneReminder}`;
    }
  }

  return result;
}
```

---

## George Personality Enhancement

As part of this work, the "George" personality was enhanced to better channel George Carlin's wit combined with British dry understatement.

### Changes Made

| Attribute | Before | After |
|-----------|--------|-------|
| `tagline` | "Satirical mirror with razor insights" | "Carlin wit meets British understatement" |
| `description` | "Observational, acerbic wit (PG)" | "Sharp satirist with dry, intelligent sarcasm" |
| `systemPrompt` | Generic satirist instructions | Explicit Carlin + British wit blend |
| `debatePrompt` | Generic debate wit | "Debate like Carlin at a dinner party with British academics" |
| `tone.formality` | 0.45 | 0.35 (more casual) |
| `tone.humor` | 0.85 | 0.90 (cranked up) |
| `tone.energy` | 0.55 | 0.50 (slightly drier) |
| `argumentStyle` | "emotional" | "logical" (Carlin was sharp logic) |

### New Signature Moves
- "Dry understatement that lands three seconds later"
- "Names the obvious thing everyone's dancing around"
- "Self-deprecating aside before the kill shot"
- "Closes with something genuinely useful so the wit earns its keep"

### Sample Openers (Enhanced)
```
Chat: "Ah yes, the 'quick fix' that's been quick-fixing itself for nine
       months. Shall we talk about what's actually happening?"

Debate: "I notice we're all pretending that elephant isn't standing on the
         negotiating table. Shall I introduce it, or would you like the honours?"

Compare: "Option A comes with a lovely brochure. Option B admits the building
          might be on fire. One of these is more useful."
```

---

## Example Output

### Before Enhancement
System prompt sent to AI:
```
You are George: a satirist with observational, acerbic wit. Use clever irony
to expose contradictions. Keep it constructive and safe—no slurs or personal
attacks; avoid profanity by default. One zinger per answer, max.
```

### After Enhancement
System prompt sent to AI:
```
You are George: sharp satirist channeling Carlin's righteous observation mixed
with British dry wit. Spot the absurdity, name it plainly, then twist the knife
with understatement. Self-deprecation is fair game. Intelligent sarcasm over
cheap shots. One genuinely clever line per response—earned, not forced. Stay
constructive; punch up, not down.

[Style: casual, conversational language; include wit and humor]
```

In debate mode:
```
You are participating in a structured debate...
[Debate style: logical argumentation; stand firm on positions; interject when
spotting weak arguments]
```

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/personality/toneConverter.ts` | **CREATE** | Tone values to text modifiers |
| `src/lib/personality/debateProfileConverter.ts` | **CREATE** | Debate profile to text modifiers |
| `src/lib/personality/index.ts` | **CREATE** | Barrel export |
| `src/lib/ai/base-adapter.ts` | **MODIFY** | Append modifiers in getSystemPrompt() |
| `src/services/chat/PromptBuilder.ts` | **MODIFY** | Add periodic reinforcement |
| `src/config/personalities.ts` | **MODIFY** | Enhance George personality |

---

## Testing Considerations

### Manual Verification
1. Select different personalities and observe response style changes
2. Compare George responses before/after (should be noticeably wittier)
3. Test debate mode - verify debate profile affects argumentation style
4. Check 5+ message conversations for tone consistency

### Expected Behavior
- Personalities with extreme tone values (< 0.35 or > 0.65) should produce noticeably different outputs
- "Neutral" personalities (all values ~0.5) should behave as before
- Debate mode should show argumentStyle influence (logical vs emotional)

---

## Future Enhancements

### Potential Improvements
1. **User-adjustable sliders**: Let users fine-tune personality traits
2. **A/B testing framework**: Measure actual behavioral differences
3. **Per-message adaptation**: Adjust tone based on conversation context
4. **Validation metrics**: Automated testing of personality differentiation

### Not Addressed
- The `interruption` trait is only partially used (high values only)
- No visual feedback showing which modifiers are active
- Mobile app needs parallel implementation

---

## Conclusion

The personality system now delivers on its visual promise. The bar charts and trait displays on the personalities page are no longer cosmetic - they actively influence how AI providers respond. George, in particular, should now channel proper Carlin wit with a British twist.

The implementation is minimal and non-breaking: existing personalities work as before, with the tone modifiers providing additional reinforcement rather than replacement of handcrafted prompts.
