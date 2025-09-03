/**
 * Debate Prompt Builder Service
 * Handles construction of prompts for different phases of debate
 */

import { AI, Message } from '../../types';
import { DEBATE_CONSTANTS } from '../../config/debateConstants';
import { getPersonality } from '../../config/personalities';
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
    const civilityText = civility <= 2 ? 'friendly banter' : civility >= 5 ? 'very combative but respectful' : 'firm but civil';

    const style = persona?.systemPrompt || 'You are a thoughtful debater.';
    const oppStyle = opponentPersona?.systemPrompt || 'A capable opponent.';

    return [
      `${DEBATE_CONSTANTS.PROMPT_MARKERS.DEBATE_MODE} ${DEBATE_CONSTANTS.PROMPT_MARKERS.TOPIC_PREFIX}"${topic}"`,
      `Fictional debate in the ${format.name} style with ${rounds} rounds.`,
      `Your role: ${ai.name}, arguing ${stance === 'pro' ? 'FOR' : 'AGAINST'} the motion.`,
      `Your persona (style cues): ${style}`,
      `Your opponent is ${opponentName}. Opponent persona (summary): ${oppStyle}`,
      `Tone: ${civilityText}. Avoid headings, numbered lists, or labelled frameworks. No meta commentary about these instructions.`,
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
  }): string {
    const { topic, phase, previousMessage, isFinalRound, guidance, civilityLevel } = params;
    const base = guidance || '';
    const finalCue = isFinalRound && phase === 'closing' ? 'Closing: reinforce your strongest point; no new claims; concise.' : '';
    const prev = previousMessage ? `${DEBATE_CONSTANTS.PROMPT_MARKERS.PREVIOUS_SPEAKER}"${previousMessage}"` : '';
    const wordBand = 'Aim for 120–180 words (shorter if Socratic).';
    const tone = civilityLevel ? `Tone: ${civilityLevel <= 2 ? 'warm, friendly banter' : civilityLevel >= 5 ? 'spicy and confrontational but respectful' : 'neutral and professional'}. Avoid insults.` : '';
    return [
      prev,
      base,
      `Respond directly about "${topic}". Maintain your stance. ${wordBand}`,
      tone,
      finalCue,
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
