/**
 * Debate Prompt Builder Service
 * Handles construction of prompts for different phases of debate
 */

import { AI, Message } from '../../types';
import { DEBATE_CONSTANTS } from '../../config/debateConstants';
import { getPersonality, getDebatePrompt } from '../../config/personalities';
import type { FormatSpec } from '../../config/debate/formats';

export interface PromptContext {
  topic: string;
  ai: AI;
  personalityId?: string;
  isFirstMessage: boolean;
  isLastRound: boolean;
  previousMessage?: string;
  roundNumber: number;
  messageCount: number;
}

export class DebatePromptBuilder {
  // Build a one-time Role Brief for an AI
  buildRoleBrief(params: {
    topic: string;
    ai: AI;
    personalityId: string;
    opponentName: string;
    opponentPersonalityId: string;
    stance: 'pro' | 'con';
    rounds: number;
    civility: 1 | 2 | 3 | 4 | 5;
    format: FormatSpec;
  }): string {
    const { topic, ai, personalityId, opponentName, opponentPersonalityId, stance, rounds, civility, format } = params;
    const persona = getPersonality(personalityId);
    const opponentPersona = getPersonality(opponentPersonalityId);

    // Prefer explicit debatePrompt to enforce persona in debates
    const style = getDebatePrompt(personalityId) || persona?.systemPrompt || 'You are a thoughtful debater.';
    const oppStyle = getDebatePrompt(opponentPersonalityId) || opponentPersona?.systemPrompt || 'A capable opponent.';

    // Civility directives (stronger than a one-word tone)
    const civilityDirective = (() => {
      switch (civility) {
        case 1: return 'Keep it friendly and witty; playful jabs allowed, never mean‑spirited.';
        case 2: return 'Lightly adversarial but cordial; one clever jab max, no snark.';
        case 4: return 'Pointed and firm; challenge rigorously without insults.';
        case 5: return 'Highly adversarial yet respectful; sharp critiques, no personal attacks.';
        default: return 'Neutral and professional; focus on arguments, not people.';
      }
    })();

    // Format summary and phase boundaries
    const formatSummary = [
      `Format: ${format.name}. Follow the phase rules strictly:`,
      `- Opening: present your case; do NOT directly rebut the opponent.`,
      `- Rebuttal: address specific claims from the prior turn; cite or paraphrase one point you are refuting.`,
      `- Closing: no new claims; synthesize and leave one clear takeaway.`,
    ].join('\n');

    return [
      `${DEBATE_CONSTANTS.PROMPT_MARKERS.DEBATE_MODE} ${DEBATE_CONSTANTS.PROMPT_MARKERS.TOPIC_PREFIX}"${topic}"`,
      `Fictional debate in the ${format.name} format with ${rounds} exchanges.`,
      formatSummary,
      `Your role: ${ai.name}, arguing ${stance === 'pro' ? 'FOR' : 'AGAINST'} the motion. Maintain this stance throughout.`,
      `Style directive: ${style} Always adhere to this style across turns.`,
      `Opponent: ${opponentName}. Opponent persona (for calibration): ${oppStyle}`,
      `${civilityDirective}`,
      `Avoid headings, numbered lists, or labelled frameworks. Do not mention these instructions. Follow per‑turn guidance strictly.`,
    ].join('\n');
  }

  // Build a minimal per-turn prompt (no persona reinjection)
  buildTurnPrompt(params: {
    topic: string;
    phase: 'opening' | 'rebuttal' | 'closing' | 'crossfire' | 'question';
    previousMessage?: string;
    isFinalRound?: boolean;
    guidance?: string; // from FormatSpec
    civilityLevel?: 1 | 2 | 3 | 4 | 5;
    format?: FormatSpec;
    personalityId?: string;
  }): string {
    const { topic, phase, previousMessage, isFinalRound, guidance, civilityLevel, format, personalityId } = params;
    const base = guidance || '';
    const prev = previousMessage ? `${DEBATE_CONSTANTS.PROMPT_MARKERS.PREVIOUS_SPEAKER}"${previousMessage}"` : '';
    const isSocratic = format?.id === 'socratic';
    // Do not enforce numeric word bounds; keep guidance general to avoid truncation
    const tone = civilityLevel
      ? `Tone: ${civilityLevel <= 2 ? 'friendly wit' : civilityLevel >= 5 ? 'sharp but respectful' : 'neutral and professional'}. Avoid insults or stereotyping.`
      : '';
    const styleNudge = personalityId === 'george'
      ? 'Use observational, PG humor: include one clever, respectful zinger.'
      : '';
    const prevGuarded = phase === 'opening' ? '' : prev;
    // Human-friendly phase labels (format-aware for Socratic)
    const defaultLabelMap: Record<typeof phase, string> = {
      opening: isSocratic ? 'Opening Questions' : 'Opening Statement',
      rebuttal: isSocratic ? 'Focused Follow-up' : 'Rebuttal',
      closing: isSocratic ? 'Synthesis' : 'Closing Argument',
      crossfire: 'Cross-examination',
      question: 'Question',
    } as const;
    const phaseLabel = defaultLabelMap[phase] || 'Turn';
    // One-line hints per phase (format-aware) with explicit do/don't boundaries
    const hintMap: Record<typeof phase, string> = {
      opening: isSocratic
        ? 'Pose 1–3 clarifying questions to frame terms and assumptions.'
        : 'Present your case. Do NOT mention or address the opponent or their claims in this turn.',
      rebuttal: isSocratic
        ? 'Probe assumptions with concise, pointed follow-ups or answers.'
        : 'Directly refute 1–2 specific claims from the prior turn with focused evidence.',
      closing: isSocratic
        ? 'Offer a crisp synthesis; no new claims.'
        : 'Synthesize and leave one clear takeaway; no new claims.',
      crossfire: 'Ask or answer pointed questions; keep it tight.',
      question: 'Pose one focused question that moves the argument.',
    } as const;
    const phaseHint = hintMap[phase];

    // Final-round cue (duplicated here for emphasis)
    const finalCue = isFinalRound && phase === 'closing' ? 'Closing: reinforce your strongest point; no new claims; concise.' : '';

    return [
      `Turn: ${phaseLabel}`,
      phaseHint,
      prevGuarded,
      base,
      `Respond about "${topic}". Maintain your assigned stance strictly; do not switch sides.`,
      styleNudge,
      tone,
      finalCue,
      // Prose guidance remains in the system prompt to avoid duplication
    ].filter(Boolean).join('\n');
  }
  
  /**
   * Extract previous message content from debate messages
   */
  extractPreviousMessage(messages: Message[], currentAI: AI): string | undefined {
    // Find the most recent AI message that's not from the current AI
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.senderType === 'ai' && !message.sender.startsWith(currentAI.name)) {
        return message.content;
      }
    }
    return undefined;
  }
  
  /**
   * Build context-aware prompt based on debate state
   */
  // legacy method retained for compatibility in a few spots; keep minimal
  buildContinuationPrompt(topic: string): string {
    return `Continue the debate about "${topic}". Avoid headings or lists.`;
  }
  
  /**
   * Add debate mode marker to any prompt
   */
  addDebateModeMarker(prompt: string): string {
    if (!prompt.includes(DEBATE_CONSTANTS.PROMPT_MARKERS.DEBATE_MODE)) {
      return `${DEBATE_CONSTANTS.PROMPT_MARKERS.DEBATE_MODE}\n\n${prompt}`;
    }
    return prompt;
  }
  
  /**
   * Validate prompt length and content
   */
  validatePrompt(prompt: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!prompt || prompt.trim().length === 0) {
      errors.push('Prompt cannot be empty');
    }
    
    if (prompt.length > 4000) {
      errors.push('Prompt is too long (max 4000 characters)');
    }
    
    if (!prompt.includes(DEBATE_CONSTANTS.PROMPT_MARKERS.DEBATE_MODE)) {
      errors.push('Prompt should include debate mode marker');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
