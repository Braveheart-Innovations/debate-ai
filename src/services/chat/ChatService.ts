import { Message, AI } from '../../types';

export interface ConversationContext {
  messages: Message[];
  isDebateMode: boolean;
  lastSpeaker?: string;
  lastMessage?: string;
}

export class ChatService {
  /**
   * Creates a new user message with proper structure
   */
  static createUserMessage(
    content: string,
    mentions: string[] = []
  ): Message {
    return {
      id: `msg_${Date.now()}`,
      sender: 'You',
      senderType: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      mentions,
    };
  }

  /**
   * Creates a new AI message with proper structure
   */
  static createAIMessage(
    ai: AI,
    content: string,
    metadata?: { 
      modelUsed?: string; 
      responseTime?: number;
      citations?: Array<{
        index: number;
        url: string;
        title?: string;
        snippet?: string;
      }>;
      providerMetadata?: Record<string, unknown>;
    }
  ): Message {
    return {
      id: `msg_${Date.now()}_${ai.id}`,
      sender: ai.name,
      senderType: 'ai',
      content,
      timestamp: Date.now(),
      metadata: {
        // Always include providerId so adapters can remap roles in debate mode
        providerId: ai.provider,
        // Optional extras
        ...(metadata ? {
          modelUsed: metadata.modelUsed,
          responseTime: metadata.responseTime,
          citations: metadata.citations,
          providerMetadata: metadata.providerMetadata,
        } : {}),
      },
    };
  }

  /**
   * Creates an error message for AI failures
   */
  static createErrorMessage(
    ai: AI,
    error: Error | string
  ): Message {
    const errorMsg = error instanceof Error ? error.message : error;
    const content = errorMsg.includes('not configured') 
      ? `I'm not configured yet. Please add my API key in Settings → API Configuration.`
      : `Sorry, I encountered an error: ${errorMsg}`;

    return {
      id: `msg_${Date.now()}_${ai.id}_error`,
      sender: ai.name,
      senderType: 'ai',
      content,
      timestamp: Date.now(),
    };
  }

  /**
   * Determines which AIs should respond based on mentions and selection
   */
  /**
   * Builds conversation context for AI processing
   */
  static buildConversationContext(
    messages: Message[],
    userMessage: Message
  ): ConversationContext {
    const allMessages = [...messages, userMessage];
    const isDebateMode = allMessages.some(msg => 
      msg.content.includes('[DEBATE MODE]')
    );

    const lastAIMessage = allMessages
      .slice()
      .reverse()
      .find(msg => msg.senderType === 'ai');

    return {
      messages: allMessages,
      isDebateMode,
      lastSpeaker: lastAIMessage?.sender,
      lastMessage: lastAIMessage?.content,
    };
  }

  /**
   * Builds conversation context for round-robin responses
   */
  static buildRoundRobinContext(
    messages: Message[],
    newResponses: Message[]
  ): ConversationContext {
    const allMessages = [...messages, ...newResponses];
    const isDebateMode = allMessages.some(msg => 
      msg.content.includes('[DEBATE MODE]')
    );

    const lastMessage = allMessages[allMessages.length - 1];

    return {
      messages: allMessages,
      isDebateMode,
      lastSpeaker: lastMessage?.sender,
      lastMessage: lastMessage?.content,
    };
  }

  /**
   * Determines if an AI is the first to respond in this round
   */
  static isFirstAIInRound(
    conversationContext: ConversationContext
  ): boolean {
    const lastMessage = conversationContext.messages[
      conversationContext.messages.length - 1
    ];
    return lastMessage?.senderType === 'user';
  }

  /**
   * Validates message content
   */
  static validateMessageContent(content: string): {
    isValid: boolean;
    error?: string;
  } {
    if (!content || typeof content !== 'string') {
      return { isValid: false, error: 'Content must be a string' };
    }

    if (!content.trim()) {
      return { isValid: false, error: 'Content cannot be empty' };
    }

    if (content.length > 10000) {
      return { isValid: false, error: 'Content too long (max 10000 characters)' };
    }

    return { isValid: true };
  }

  /**
   * Calculates natural typing delay for AI responses
   */
  static calculateTypingDelay(): number {
    return 1500 + Math.random() * 1000; // 1.5-2.5 seconds
  }

  /**
   * Checks if current session has messages
   */
  static hasMessages(messages: Message[]): boolean {
    return messages && messages.length > 0;
  }

  /**
   * Gets the most recent user message
   */
  static getLastUserMessage(messages: Message[]): Message | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderType === 'user') {
        return messages[i];
      }
    }
    return null;
  }

  /**
   * Gets messages since the last user message
   */
  static getMessagesSinceLastUser(messages: Message[]): Message[] {
    const lastUserIndex = messages.map(m => m.senderType).lastIndexOf('user');
    if (lastUserIndex === -1) return [];
    return messages.slice(lastUserIndex + 1);
  }

  /**
   * Checks if debate mode is active in the conversation
   */
  static isDebateModeActive(messages: Message[]): boolean {
    return messages.some(msg => 
      msg.content.toLowerCase().includes('[debate mode]')
    );
  }
}
