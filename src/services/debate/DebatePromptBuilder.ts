/**
 * Debate Prompt Builder Service
 * Handles construction of prompts for different phases of debate
 */

import { AI, Message } from '../../types';
import { DEBATE_CONSTANTS } from '../../config/debateConstants';
import type { FormatSpec, PhaseId } from '../../config/debate/formats';
import { getDebateSpeechLengthGuidance } from './debateSpeechLength';

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

type CxRole = 'questioner' | 'answerer';

const getFormatPhaseConstraint = (
  formatId: FormatSpec['id'] | undefined,
  phase: PhaseId,
  cxRole?: CxRole,
  messageLabel?: string
): string => {
  const label = (messageLabel || '').toLowerCase();

  switch (formatId) {
    case 'lincoln_douglas':
      if (phase === 'constructive') {
        if (label.includes('ac') || label.includes('affirmative constructive')) {
          return 'Lincoln-Douglas AC contract: define key terms, name one central value, state a criterion, and build contentions that link back to that criterion. Do not offer a policy plan or solvency mechanism.';
        }
        if (label.includes('nc') || label.includes('1nr') || label.includes('negative constructive')) {
          return 'Lincoln-Douglas NC/1NR contract: answer the affirmative value and criterion, offer or defend the negative standard, then build negative contentions under that standard. Do not drift into a policy plan.';
        }
        return 'Lincoln-Douglas structure: define the central value and criterion, then organize contentions under that standard. Do not drift into a policy plan.';
      }
      if (phase === 'cross_examination') {
        return cxRole === 'questioner'
          ? 'Lincoln-Douglas CX: ask concise questions that force commitments on definitions, value, criterion, links, and conceded contentions. Do not make speeches.'
          : 'Lincoln-Douglas CX: answer directly, protect your value and criterion, clarify concessions, and do not introduce a new constructive case.';
      }
      if (phase === 'rebuttal' || phase === 'final_rebuttal' || phase === 'closing') {
        if (label.includes('1ar')) {
          return 'Lincoln-Douglas 1AR contract: rebuild the affirmative case, answer NC/1NR attacks, and compare standards explicitly. Do not add new contention shells.';
        }
        if (label.includes('nr/2nr') || label.includes('2nr')) {
          return 'Lincoln-Douglas NR/2NR contract: collapse to the winning value and criterion clash, extend decisive turns, and explain why affirmative burdens fail. Do not add a new constructive case.';
        }
        if (label.includes('2ar')) {
          return 'Lincoln-Douglas 2AR ballot contract: crystallize the value and criterion, compare voters, and give the judge a clear reason for the affirmative ballot. No new claims.';
        }
        return 'Lincoln-Douglas weighing: compare the value clash and criterion directly; explain why your standard decides the round.';
      }
      return '';
    case 'policy':
      if (phase === 'constructive') {
        if (label.includes('1ac') || label.includes('first affirmative constructive')) {
          return 'Policy 1AC contract: state the plan text or affirmative advocacy, explain harms, inherency or burden, solvency, and impact links. Use selective support, not a laundry list.';
        }
        if (label.includes('1nc') || label.includes('first negative constructive')) {
          return 'Policy 1NC contract: answer the case and establish negative offense such as disadvantages, counterplan or status quo burden, topicality, or solvency deficits. Keep links and impacts explicit.';
        }
        if (label.includes('2ac') || label.includes('second affirmative constructive')) {
          return 'Policy 2AC contract: answer 1NC positions, rebuild plan solvency, answer disadvantages or counterplans, and extend affirmative advantages.';
        }
        if (label.includes('2nc') || label.includes('second negative constructive')) {
          return 'Policy 2NC contract: develop the negative\'s best positions, extend link and impact stories, answer 2AC recovery, and prepare a clean 2NR collapse.';
        }
        return 'Policy structure: identify the plan, counterplan, or status quo burden; explain solvency, harms or advantages, and impact links.';
      }
      if (phase === 'cross_examination') {
        return cxRole === 'questioner'
          ? 'Policy CX: ask concise questions that clarify plan text and press solvency mechanism, burden, links, and impact chain concessions. Do not give mini-speeches.'
          : 'Policy CX: answer concessions directly, defend the plan, counterplan, or burden, and do not introduce new off-case positions.';
      }
      if (phase === 'rebuttal' || phase === 'final_rebuttal' || phase === 'closing') {
        if (label.includes('1nr')) {
          return 'Policy 1NR contract: extend a compact negative position, answer 2AC responses, and set up the 2NR without adding new off-case positions.';
        }
        if (label.includes('1ar')) {
          return 'Policy 1AR contract: cover the flow efficiently, rebuild key affirmative offense, and answer negative voters. Do not add a new plan.';
        }
        if (label.includes('2nr')) {
          return 'Policy 2NR ballot contract: collapse to the winning negative issues, compare impacts, identify dropped arguments, and explain the decision rule.';
        }
        if (label.includes('2ar')) {
          return 'Policy 2AR ballot contract: collapse to the winning affirmative issues, answer the 2NR, compare impacts, handle dropped arguments, and explain why the plan wins.';
        }
        return 'Policy weighing: compare impacts, collapse to the winning issues, identify dropped arguments, and state the decision rule.';
      }
      return '';
    case 'oxford':
      if (phase === 'opening') {
        return 'Oxford opening speech: frame the motion and burden clearly for the audience. Build your case without rebutting yet.';
      }
      if (phase === 'rebuttal' || phase === 'final_rebuttal') {
        return 'Oxford floor debate: answer prior claims, test the clash, and rebuild your side of the motion.';
      }
      if (phase === 'question') {
        return 'Oxford audience Q&A: answer the audience question addressed to your side directly, then tie the answer back to why the audience should support your side.';
      }
      if (phase === 'closing') {
        return 'Oxford closing speech: crystallize why the audience should vote with your side and do not introduce new claims.';
      }
      return '';
    case 'socratic':
      if (phase === 'opening' || phase === 'question') {
        return 'Socratic inquiry: stay question-led, surface assumptions, and avoid grandstanding.';
      }
      if (phase === 'rebuttal') {
        return 'Socratic follow-up: probe tensions in the prior answer and keep the exchange inquiry-led.';
      }
      if (phase === 'synthesis' || phase === 'closing') {
        return 'Socratic synthesis: name the clearest insight, remaining assumption, or unresolved tension.';
      }
      return '';
    default:
      return '';
  }
};

export class DebatePromptBuilder {
  // Build a minimal per-turn prompt (no persona reinjection)
  buildTurnPrompt(params: {
    topic: string;
    phase: PhaseId;
    previousMessage?: string;
    isFinalRound?: boolean;
    guidance?: string; // from FormatSpec
    format?: FormatSpec;
    presetId?: string;
    messageLabel?: string;
    roleBrief?: string;
    sameSpeakerPreviousMessage?: string;
    cxRole?: 'questioner' | 'answerer';
    audienceQuestion?: string;
  }): string {
    const { topic, phase, previousMessage, isFinalRound, guidance, format, presetId, messageLabel, roleBrief, sameSpeakerPreviousMessage, cxRole, audienceQuestion } = params;
    const base = guidance || '';
    const prev = previousMessage ? `${DEBATE_CONSTANTS.PROMPT_MARKERS.PREVIOUS_SPEAKER}"${previousMessage}"` : '';
    const isSocratic = format?.id === 'socratic';
    const prevGuarded = phase === 'opening' || phase === 'constructive' ? '' : prev;
    // Human-friendly phase labels (format-aware for Socratic)
    const defaultLabelMap: Record<PhaseId, string> = {
      opening: isSocratic ? 'Opening Questions' : 'Opening Statement',
      constructive: 'Constructive Speech',
      rebuttal: isSocratic ? 'Focused Follow-up' : 'Rebuttal',
      final_rebuttal: 'Final Rebuttal',
      closing: isSocratic ? 'Synthesis' : 'Closing Argument',
      cross_examination: cxRole === 'questioner' ? 'Cross-Examination (Questions)' : 'Cross-Examination (Answers)',
      question: 'Question',
      synthesis: 'Synthesis',
    } as const;
    const phaseLabel = messageLabel || defaultLabelMap[phase] || 'Turn';
    // One-line hints per phase (format-aware) with explicit do/don't boundaries
    const hintMap: Record<PhaseId, string> = {
      opening: isSocratic
        ? 'Pose 1–3 clarifying questions to frame terms and assumptions.'
        : 'Present your case. Do NOT mention or address the opponent or their claims in this turn.',
      constructive: 'Present your constructive case with supporting evidence. You may introduce new arguments.',
      rebuttal: isSocratic
        ? 'Probe assumptions with concise, pointed follow-ups or answers.'
        : 'Directly refute 1–2 specific claims from the prior turn with focused evidence.',
      final_rebuttal: 'Reinforce your strongest points. No new arguments.',
      closing: isSocratic
        ? 'Offer a crisp synthesis; no new claims.'
        : 'Synthesize and leave one clear takeaway; no new claims.',
      cross_examination: cxRole === 'questioner'
        ? 'Ask pointed questions to expose weaknesses in the opponent\'s case.'
        : 'Answer directly and defend your position. Be concise.',
      question: 'Pose one focused question that moves the argument.',
      synthesis: 'Identify the strongest insight or unresolved tension; be concise.',
    } as const;
    const phaseHint = hintMap[phase];
    const formatAwarePhaseHint = format?.id === 'oxford' && phase === 'question'
      ? 'Answer the audience question directly in a short response. Do not ask a new question.'
      : phaseHint;
    const formatConstraint = getFormatPhaseConstraint(format?.id, phase, cxRole, messageLabel);
    const audienceQuestionLine = audienceQuestion
      ? `Audience question for your side: "${audienceQuestion}"`
      : '';
    const sameSpeakerPreviousLine = sameSpeakerPreviousMessage && (phase === 'closing' || phase === 'final_rebuttal' || phase === 'synthesis')
      ? `Earlier speech by you to avoid repeating: "${this.getContextSnippet(sameSpeakerPreviousMessage)}"\nDo not restate that speech. Use it only as source material for a fresh summary that weighs what happened since.`
      : '';
    const lengthGuidance = getDebateSpeechLengthGuidance({
      formatId: format?.id,
      presetId,
      phase,
      cxRole,
    }).directive;

    // Final-round cue (duplicated here for emphasis)
    const finalCue = isFinalRound && phase === 'closing' ? 'Closing: reinforce your strongest point; no new claims; concise.' : '';

    return [
      `Turn: ${phaseLabel}`,
      roleBrief,
      formatAwarePhaseHint,
      formatConstraint,
      audienceQuestionLine,
      sameSpeakerPreviousLine,
      lengthGuidance,
      prevGuarded,
      base,
      `Respond about "${topic}". Maintain your assigned stance strictly; do not switch sides.`,
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

  extractPreviousMessageFromSameSpeaker(messages: Message[], currentAI: AI): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.senderType !== 'ai' || !message.content.trim()) continue;
      if (message.metadata?.aiId === currentAI.id || message.sender.startsWith(currentAI.name)) {
        return message.content;
      }
    }
    return undefined;
  }

  private getContextSnippet(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 520) return normalized;
    return `${normalized.slice(0, 517)}...`;
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
