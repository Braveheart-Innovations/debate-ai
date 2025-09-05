import { Message, MessageAttachment, PersonalityConfig } from '../../../types';
import { PersonalityOption } from '../../../config/personalities';
import { 
  AIAdapterConfig, 
  ResumptionContext, 
  SendMessageResponse,
  FormattedMessage,
  AdapterCapabilities 
} from '../types/adapter.types';

export abstract class BaseAdapter {
  public config: AIAdapterConfig;
  
  constructor(config: AIAdapterConfig) {
    this.config = config;
  }
  
  abstract sendMessage(
    message: string,
    conversationHistory?: Message[],
    resumptionContext?: ResumptionContext,
    attachments?: MessageAttachment[],
    modelOverride?: string
  ): Promise<SendMessageResponse>;
  
  abstract getCapabilities(): AdapterCapabilities;
  
  protected getSystemPrompt(): string {
    if (this.config.isDebateMode) {
      return 'You are participating in a lively debate. Take strong positions, directly address and challenge the previous speaker\'s arguments, and make compelling points. Be respectful but assertive. Build on or refute what was just said. Provide substantive arguments with examples, reasoning, or evidence. Aim for responses that are engaging and thought-provoking (3-5 sentences).';
    }
    if (this.config.personality) {
      if (typeof this.config.personality === 'object' && 'systemPrompt' in this.config.personality) {
        return this.config.personality.systemPrompt;
      }
    }
    return 'You are a helpful AI assistant.';
  }
  
  setTemporaryPersonality(personality: PersonalityConfig | PersonalityOption | undefined | boolean): void {
    if (typeof personality === 'boolean') {
      // Handle boolean for backwards compatibility
      return;
    }
    if (!personality) {
      this.config.personality = undefined;
      return;
    }
    // Convert PersonalityOption to PersonalityConfig if needed
    if ('systemPrompt' in personality) {
      this.config.personality = personality as PersonalityConfig;
    } else {
      // PersonalityOption - create a basic PersonalityConfig
      const option = personality as PersonalityOption;
      this.config.personality = {
        id: option.id,
        name: option.name,
        description: option.description,
        systemPrompt: `You are ${option.name}: ${option.description}`,
        traits: { formality: 0.5, humor: 0.5, technicality: 0.5, empathy: 0.5 },
        isPremium: false,
      };
    }
  }
  
  protected formatHistory(
    history: Message[], 
    resumptionContext?: ResumptionContext
  ): FormattedMessage[] {
    const formattedMessages: FormattedMessage[] = [];

    // Include a concise resumption hint as a user note to keep alternation valid
    if (resumptionContext?.isResuming && resumptionContext.originalPrompt) {
      const originalContent = resumptionContext.originalPrompt.content || '';
      formattedMessages.push({
        role: 'user',
        content: `[Continuation note] Previously started with: "${originalContent.substring(0, 100)}${originalContent.length > 100 ? '...' : ''}"`
      });
    }

    const recent = history.slice(-10);

    // In debate mode, remap roles so the target adapter sees a single assistant (itself)
    // and everything else as user content, then enforce alternation by merging same-role runs.
    const debateMode = !!this.config.isDebateMode;
    const providerId = this.config.provider;

    const mapped: FormattedMessage[] = recent
      .map((msg) => {
        if (msg.senderType === 'user') {
          return { role: 'user' as const, content: msg.content || '' };
        }
        // senderType === 'ai'
        if (debateMode) {
          const msgProvider = msg.metadata?.providerId;
          if (msgProvider && msgProvider === providerId) {
            // This adapter's own prior outputs remain assistant
            return { role: 'assistant' as const, content: msg.content || '' };
          }
          // Other AI outputs become user content with attribution
          const speaker = msg.sender || 'Other AI';
          return { role: 'user' as const, content: `[${speaker}] ${msg.content || ''}` };
        }
        // Non-debate: default mapping
        return { role: 'assistant' as const, content: msg.content || '' };
      })
      .filter((m) => !!m.content);

    // Merge consecutive messages with the same role to satisfy strict alternation rules.
    const merged: FormattedMessage[] = [];
    for (const m of [...formattedMessages, ...mapped]) {
      const last = merged[merged.length - 1];
      if (last && last.role === m.role) {
        const lastContent = typeof last.content === 'string' ? last.content : '';
        const nextContent = typeof m.content === 'string' ? m.content : '';
        last.content = [lastContent, nextContent].filter(Boolean).join('\n\n');
      } else {
        merged.push({ role: m.role, content: m.content });
      }
    }

    return merged;
  }
  
  protected async handleApiError(response: Response, provider: string): Promise<never> {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || 
                        errorData.message || 
                        response.statusText || 
                        'Unknown error';
    
    throw new Error(`${provider} API error (${response.status}): ${errorMessage}`);
  }
}
