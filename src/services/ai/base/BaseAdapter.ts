import { Message, MessageAttachment, RuntimePersonalityConfig } from '../../../types';
import { PersonalityOption } from '../../../config/personalities';
import {
  AIAdapterConfig,
  ResumptionContext,
  SendMessageResponse,
  FormattedMessage,
  AdapterCapabilities
} from '../types/adapter.types';
import { APIError } from '../../../errors/types/APIError';
import { getModelById, getSupportedParams, normalizeTemperatureForModel } from '../../../config/modelConfigs';
import { toneToModifiers, debateProfileToGuidance } from '@/lib/personality';
import { buildGroupChatContract, formatSpeakerLabel, USER_LABEL } from '@/lib/groupChat';

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

  /**
   * Sampling parameters sanitized against the model catalog: params listed in
   * the model's unsupportedParams are omitted, and temperature is clamped to
   * the provider/model range (e.g. Claude/Cohere cap at 1, requiresTemperature1
   * models lock to 1). Single choke point for chat, compare, and debate.
   */
  // max_tokens for a request: the configured value (or the caller's fallback),
  // raised to the model's minOutputTokens floor when it has one.
  protected resolveMaxTokens(modelId: string, fallback: number): number {
    const requested = this.config.parameters?.maxTokens || fallback;
    const floor = getModelById(this.config.provider, modelId)?.minOutputTokens ?? 0;
    return Math.max(requested, floor);
  }

  protected resolveSamplingParameters(modelId: string): {
    temperature?: number;
    topP?: number;
    topK?: number;
  } {
    const provider = this.config.provider;
    const providerParams = getSupportedParams(provider, modelId);
    // Unknown providers (e.g. mock) have no declared params; keep legacy behavior.
    const supported = new Set(
      providerParams.length ? providerParams : ['temperature', 'maxTokens', 'topP', 'topK']
    );

    const params: { temperature?: number; topP?: number; topK?: number } = {};
    if (supported.has('temperature')) {
      const temperature = normalizeTemperatureForModel(
        provider,
        modelId,
        this.config.parameters?.temperature ?? 0.7
      );
      if (temperature !== undefined) {
        params.temperature = temperature;
      }
    }
    if (supported.has('topP') && this.config.parameters?.topP !== undefined) {
      params.topP = this.config.parameters.topP;
    }
    if (supported.has('topK') && this.config.parameters?.topK !== undefined) {
      params.topK = this.config.parameters.topK;
    }
    return params;
  }

  protected getSystemPrompt(): string {
    const debateBase = 'You are participating in a structured debate. Take a clear position, follow the phase-specific instructions provided in user messages (Opening/Rebuttal/Closing), avoid headings/lists, and use concrete reasoning.';

    let basePrompt: string;

    // If both debate mode and personality are present, compose them so debates preserve persona style
    if (this.config.isDebateMode && this.config.personality && 'systemPrompt' in this.config.personality) {
      const persona = this.config.personality.systemPrompt || '';
      basePrompt = [debateBase, persona].filter(Boolean).join('\n');
    } else if (this.config.isDebateMode) {
      // Debate mode without explicit persona
      basePrompt = debateBase;
    } else if (this.config.personality && 'systemPrompt' in this.config.personality) {
      // Personality outside of debate
      basePrompt = this.config.personality.systemPrompt || 'You are a helpful AI assistant.';
    } else {
      // Default
      basePrompt = 'You are a helpful AI assistant.';
    }

    // Apply tone modifiers from personality customization
    const personality = this.config.personality;
    if (personality) {
      // Prefer the full tone (it carries energy); fall back to the base traits.
      const tone = personality.tone ?? { ...personality.traits, energy: 0.5 };
      const toneModifier = toneToModifiers(tone);
      if (toneModifier) {
        basePrompt = `${basePrompt}\n\n${toneModifier}`;
      }

      // In debate mode, also append debate profile guidance
      if (this.config.isDebateMode && personality.debateProfile) {
        const debateModifier = debateProfileToGuidance(personality.debateProfile);
        if (debateModifier) {
          basePrompt = `${basePrompt}\n${debateModifier}`;
        }
      }
    }

    const groupChat = this.config.groupChat;
    if (groupChat && !this.config.isDebateMode) {
      basePrompt = `${basePrompt}\n\n${buildGroupChatContract(groupChat)}`;
    }

    return basePrompt;
  }
  
  // Debug helper: expose the final system prompt (dev only)
  public debugGetSystemPrompt(): string {
    return this.getSystemPrompt();
  }
  
  setTemporaryPersonality(
    personality: RuntimePersonalityConfig | PersonalityOption | undefined | boolean
  ): void {
    if (typeof personality === 'boolean') {
      // Handle boolean for backwards compatibility
      return;
    }
    if (!personality || personality.id === 'default') {
      this.config.personality = undefined;
      return;
    }
    if ('traits' in personality) {
      // Already a runtime config (what PersonalityRuntimeBuilder produces for every turn).
      this.config.personality = personality;
      return;
    }

    // A raw PersonalityOption: convert, keeping the full tone and debate profile.
    const tone = personality.tone ?? { formality: 0.6, humor: 0.3, energy: 0.4, empathy: 0.6, technicality: 0.5 };
    this.config.personality = {
      id: personality.id,
      name: personality.name,
      description: personality.tagline || personality.description,
      systemPrompt: personality.systemPrompt,
      traits: {
        formality: tone.formality,
        humor: tone.humor,
        technicality: tone.technicality,
        empathy: tone.empathy,
      },
      tone,
      debateProfile: personality.debateProfile,
      isPremium: false,
    };
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

    // Failed/interrupted turns are not real answers; don't let "Sorry, I encountered an error"
    // or a half-finished reply masquerade as conversation.
    const recent = history
      .filter((msg) => msg.metadata?.lifecycle === undefined)
      .slice(-10);

    // Speaker attribution: the target adapter sees a single assistant (itself); every other AI's
    // output becomes labeled user content. Without this, a model reads another AI's reply as its
    // own words (and critiques of that reply as aimed at itself). Same-role runs are merged below.
    const providerId = this.config.provider;
    const identityId = this.config.identityId || providerId;
    const labelUser = !!this.config.groupChat && !this.config.isDebateMode;

    const mapped: FormattedMessage[] = recent
      .map((msg) => {
        if (msg.senderType === 'user') {
          const content = msg.content || '';
          return {
            role: 'user' as const,
            content: labelUser && content ? formatSpeakerLabel(USER_LABEL, content) : content,
          };
        }
        const msgIdentity = msg.metadata?.aiId;
        const msgProvider = msg.metadata?.providerId;
        const isOwnMessage = msgIdentity !== undefined
          ? msgIdentity === identityId
          : msgProvider === providerId;
        if (isOwnMessage) {
          return { role: 'assistant' as const, content: msg.content || '' };
        }
        const speaker = msg.sender || 'Other AI';
        return { role: 'user' as const, content: msg.content ? formatSpeakerLabel(speaker, msg.content) : '' };
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

    throw APIError.fromHttpStatus(response.status, provider, errorMessage);
  }
}
