import { Message, AI } from '../../types';
import { PersonalityOption } from '../../config/personalities';

export interface PromptContext {
  isFirstAI: boolean;
  isDebateMode: boolean;
  lastSpeaker?: string;
  lastMessage?: string;
  conversationHistory: Message[];
  mentions: string[];
}

export interface EnrichedPrompt {
  userVisiblePrompt: string;
  aiProcessingPrompt: string;
  hasPersonality: boolean;
  hasDebateMode: boolean;
}

export class PromptBuilder {
  /**
   * Builds the main prompt for AI processing based on context
   */
  static buildAIPrompt(
    userMessage: string,
    context: PromptContext,
    ai: AI,
    personality?: PersonalityOption
  ): string {
    const { isFirstAI, isDebateMode, lastSpeaker, lastMessage } = context;

    let prompt: string;

    if (isFirstAI) {
      // First AI responds directly to user
      prompt = userMessage;
    } else {
      // Subsequent AIs engage with previous AI response
      prompt = this.buildRoundRobinPrompt(lastSpeaker!, lastMessage!);
    }

    // Apply debate mode modifications if active
    if (isDebateMode) {
      prompt = this.applyDebateMode(prompt, ai, context);
    }

    // Layer persona guidance after debate framing so it stays closest to the actionable instructions
    if (personality) {
      const mode: 'chat' | 'debate' | 'compare' = isDebateMode ? 'debate' : 'chat';
      prompt = this.appendPersonaGuidance(prompt, personality, mode);
    }

    return prompt;
  }

  /**
   * Builds enriched prompt for Quick Start feature
   */
  static buildEnrichedPrompt(
    userPrompt: string,
    aiPrompt: string,
    personality?: PersonalityOption,
    isDebateMode: boolean = false
  ): EnrichedPrompt {
    let enrichedPrompt = aiPrompt;

    if (personality) {
      const mode: 'chat' | 'debate' | 'compare' = isDebateMode ? 'debate' : 'chat';
      enrichedPrompt = this.appendPersonaGuidance(enrichedPrompt, personality, mode);
    }

    return {
      userVisiblePrompt: userPrompt,
      aiProcessingPrompt: enrichedPrompt,
      hasPersonality: !!personality,
      hasDebateMode: isDebateMode
    };
  }

  /**
   * Appends persona-specific guidance to a prompt without re-stating the full system prompt
   */
  static appendPersonaGuidance(
    prompt: string,
    personality: PersonalityOption,
    mode: 'chat' | 'debate' | 'compare' = 'chat'
  ): string {
    if (personality.id === 'default') {
      return prompt;
    }

    const guidance =
      (mode === 'debate' ? personality.debateGuidance : undefined) ||
      (mode === 'compare' ? personality.compareGuidance : undefined) ||
      personality.chatGuidance;

    const signature = personality.signatureMoves?.[0];
    const reminder = guidance || signature;

    if (!reminder) {
      return prompt;
    }

    return `${prompt}\n\nPersona focus: ${reminder}`;
  }

  /**
   * Builds round-robin prompt for AI-to-AI conversation
   */
  static buildRoundRobinPrompt(
    lastSpeaker: string,
    lastMessage: string
  ): string {
    return `You are in a multi-AI conversation. ${lastSpeaker} just responded to the user's message.

${lastSpeaker} said: "${lastMessage}"

Please respond to ${lastSpeaker}'s comment above. You can agree, disagree, add new perspectives, or take the conversation in a new direction. Do NOT respond directly to the original user message - respond to what ${lastSpeaker} just said.`;
  }

  /**
   * Applies debate mode modifications to prompt
   */
  static applyDebateMode(
    prompt: string,
    ai: AI,
    context: PromptContext
  ): string {
    const { conversationHistory, isFirstAI } = context;
    
    const debateContext = isFirstAI 
      ? this.buildInitialDebateContext(conversationHistory)
      : this.buildOngoingDebateContext(conversationHistory);

    return `[DEBATE MODE ACTIVE]

${debateContext}

Your role: Engage in this debate as ${ai.name}. Present strong arguments, challenge opposing viewpoints respectfully, and support your position with reasoning.

${prompt}`;
  }

  /**
   * Builds context for initial debate response
   */
  private static buildInitialDebateContext(history: Message[]): string {
    if (history.length === 0) return 'Beginning a new debate.';

    const recentMessages = history.slice(-3);
    const context = recentMessages
      .map(msg => `${msg.sender}: ${msg.content}`)
      .join('\n');

    return `Recent context:\n${context}\n`;
  }

  /**
   * Builds context for ongoing debate response
   */
  private static buildOngoingDebateContext(history: Message[]): string {
    const debateMessages = history.filter(msg => 
      msg.content.includes('[DEBATE MODE]') || msg.senderType === 'ai'
    );

    if (debateMessages.length === 0) return 'Debate in progress.';

    const recentDebate = debateMessages.slice(-5);
    const context = recentDebate
      .map(msg => `${msg.sender}: ${msg.content.replace('[DEBATE MODE]', '').trim()}`)
      .join('\n');

    return `Debate context:\n${context}\n`;
  }

  /**
   * Builds mention-specific prompt
   */
  static buildMentionPrompt(
    originalPrompt: string,
    mentionedAI: string,
    personality?: PersonalityOption
  ): string {
    const mentionPrompt = `You (${mentionedAI}) were specifically mentioned in this message. Please respond directly:

${originalPrompt}`;

    if (personality) {
      return this.appendPersonaGuidance(mentionPrompt, personality, 'chat');
    }

    return mentionPrompt;
  }

  /**
   * Builds context summary for long conversations
   */
  static buildContextSummary(
    messages: Message[],
    maxMessages: number = 10
  ): string {
    if (messages.length <= maxMessages) {
      return messages
        .map(msg => `${msg.sender}: ${msg.content}`)
        .join('\n');
    }

    // Include first few and last few messages
    const firstMessages = messages.slice(0, 3);
    const lastMessages = messages.slice(-5);
    
    const firstPart = firstMessages
      .map(msg => `${msg.sender}: ${msg.content}`)
      .join('\n');
      
    const lastPart = lastMessages
      .map(msg => `${msg.sender}: ${msg.content}`)
      .join('\n');

    return `${firstPart}\n\n[... ${messages.length - 8} messages ...]\n\n${lastPart}`;
  }

  /**
   * Validates prompt length and content
   */
  static validatePrompt(prompt: string): {
    isValid: boolean;
    warnings: string[];
    estimatedTokens: number;
  } {
    const warnings: string[] = [];
    
    // Rough token estimation (1 token ≈ 4 characters)
    const estimatedTokens = Math.ceil(prompt.length / 4);
    
    if (prompt.length === 0) {
      return {
        isValid: false,
        warnings: ['Empty prompt'],
        estimatedTokens: 0
      };
    }

    if (prompt.length > 32000) {
      warnings.push('Prompt very long, may hit token limits');
    }

    if (estimatedTokens > 4000) {
      warnings.push(`Estimated ${estimatedTokens} tokens, consider shortening`);
    }

    // Check for potential issues
    const newlineCount = (prompt.match(/\n/g) || []).length;
    if (newlineCount > 100) {
      warnings.push('Many line breaks, consider formatting');
    }

    return {
      isValid: true,
      warnings,
      estimatedTokens
    };
  }

  /**
   * Formats conversation history for AI context
   */
  static formatConversationHistory(
    messages: Message[],
    options: {
      includeTimestamps?: boolean;
      maxMessages?: number;
      excludeUser?: boolean;
    } = {}
  ): string {
    const {
      includeTimestamps = false,
      maxMessages = 50,
      excludeUser = false
    } = options;

    let relevantMessages = messages;

    if (excludeUser) {
      relevantMessages = messages.filter(m => m.senderType !== 'user');
    }

    if (maxMessages && relevantMessages.length > maxMessages) {
      relevantMessages = relevantMessages.slice(-maxMessages);
    }

    return relevantMessages
      .map(msg => {
        const timePrefix = includeTimestamps 
          ? `[${new Date(msg.timestamp).toLocaleTimeString()}] `
          : '';
        return `${timePrefix}${msg.sender}: ${msg.content}`;
      })
      .join('\n');
  }

  /**
   * Builds system prompt for specific AI provider
   */
  static buildSystemPrompt(
    ai: AI,
    personality?: PersonalityOption,
    isDebateMode: boolean = false
  ): string {
    let systemPrompt = `You are ${ai.name}, an AI assistant participating in a conversation.`;

    if (personality) {
      systemPrompt = personality.systemPrompt;
      
      if (isDebateMode && personality.debatePrompt) {
        systemPrompt += `\n\nDebate Style: ${personality.debatePrompt}`;
      }
    }

    if (isDebateMode && !personality?.debatePrompt) {
      systemPrompt += '\n\nYou are in debate mode. Present clear arguments and engage thoughtfully with opposing viewpoints.';
    }

    return systemPrompt;
  }

  /**
   * Extracts key information from user prompt
   */
  static analyzePrompt(prompt: string): {
    hasQuestions: boolean;
    hasMentions: boolean;
    isDebateStart: boolean;
    topics: string[];
    urgency: 'low' | 'medium' | 'high';
    estimatedComplexity: 'simple' | 'moderate' | 'complex';
  } {
    const hasQuestions = /\?/.test(prompt);
    const hasMentions = /@\w+/.test(prompt);
    const isDebateStart = /debate|argue|discuss|opinion/i.test(prompt);
    
    // Simple topic extraction (could be enhanced with NLP)
    const topics = prompt
      .toLowerCase()
      .split(/[.!?;,]/)
      .map(s => s.trim())
      .filter(s => s.length > 3);

    // Urgency based on keywords and punctuation
    const urgentKeywords = /urgent|asap|immediately|quickly|now/i;
    const hasExclamation = /!/.test(prompt);
    const urgency = urgentKeywords.test(prompt) || hasExclamation ? 'high' : 
                    hasQuestions ? 'medium' : 'low';

    // Complexity based on length and structure
    const wordCount = prompt.split(/\s+/).length;
    const estimatedComplexity = wordCount > 50 ? 'complex' :
                               wordCount > 15 ? 'moderate' : 'simple';

    return {
      hasQuestions,
      hasMentions,
      isDebateStart,
      topics,
      urgency,
      estimatedComplexity
    };
  }
}
